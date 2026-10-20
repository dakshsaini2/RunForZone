# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
BGMI Zone Predictor — Accuracy Evaluation on Random Erangel Maps
================================================================

Generates N random Erangel match configurations (random flight paths +
Phase 1 safe zones), then creates ground-truth zone sequences (Phases 2-5)
using the same synthetic generation logic as the training pipeline.

For each match the trained XGBoost models predict Phases 2-5 sequentially.
The script then measures prediction accuracy vs ground-truth and reports
comprehensive per-phase and aggregate metrics:

  * Euclidean MAE / RMSE / Median / P90 (in meters)
  * Containment rate (does predicted circle stay inside parent?)
  * Distance error as a percentage of max allowed shift
  * Angle error (degrees)

Usage:
    python evaluate_accuracy.py                     # 500 random maps, default settings
    python evaluate_accuracy.py --num-maps 1000     # more maps for tighter estimates
    python evaluate_accuracy.py --seed 123          # reproducible run
"""

import os
import sys
import math
import time
import argparse
import warnings
from typing import Dict, List, Tuple, Any

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning)

# ── Project-local imports ──
from telemetry_parser import (
    DEFAULT_PHASE_RADII,
    MAP_DIMENSION_UNITS,
    compute_point_to_line_distance,
)
from zone_predictor_engine import ZonePredictorEngine

UNITS_PER_METER = 100.0
MAP_CENTER = 400000.0


# ═══════════════════════════════════════════════════════════════════════════════
# Random Erangel Match Generator
# ═══════════════════════════════════════════════════════════════════════════════


def generate_random_erangel_matches(
    num_matches: int = 500,
    seed: int = 2024,
) -> List[Dict[str, Any]]:
    """
    Creates `num_matches` random but physically-valid Erangel match
    configurations:
      - Random flight path vector across the 800,000-unit island
      - Random Phase 1 safe zone center (within valid bounds)
      - Sequentially generated Phase 2-5 ground-truth circles
        (each strictly contained inside the parent circle)
    """
    rng = np.random.RandomState(seed)
    matches = []

    for i in range(num_matches):
        # ── Flight Path ──
        flight_angle_rad = rng.uniform(0, 2 * math.pi)
        flight_len = rng.uniform(500000, 750000)
        cx = MAP_CENTER + rng.normal(0, 40000)
        cy = MAP_CENTER + rng.normal(0, 40000)

        fx1 = float(np.clip(cx - (flight_len / 2) * math.cos(flight_angle_rad), 50000, 750000))
        fy1 = float(np.clip(cy - (flight_len / 2) * math.sin(flight_angle_rad), 50000, 750000))
        fx2 = float(np.clip(cx + (flight_len / 2) * math.cos(flight_angle_rad), 50000, 750000))
        fy2 = float(np.clip(cy + (flight_len / 2) * math.sin(flight_angle_rad), 50000, 750000))

        # ── Phase 1 Safe Zone ──
        p1_r = DEFAULT_PHASE_RADII[1]
        p1_x = float(rng.uniform(p1_r, MAP_DIMENSION_UNITS - p1_r))
        p1_y = float(rng.uniform(p1_r, MAP_DIMENSION_UNITS - p1_r))

        phases_gt: Dict[int, Dict[str, float]] = {
            1: {"x": p1_x, "y": p1_y, "r": p1_r}
        }

        # ── Sequential Phase 2-5 (Ground Truth) ──
        for n in range(1, 5):
            curr = phases_gt[n]
            next_r = DEFAULT_PHASE_RADII[n + 1]
            max_offset = curr["r"] - next_r

            shift_mag = rng.uniform(0.2, 0.95) * max_offset
            shift_ang = rng.uniform(0, 2 * math.pi)

            next_x = curr["x"] + shift_mag * math.cos(shift_ang)
            next_y = curr["y"] + shift_mag * math.sin(shift_ang)
            phases_gt[n + 1] = {"x": float(next_x), "y": float(next_y), "r": float(next_r)}

        matches.append({
            "match_idx": i,
            "flight_start": (fx1, fy1),
            "flight_end": (fx2, fy2),
            "phases_gt": phases_gt,
        })

    return matches


# ═══════════════════════════════════════════════════════════════════════════════
# Accuracy Computation
# ═══════════════════════════════════════════════════════════════════════════════


def evaluate_single_match(
    engine: ZonePredictorEngine,
    match: Dict[str, Any],
) -> List[Dict[str, float]]:
    """
    Runs the engine on one match and returns per-phase-transition error records.
    """
    gt = match["phases_gt"]

    result = engine.predict_sequential_phases(
        flight_start=match["flight_start"],
        flight_end=match["flight_end"],
        phase_1_center=(gt[1]["x"], gt[1]["y"]),
        phase_1_radius=gt[1]["r"],
        target_phases=5,
    )

    pred_phases = result["phases"]
    records = []

    for n in range(2, 6):
        if n not in gt or n not in pred_phases:
            continue

        gt_x, gt_y, gt_r = gt[n]["x"], gt[n]["y"], gt[n]["r"]
        pr_x, pr_y = pred_phases[n]["x"], pred_phases[n]["y"]

        # Euclidean error in game units -> meters
        euc_err_units = math.hypot(pr_x - gt_x, pr_y - gt_y)
        euc_err_meters = euc_err_units / UNITS_PER_METER

        # Directional error
        gt_dx = gt_x - gt[n - 1]["x"] if (n - 1) in gt else 0
        gt_dy = gt_y - gt[n - 1]["y"] if (n - 1) in gt else 0
        pr_dx = pr_x - pred_phases[n - 1]["x"] if (n - 1) in pred_phases else 0
        pr_dy = pr_y - pred_phases[n - 1]["y"] if (n - 1) in pred_phases else 0

        gt_angle = math.degrees(math.atan2(gt_dy, gt_dx)) % 360.0
        pr_angle = math.degrees(math.atan2(pr_dy, pr_dx)) % 360.0
        angle_diff = abs(gt_angle - pr_angle) % 360.0
        angle_err = min(angle_diff, 360.0 - angle_diff)

        # Distance magnitudes
        gt_dist = math.hypot(gt_dx, gt_dy)
        pr_dist = math.hypot(pr_dx, pr_dy)
        dist_err_meters = abs(gt_dist - pr_dist) / UNITS_PER_METER

        # Containment check: is prediction inside the parent circle?
        parent = gt[n - 1] if (n - 1) in gt else gt[1]
        dist_from_parent = math.hypot(pr_x - parent["x"], pr_y - parent["y"])
        is_contained = (dist_from_parent + gt_r) <= (parent["r"] + 500)  # small tolerance

        # Error as fraction of max shift
        max_shift = max(1.0, parent["r"] - gt_r)
        relative_err = euc_err_units / max_shift

        records.append({
            "phase": n,
            "euc_err_meters": euc_err_meters,
            "dist_err_meters": dist_err_meters,
            "angle_err_deg": angle_err,
            "is_contained": 1.0 if is_contained else 0.0,
            "relative_err": relative_err,
            "gt_x": gt_x,
            "gt_y": gt_y,
            "pr_x": pr_x,
            "pr_y": pr_y,
        })

    return records


def evaluate_single_match_non_cascading(
    engine: ZonePredictorEngine,
    match: Dict[str, Any],
) -> List[Dict[str, float]]:
    """
    Non-cascading (oracle) evaluation: for each phase transition N->N+1,
    feeds the GROUND-TRUTH Phase N center (not the model's prediction from
    the previous step). This isolates each phase model's accuracy from
    error propagation.
    """
    gt = match["phases_gt"]
    fx1, fy1 = match["flight_start"]
    fx2, fy2 = match["flight_end"]
    fdx = fx2 - fx1
    fdy = fy2 - fy1
    flight_angle = math.degrees(math.atan2(fdy, fdx)) % 360.0

    records = []

    prev_dx = 0.0
    prev_dy = 0.0
    prev_dist = 0.0
    prev_angle = 0.0

    for n in range(1, 5):
        if n not in gt or (n + 1) not in gt:
            continue

        # Use ground-truth Phase N as input (non-cascading)
        cx, cy, cr = gt[n]["x"], gt[n]["y"], gt[n]["r"]
        next_r = DEFAULT_PHASE_RADII.get(n + 1, cr * 0.5)
        max_shift = max(1.0, cr - next_r)

        dist_to_flight, side_sign = compute_point_to_line_distance(cx, cy, fx1, fy1, fx2, fy2)
        relative_flight_angle = (prev_angle - flight_angle) % 360.0

        dx_c = cx - MAP_CENTER
        dy_c = cy - MAP_CENTER
        dist_map_c = math.hypot(dx_c, dy_c)
        angle_map_c = math.degrees(math.atan2(dy_c, dx_c)) % 360.0

        flight_rad = math.radians(flight_angle)
        prev_angle_rad = math.radians(prev_angle)

        feat_dict = {
            "curr_x": cx, "curr_y": cy, "curr_r": cr, "next_r": next_r,
            "max_shift_allowed": max_shift,
            "dist_to_map_center": dist_map_c,
            "angle_to_map_center_deg": angle_map_c,
            "norm_dist_to_map_center": dist_map_c / 400000.0,
            "dist_to_flight": dist_to_flight,
            "flight_side_sign": side_sign,
            "flight_angle_deg": flight_angle,
            "flight_angle_sin": math.sin(flight_rad),
            "flight_angle_cos": math.cos(flight_rad),
            "relative_flight_angle": relative_flight_angle,
            "prev_delta_x": prev_dx, "prev_delta_y": prev_dy,
            "prev_shift_dist": prev_dist,
            "prev_shift_angle": prev_angle,
            "prev_shift_angle_sin": math.sin(prev_angle_rad),
            "prev_shift_angle_cos": math.cos(prev_angle_rad),
            "prev_relative_flight_angle": (prev_angle - flight_angle) % 360.0,
        }

        feat_df = pd.DataFrame([feat_dict])

        # Predict using same logic as engine
        if n in engine.models_dist and n in engine.models_angle:
            pred_dist_val = float(engine.models_dist[n].predict(feat_df)[0])
            pred_angle_val = float(engine.models_angle[n].predict(feat_df)[0]) % 360.0
            pred_dx = pred_dist_val * math.cos(math.radians(pred_angle_val))
            pred_dy = pred_dist_val * math.sin(math.radians(pred_angle_val))
        elif n in engine.models_dx and n in engine.models_dy:
            pred_dx = float(engine.models_dx[n].predict(feat_df)[0])
            pred_dy = float(engine.models_dy[n].predict(feat_df)[0])
        else:
            continue

        raw_x = cx + pred_dx
        raw_y = cy + pred_dy

        # Apply containment + terrain
        contained_x, contained_y = engine.enforce_containment(cx, cy, cr, raw_x, raw_y, next_r)
        land_x, land_y = engine.reproject_to_nearest_land(contained_x, contained_y)
        final_x, final_y = engine.enforce_containment(cx, cy, cr, land_x, land_y, next_r)

        # Ground truth
        gt_x, gt_y = gt[n + 1]["x"], gt[n + 1]["y"]
        gt_r = gt[n + 1]["r"]

        euc_err_units = math.hypot(final_x - gt_x, final_y - gt_y)
        euc_err_meters = euc_err_units / UNITS_PER_METER

        gt_delta_x = gt_x - cx
        gt_delta_y = gt_y - cy
        gt_shift_angle = math.degrees(math.atan2(gt_delta_y, gt_delta_x)) % 360.0
        pr_shift_angle = math.degrees(math.atan2(final_y - cy, final_x - cx)) % 360.0
        angle_diff = abs(gt_shift_angle - pr_shift_angle) % 360.0
        angle_err = min(angle_diff, 360.0 - angle_diff)

        gt_shift_dist = math.hypot(gt_delta_x, gt_delta_y)
        pr_shift_dist = math.hypot(final_x - cx, final_y - cy)
        dist_err_meters = abs(gt_shift_dist - pr_shift_dist) / UNITS_PER_METER

        dist_from_parent = math.hypot(final_x - cx, final_y - cy)
        is_contained = (dist_from_parent + next_r) <= (cr + 500)

        relative_err = euc_err_units / max_shift

        records.append({
            "phase": n + 1,
            "euc_err_meters": euc_err_meters,
            "dist_err_meters": dist_err_meters,
            "angle_err_deg": angle_err,
            "is_contained": 1.0 if is_contained else 0.0,
            "relative_err": relative_err,
            "gt_x": gt_x, "gt_y": gt_y,
            "pr_x": final_x, "pr_y": final_y,
        })

        # Update lag features with GROUND TRUTH shifts (non-cascading)
        prev_dx = gt_delta_x
        prev_dy = gt_delta_y
        prev_dist = gt_shift_dist
        prev_angle = gt_shift_angle

    return records


# ==============================================================================
# Report Formatting
# ==============================================================================


def print_accuracy_report(df: pd.DataFrame, total_maps: int, elapsed: float) -> None:
    """Pretty-prints per-phase and aggregate accuracy metrics."""

    sep = "=" * 100
    thin = "-" * 100

    print(f"\n{sep}")
    print("    BGMI ZONE PREDICTOR -- ACCURACY EVALUATION ON RANDOM ERANGEL MAPS")
    print(sep)
    print(f"    Total Random Maps Evaluated : {total_maps}")
    print(f"    Total Phase Transitions     : {len(df)}")
    print(f"    Wall-Clock Time             : {elapsed:.2f}s")
    print(f"    Avg Inference Per Map        : {elapsed / max(1, total_maps) * 1000:.1f} ms")
    print(thin)

    header = (
        f"  {'Phase':<10} | {'N':>5} | {'Euclid MAE':>12} | {'Euclid Med':>12} | "
        f"{'Euclid P90':>12} | {'Euclid RMSE':>12} | {'Dist MAE':>10} | "
        f"{'Angle MAE':>10} | {'Contain%':>9} | {'RelErr%':>8}"
    )
    print(header)
    print(thin)

    agg_rows = []

    for phase in sorted(df["phase"].unique()):
        ph = df[df["phase"] == phase]
        euc = ph["euc_err_meters"]
        n = len(ph)

        mae = euc.mean()
        median = euc.median()
        p90 = euc.quantile(0.90)
        rmse = np.sqrt((euc ** 2).mean())
        dist_mae = ph["dist_err_meters"].mean()
        angle_mae = ph["angle_err_deg"].mean()
        contain = ph["is_contained"].mean() * 100
        rel_err = ph["relative_err"].mean() * 100

        print(
            f"  P{phase-1}->P{phase}     | {n:>5} | {mae:>9.2f} m  | {median:>9.2f} m  | "
            f"{p90:>9.2f} m  | {rmse:>9.2f} m  | {dist_mae:>7.2f} m  | "
            f"{angle_mae:>7.2f}deg | {contain:>7.1f}%  | {rel_err:>6.1f}%"
        )
        agg_rows.append({
            "phase": phase,
            "n": n,
            "mae": mae,
            "median": median,
            "p90": p90,
            "rmse": rmse,
            "dist_mae": dist_mae,
            "angle_mae": angle_mae,
            "contain": contain,
            "rel_err": rel_err,
        })

    print(thin)

    # Aggregate
    all_euc = df["euc_err_meters"]
    print(
        f"  {'OVERALL':<10} | {len(df):>5} | {all_euc.mean():>9.2f} m  | {all_euc.median():>9.2f} m  | "
        f"{all_euc.quantile(0.90):>9.2f} m  | {np.sqrt((all_euc**2).mean()):>9.2f} m  | "
        f"{df['dist_err_meters'].mean():>7.2f} m  | {df['angle_err_deg'].mean():>7.2f}deg | "
        f"{df['is_contained'].mean() * 100:>7.1f}%  | {df['relative_err'].mean() * 100:>6.1f}%"
    )
    print(sep)

    # Interpretation
    overall_mae = all_euc.mean()
    print("\n  INTERPRETATION:")
    if overall_mae < 200:
        print(f"  [OK] Excellent -- Average prediction within {overall_mae:.0f}m of true zone center.")
    elif overall_mae < 400:
        print(f"  [OK] Good -- Average prediction within {overall_mae:.0f}m of true zone center.")
    elif overall_mae < 600:
        print(f"  [!!] Moderate -- Average prediction {overall_mae:.0f}m off. Consider more training data.")
    else:
        print(f"  [XX] Poor -- Average prediction {overall_mae:.0f}m off. Model needs improvement.")

    contain_pct = df["is_contained"].mean() * 100
    status_tag = "[OK]" if contain_pct > 90 else "[!!]"
    print(f"  {status_tag} Containment Rate: {contain_pct:.1f}% of predictions stay inside parent circle.")

    # Per-phase summary
    print("\n  PER-PHASE ACCURACY SUMMARY:")
    for row in agg_rows:
        phase = row["phase"]
        phase_r_m = DEFAULT_PHASE_RADII.get(phase, 0) / UNITS_PER_METER
        accuracy_pct = max(0, (1 - row["mae"] / max(1, phase_r_m)) * 100)
        print(
            f"    Phase {phase} (radius ~{phase_r_m:.0f}m): "
            f"MAE={row['mae']:.1f}m | "
            f"Accuracy~{accuracy_pct:.1f}% | "
            f"90th-percentile={row['p90']:.1f}m"
        )

    print(f"\n{sep}\n")

    return agg_rows


# ==============================================================================
# Main
# ==============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate zone predictor accuracy on randomly generated Erangel maps."
    )
    parser.add_argument(
        "--num-maps", "-n", type=int, default=500,
        help="Number of random Erangel maps to evaluate (default: 500)"
    )
    parser.add_argument(
        "--seed", type=int, default=2024,
        help="Random seed for reproducibility (default: 2024)"
    )
    parser.add_argument(
        "--model-dir", type=str, default="models",
        help="Directory containing trained XGBoost models (default: models/)"
    )
    parser.add_argument(
        "--terrain-mask", type=str, default="data/masks/erangel_mask.png",
        help="Path to Erangel terrain mask (default: data/masks/erangel_mask.png)"
    )
    parser.add_argument(
        "--output-csv", type=str, default="outputs/accuracy_evaluation.csv",
        help="Path to save detailed per-prediction results CSV"
    )
    args = parser.parse_args()

    print("=" * 100)
    print("  BGMI ZONE PREDICTOR -- RANDOM ERANGEL MAP ACCURACY EVALUATION")
    print("=" * 100)

    # 1. Generate random matches
    print(f"\n[1/4] Generating {args.num_maps} random Erangel match configurations (seed={args.seed})...")
    matches = generate_random_erangel_matches(
        num_matches=args.num_maps,
        seed=args.seed,
    )
    print(f"      Generated {len(matches)} matches with ground-truth Phase 1-5 circles.\n")

    # 2. Load engine
    print(f"[2/4] Loading ZonePredictorEngine (model_dir={args.model_dir})...")
    engine = ZonePredictorEngine(
        model_dir=args.model_dir,
        terrain_mask_path=args.terrain_mask,
    )
    print("      Engine loaded successfully.\n")

    # 3. Cascading (end-to-end) evaluation
    print(f"[3/4] CASCADING evaluation (chained predictions, real-world scenario)...")
    all_cascading = []
    start_time = time.perf_counter()

    for idx, match in enumerate(matches):
        records = evaluate_single_match(engine, match)
        all_cascading.extend(records)

        if (idx + 1) % 100 == 0:
            elapsed = time.perf_counter() - start_time
            print(f"      Evaluated {idx + 1}/{len(matches)} maps ({elapsed:.1f}s elapsed)...")

    elapsed_cascading = time.perf_counter() - start_time
    cascading_df = pd.DataFrame(all_cascading)

    # Save detailed CSV
    os.makedirs(os.path.dirname(args.output_csv) or ".", exist_ok=True)
    cascading_df.to_csv(args.output_csv, index=False)
    print(f"\n      Cascading results saved -> {args.output_csv}")

    print("\n" + "=" * 100)
    print("  MODE A: CASCADING (End-to-End) -- Predictions chain from P1 -> P2 -> P3 -> P4 -> P5")
    print("  (Errors compound: each phase uses the PREVIOUS PREDICTION as input)")
    print("=" * 100)
    print_accuracy_report(cascading_df, len(matches), elapsed_cascading)

    # 4. Non-cascading (oracle) evaluation
    print(f"[4/4] NON-CASCADING evaluation (ground-truth input, per-phase model accuracy)...")
    all_oracle = []
    start_time = time.perf_counter()

    for idx, match in enumerate(matches):
        records = evaluate_single_match_non_cascading(engine, match)
        all_oracle.extend(records)

        if (idx + 1) % 100 == 0:
            elapsed = time.perf_counter() - start_time
            print(f"      Evaluated {idx + 1}/{len(matches)} maps ({elapsed:.1f}s elapsed)...")

    elapsed_oracle = time.perf_counter() - start_time
    oracle_df = pd.DataFrame(all_oracle)

    oracle_csv = args.output_csv.replace(".csv", "_oracle.csv")
    oracle_df.to_csv(oracle_csv, index=False)
    print(f"\n      Oracle results saved -> {oracle_csv}")

    print("\n" + "=" * 100)
    print("  MODE B: NON-CASCADING (Oracle) -- Each phase uses GROUND-TRUTH parent center")
    print("  (Isolates per-phase model accuracy, no error propagation)")
    print("=" * 100)
    print_accuracy_report(oracle_df, len(matches), elapsed_oracle)


if __name__ == "__main__":
    main()

