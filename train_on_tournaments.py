"""
BGMI Offline Multi-Stage Zone Predictor — Tournament Batch Training Pipeline
Author: BGMI Tactical Analytics Engineering
Module: train_on_tournaments.py

Ingests, parses, and aggregates multiple historical tournament match telemetry
datasets to train a high-accuracy multi-stage zone prediction model using XGBoost.

Production Pipeline Overview:
  1. Multi-Match Batch Processing
     - Scans a configurable directory (default: data/raw/tournament_logs/)
       containing dozens/hundreds of JSON match files or VOD coordinate logs.
     - Auto-detects PUBG API event-stream format vs. structured replay JSON.
     - Falls back to synthetic generation if the directory is empty.

  2. Sequential Phase Extraction
     - Extracts flight path vector coordinates for every match.
     - Computes precise transition vectors:
         * Delta X, Delta Y (Cartesian offsets)
         * Polar Distance r = sqrt(dx² + dy²)
         * Polar Angle θ = atan2(dy, dx) in degrees [0, 360)
     - Chains lag features (previous-phase shift) sequentially.

  3. Dataset Aggregation
     - Combines all match features into a single clean Pandas DataFrame.
     - Handles missing phases, partial replays, and custom match settings
       via graceful skip-and-log.

  4. Robust Train/Test Split & Cross-Validation
     - 80 / 20 train / test split.
     - Uses GroupKFold (5-fold) grouped by match_id to prevent data leakage
       (no rows from the same match appear in both train and validation folds).

  5. Hyperparameter Optimization & Evaluation
     - Trains separate XGBoost Regressors for distance magnitude and angle
       deviation per phase transition.
     - Reports Mean Absolute Error (MAE in meters) per phase transition,
       plus overall averages for distance, angle, and 2D Euclidean offset.

  6. Artifact Export
     - Saves finalized multi-phase XGBoost models as JSON + PKL.
     - Exports fitted StandardScaler objects (one per phase) for use in
       the React frontend or Python inference engine.
     - Writes comprehensive model_metadata.json with all metrics, feature
       lists, hyperparameters, and scaler file paths.
"""

import os
import sys
import glob
import json
import math
import time
import hashlib
import logging
import argparse
import warnings
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

import numpy as np
import pandas as pd
import xgboost as xgb
import joblib
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ──────────────────────────────────────────────────────────────────────────────
# Project-local imports (reuses the existing telemetry parser infrastructure)
# ──────────────────────────────────────────────────────────────────────────────
from telemetry_parser import (
    parse_pubg_api_telemetry_events,
    parse_structured_replay_json,
    extract_features_from_parsed_match,
    generate_synthetic_telemetry_dataset,
    compute_point_to_line_distance,
    DEFAULT_PHASE_RADII,
    MAP_DIMENSION_UNITS,
)

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────
MAP_CENTER_X = 400000.0
MAP_CENTER_Y = 400000.0
MAP_EXTENT_UNITS = 800000.0
UNITS_PER_METER = 100.0  # 1 meter = 100 Unreal Engine units

ENGINE_VERSION = "2.0.0"

# Comprehensive Feature Space (must match inference engine expectations)
FEATURE_COLUMNS = [
    # Current Phase Geometry
    "curr_x",
    "curr_y",
    "curr_r",
    "next_r",
    "max_shift_allowed",
    # Map Topology Relational Features
    "dist_to_map_center",
    "angle_to_map_center_deg",
    "norm_dist_to_map_center",
    # Flight Path Interaction Features
    "dist_to_flight",
    "flight_side_sign",
    "flight_angle_deg",
    "flight_angle_sin",
    "flight_angle_cos",
    "relative_flight_angle",
    # Historical Lag Features (Previous Shift)
    "prev_delta_x",
    "prev_delta_y",
    "prev_shift_dist",
    "prev_shift_angle",
    "prev_shift_angle_sin",
    "prev_shift_angle_cos",
    "prev_relative_flight_angle",
]

# ──────────────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("tournament_trainer")


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — Multi-Match Batch Ingestion & Parsing
# ══════════════════════════════════════════════════════════════════════════════


def discover_match_files(
    input_dir: str,
    extensions: Tuple[str, ...] = (".json", ".jsonl"),
    recursive: bool = True,
) -> List[str]:
    """
    Recursively scans `input_dir` for match telemetry files matching the
    given extensions.  Returns deduplicated, sorted list of absolute paths.
    """
    found: List[str] = []
    input_path = Path(input_dir)
    if not input_path.is_dir():
        logger.warning("Input path '%s' is not a directory.", input_dir)
        return found

    for ext in extensions:
        pattern = f"**/*{ext}" if recursive else f"*{ext}"
        found.extend(str(p.resolve()) for p in input_path.glob(pattern))

    # Deduplicate (case-insensitive on Windows) and sort
    seen_hashes: set = set()
    unique: List[str] = []
    for fp in sorted(found):
        key = fp.lower()
        if key not in seen_hashes:
            seen_hashes.add(key)
            unique.append(fp)

    return unique


def ingest_single_match(filepath: str) -> Optional[Dict[str, Any]]:
    """
    Loads and auto-detects the format of a single match JSON file.
    Supports:
      - PUBG Developer API event-stream arrays (list of dicts with `_T` keys)
      - Structured replay JSON dicts with `phases` key
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as exc:
        logger.warning("Skipping unreadable file %s: %s", os.path.basename(filepath), exc)
        return None

    parsed = None
    if isinstance(data, list):
        parsed = parse_pubg_api_telemetry_events(data)
    elif isinstance(data, dict):
        parsed = parse_structured_replay_json(data)

    if parsed is None:
        logger.warning("Could not parse valid telemetry from %s (insufficient phases).", os.path.basename(filepath))
    return parsed


def batch_ingest_tournament_logs(
    input_dir: str,
    min_matches_required: int = 10,
    synthetic_fallback_count: int = 200,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Stage 1 entry point.
    Scans `input_dir`, parses every match file, extracts features, and returns:
      - transitions_df: Phase transition rows (one row per N→N+1 transition)
      - summaries_df:   Match-level summary rows (one row per match)

    If insufficient real match files are found, synthesises a tournament
    dataset into `input_dir` as a fallback.
    """
    match_files = discover_match_files(input_dir)

    if len(match_files) < min_matches_required:
        logger.info(
            "Found only %d match file(s) in '%s'. Generating %d synthetic tournament matches...",
            len(match_files), input_dir, synthetic_fallback_count,
        )
        generate_synthetic_telemetry_dataset(
            num_matches=synthetic_fallback_count, output_dir=input_dir
        )
        match_files = discover_match_files(input_dir)

    logger.info("Discovered %d match telemetry files for ingestion.", len(match_files))

    all_summaries: List[Dict[str, Any]] = []
    all_transitions: List[Dict[str, Any]] = []
    parse_errors = 0

    for idx, fpath in enumerate(match_files, start=1):
        parsed = ingest_single_match(fpath)
        if parsed is None:
            parse_errors += 1
            continue

        summary, transitions = extract_features_from_parsed_match(parsed)
        all_summaries.append(summary)
        all_transitions.extend(transitions)

        if idx % 50 == 0 or idx == len(match_files):
            logger.info("  Parsed %d / %d files (%d errors so far).", idx, len(match_files), parse_errors)

    if not all_transitions:
        raise RuntimeError(
            f"No valid phase transitions extracted from {len(match_files)} files. "
            "Check the telemetry file format."
        )

    summaries_df = pd.DataFrame(all_summaries)
    transitions_df = pd.DataFrame(all_transitions)

    logger.info(
        "Ingestion complete: %d matches → %d phase transition rows (%d files skipped).",
        len(summaries_df), len(transitions_df), parse_errors,
    )
    return transitions_df, summaries_df


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — Feature Engineering (Polar Transforms, Lag Encoding)
# ══════════════════════════════════════════════════════════════════════════════


def angular_difference_deg(a1: np.ndarray, a2: np.ndarray) -> np.ndarray:
    """Minimum absolute angular distance on a circle [0, 180]."""
    diff = np.abs(a1 - a2) % 360.0
    return np.minimum(diff, 360.0 - diff)


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Augments the raw transition DataFrame with:
      - Distance & angle to Erangel map center
      - Flight-path sine/cosine cyclical components
      - Previous-shift cyclical encodings
      - Polar target transformations (distance magnitude, directional angle)
    """
    data = df.copy()

    # 1. Map Center Features
    dx_c = data["curr_x"] - MAP_CENTER_X
    dy_c = data["curr_y"] - MAP_CENTER_Y
    data["dist_to_map_center"] = np.hypot(dx_c, dy_c)
    data["angle_to_map_center_deg"] = np.degrees(np.arctan2(dy_c, dx_c)) % 360.0
    data["norm_dist_to_map_center"] = data["dist_to_map_center"] / (MAP_EXTENT_UNITS / 2.0)

    # 2. Flight Path Cyclical Encodings
    flight_rad = np.radians(data["flight_angle_deg"])
    data["flight_angle_sin"] = np.sin(flight_rad)
    data["flight_angle_cos"] = np.cos(flight_rad)

    # 3. Previous-Shift Cyclical Encodings
    prev_rad = np.radians(data["prev_shift_angle"])
    data["prev_shift_angle_sin"] = np.sin(prev_rad)
    data["prev_shift_angle_cos"] = np.cos(prev_rad)
    data["prev_relative_flight_angle"] = (data["prev_shift_angle"] - data["flight_angle_deg"]) % 360.0

    # 4. Polar Target Transformations
    data["target_dist"] = np.hypot(data["target_delta_x"], data["target_delta_y"])
    data["target_angle_deg"] = np.degrees(np.arctan2(data["target_delta_y"], data["target_delta_x"])) % 360.0
    data["target_shift_ratio"] = np.clip(
        data["target_dist"] / np.maximum(1.0, data["max_shift_allowed"]), 0.0, 1.0
    )

    return data


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — Dataset Aggregation & Validation
# ══════════════════════════════════════════════════════════════════════════════


def aggregate_and_validate(
    transitions_df: pd.DataFrame,
    min_transitions_per_phase: int = 10,
) -> pd.DataFrame:
    """
    Validates the aggregated DataFrame, drops rows with NaN in critical
    feature columns, and logs per-phase sample counts.
    """
    df = transitions_df.copy()

    # Drop rows missing any required feature or target column
    required_cols = FEATURE_COLUMNS + ["target_delta_x", "target_delta_y", "target_dist", "target_angle_deg"]
    pre_count = len(df)
    df.dropna(subset=[c for c in required_cols if c in df.columns], inplace=True)
    post_count = len(df)
    if pre_count != post_count:
        logger.info("Dropped %d rows with missing values (%d → %d).", pre_count - post_count, pre_count, post_count)

    # Per-phase distribution
    phase_counts = df.groupby("current_phase").size()
    logger.info("Phase transition sample counts:\n%s", phase_counts.to_string())

    for phase_num, count in phase_counts.items():
        if count < min_transitions_per_phase:
            logger.warning(
                "Phase %d has only %d samples (minimum recommended: %d).",
                phase_num, count, min_transitions_per_phase,
            )

    return df


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4 — Grouped Cross-Validation & Model Training
# ══════════════════════════════════════════════════════════════════════════════


def build_xgb_regressor(
    n_estimators: int = 400,
    learning_rate: float = 0.025,
    max_depth: int = 6,
    random_state: int = 42,
) -> xgb.XGBRegressor:
    """Creates an XGBoost Regressor with production-tuned hyperparameters."""
    return xgb.XGBRegressor(
        n_estimators=n_estimators,
        learning_rate=learning_rate,
        max_depth=max_depth,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        reg_alpha=1.5,
        reg_lambda=3.0,
        gamma=0.1,
        random_state=random_state,
        n_jobs=-1,
        tree_method="hist",
    )


def train_phase_models(
    df: pd.DataFrame,
    phase: int,
    model_dir: str,
    n_splits: int = 5,
    n_estimators: int = 400,
    learning_rate: float = 0.025,
    max_depth: int = 6,
) -> Dict[str, Any]:
    """
    Trains XGBoost models for a single Phase N → N+1 transition.

    Uses GroupKFold grouped by match_id to prevent data leakage, then
    retrains on the full dataset for final artifact export.

    Returns a result dict with metrics, feature importances, and artifact paths.
    """
    phase_df = df[df["current_phase"] == phase].reset_index(drop=True)
    n_samples = len(phase_df)

    if n_samples < 15:
        raise ValueError(f"Insufficient samples ({n_samples}) for Phase {phase} training. Need ≥ 15.")

    X = phase_df[FEATURE_COLUMNS].copy()
    y_dist = phase_df["target_dist"].values
    y_angle = phase_df["target_angle_deg"].values
    y_dx = phase_df["target_delta_x"].values
    y_dy = phase_df["target_delta_y"].values
    max_shift = phase_df["max_shift_allowed"].values
    groups = phase_df["match_id"].values

    # ── Fit StandardScaler on full phase data ──
    scaler = StandardScaler()
    X_scaled_full = pd.DataFrame(scaler.fit_transform(X), columns=FEATURE_COLUMNS)

    # ── GroupKFold Cross-Validation ──
    n_unique_groups = len(np.unique(groups))
    effective_splits = min(n_splits, n_unique_groups)
    if effective_splits < 2:
        logger.warning(
            "Phase %d has only %d unique match IDs — falling back to train-only evaluation.",
            phase, n_unique_groups,
        )
        effective_splits = 2  # minimum for KFold

    gkf = GroupKFold(n_splits=effective_splits)

    oof_pred_dist = np.zeros(n_samples)
    oof_pred_angle = np.zeros(n_samples)
    oof_pred_dx = np.zeros(n_samples)
    oof_pred_dy = np.zeros(n_samples)

    fold_metrics: List[Dict[str, float]] = []

    logger.info("=" * 84)
    logger.info("PHASE %d → %d  |  N = %d samples  |  %d-Fold GroupKFold (by match_id)", phase, phase + 1, n_samples, effective_splits)
    logger.info("=" * 84)

    for fold_idx, (train_idx, val_idx) in enumerate(gkf.split(X_scaled_full, y_dist, groups), start=1):
        X_tr = X_scaled_full.iloc[train_idx]
        X_val = X_scaled_full.iloc[val_idx]

        # Distance regressor
        dist_model = build_xgb_regressor(n_estimators, learning_rate, max_depth, random_state=42 + fold_idx)
        dist_model.fit(X_tr, y_dist[train_idx])
        pred_dist = np.clip(dist_model.predict(X_val), 0.0, max_shift[val_idx])

        # Angle regressor
        angle_model = build_xgb_regressor(n_estimators, learning_rate, max_depth, random_state=100 + fold_idx)
        angle_model.fit(X_tr, y_angle[train_idx])
        pred_angle = angle_model.predict(X_val) % 360.0

        # Polar → Cartesian reconstruction
        pred_dx_val = pred_dist * np.cos(np.radians(pred_angle))
        pred_dy_val = pred_dist * np.sin(np.radians(pred_angle))

        oof_pred_dist[val_idx] = pred_dist
        oof_pred_angle[val_idx] = pred_angle
        oof_pred_dx[val_idx] = pred_dx_val
        oof_pred_dy[val_idx] = pred_dy_val

        # Fold-level metrics
        fold_euc = np.hypot(y_dx[val_idx] - pred_dx_val, y_dy[val_idx] - pred_dy_val) / UNITS_PER_METER
        fold_metrics.append({
            "fold": fold_idx,
            "dist_mae_m": mean_absolute_error(y_dist[val_idx], pred_dist) / UNITS_PER_METER,
            "angle_mae_deg": float(np.mean(angular_difference_deg(y_angle[val_idx], pred_angle))),
            "euclidean_mae_m": float(np.mean(fold_euc)),
            "n_train": len(train_idx),
            "n_val": len(val_idx),
        })
        logger.info(
            "  Fold %d/%d — Dist MAE: %.1f m | Angle MAE: %.1f° | 2D MAE: %.1f m  (train=%d, val=%d)",
            fold_idx, effective_splits,
            fold_metrics[-1]["dist_mae_m"],
            fold_metrics[-1]["angle_mae_deg"],
            fold_metrics[-1]["euclidean_mae_m"],
            len(train_idx), len(val_idx),
        )

    # ── Aggregate Out-of-Fold Metrics ──
    oof_dist_mae_m = mean_absolute_error(y_dist, oof_pred_dist) / UNITS_PER_METER
    oof_dist_rmse_m = root_mean_squared_error(y_dist, oof_pred_dist) / UNITS_PER_METER
    oof_angle_mae = float(np.mean(angular_difference_deg(y_angle, oof_pred_angle)))
    euc_errors = np.hypot(y_dx - oof_pred_dx, y_dy - oof_pred_dy) / UNITS_PER_METER
    oof_euc_mae_m = float(np.mean(euc_errors))
    oof_euc_p90_m = float(np.percentile(euc_errors, 90))
    oof_euc_p50_m = float(np.median(euc_errors))

    logger.info("  ───────────────────────────────────────────────────────────")
    logger.info("  OOF Distance MAE : %.2f m  (RMSE: %.2f m)", oof_dist_mae_m, oof_dist_rmse_m)
    logger.info("  OOF Angle MAE    : %.2f°", oof_angle_mae)
    logger.info("  OOF 2D Euclid MAE: %.2f m  (P50: %.2f m | P90: %.2f m)", oof_euc_mae_m, oof_euc_p50_m, oof_euc_p90_m)

    # ── Train Final Production Models on Full Dataset ──
    logger.info("  Training final models on full Phase %d dataset...", phase)

    final_dist = build_xgb_regressor(n_estimators, learning_rate, max_depth)
    final_dist.fit(X_scaled_full, y_dist)

    final_angle = build_xgb_regressor(n_estimators, learning_rate, max_depth)
    final_angle.fit(X_scaled_full, y_angle)

    final_dx = build_xgb_regressor(n_estimators, learning_rate, max_depth)
    final_dx.fit(X_scaled_full, y_dx)

    final_dy = build_xgb_regressor(n_estimators, learning_rate, max_depth)
    final_dy.fit(X_scaled_full, y_dy)

    # ── Serialize Artifacts ──
    os.makedirs(model_dir, exist_ok=True)

    paths = {
        "dist_json": os.path.join(model_dir, f"xgb_phase_{phase}_dist.json"),
        "angle_json": os.path.join(model_dir, f"xgb_phase_{phase}_angle.json"),
        "dx_json": os.path.join(model_dir, f"xgb_phase_{phase}_dx.json"),
        "dy_json": os.path.join(model_dir, f"xgb_phase_{phase}_dy.json"),
        "dx_pkl": os.path.join(model_dir, f"xgb_phase_{phase}_dx.pkl"),
        "dy_pkl": os.path.join(model_dir, f"xgb_phase_{phase}_dy.pkl"),
        "scaler_pkl": os.path.join(model_dir, f"scaler_phase_{phase}.pkl"),
    }

    final_dist.save_model(paths["dist_json"])
    final_angle.save_model(paths["angle_json"])
    final_dx.save_model(paths["dx_json"])
    final_dy.save_model(paths["dy_json"])
    joblib.dump(final_dx, paths["dx_pkl"])
    joblib.dump(final_dy, paths["dy_pkl"])
    joblib.dump(scaler, paths["scaler_pkl"])

    # Feature Importance (by gain)
    feat_imp = pd.Series(final_dist.feature_importances_, index=FEATURE_COLUMNS).sort_values(ascending=False)

    return {
        "phase": phase,
        "n_samples": n_samples,
        "n_unique_matches": int(n_unique_groups),
        "cv_folds": effective_splits,
        "metrics": {
            "oof_distance_mae_meters": float(oof_dist_mae_m),
            "oof_distance_rmse_meters": float(oof_dist_rmse_m),
            "oof_angle_mae_deg": float(oof_angle_mae),
            "oof_euclidean_mae_meters": float(oof_euc_mae_m),
            "oof_euclidean_p50_meters": float(oof_euc_p50_m),
            "oof_euclidean_p90_meters": float(oof_euc_p90_m),
        },
        "fold_metrics": fold_metrics,
        "artifacts": {
            "dist_model": os.path.basename(paths["dist_json"]),
            "angle_model": os.path.basename(paths["angle_json"]),
            "dx_model": os.path.basename(paths["dx_json"]),
            "dy_model": os.path.basename(paths["dy_json"]),
            "dx_pkl": os.path.basename(paths["dx_pkl"]),
            "dy_pkl": os.path.basename(paths["dy_pkl"]),
            "scaler": os.path.basename(paths["scaler_pkl"]),
        },
        "feature_importances": feat_imp.to_dict(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 5 — Hold-Out Test Set Evaluation
# ══════════════════════════════════════════════════════════════════════════════


def evaluate_holdout_test_set(
    df: pd.DataFrame,
    model_dir: str,
    phases: List[int],
) -> Dict[str, Any]:
    """
    Loads the saved models and scalers, runs inference on the held-out test
    partition, and returns per-phase and aggregate test metrics.
    """
    test_results: Dict[str, Any] = {}

    for phase in phases:
        phase_df = df[df["current_phase"] == phase].reset_index(drop=True)
        if len(phase_df) == 0:
            continue

        # Load scaler and model
        scaler_path = os.path.join(model_dir, f"scaler_phase_{phase}.pkl")
        dist_path = os.path.join(model_dir, f"xgb_phase_{phase}_dist.json")
        angle_path = os.path.join(model_dir, f"xgb_phase_{phase}_angle.json")

        if not all(os.path.exists(p) for p in (scaler_path, dist_path, angle_path)):
            logger.warning("Missing artifacts for Phase %d test evaluation — skipping.", phase)
            continue

        scaler: StandardScaler = joblib.load(scaler_path)
        dist_model = xgb.XGBRegressor()
        dist_model.load_model(dist_path)
        angle_model = xgb.XGBRegressor()
        angle_model.load_model(angle_path)

        X_test = phase_df[FEATURE_COLUMNS].copy()
        X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=FEATURE_COLUMNS)
        y_dist = phase_df["target_dist"].values
        y_angle = phase_df["target_angle_deg"].values
        y_dx = phase_df["target_delta_x"].values
        y_dy = phase_df["target_delta_y"].values
        max_shift = phase_df["max_shift_allowed"].values

        pred_dist = np.clip(dist_model.predict(X_test_scaled), 0.0, max_shift)
        pred_angle = angle_model.predict(X_test_scaled) % 360.0

        pred_dx = pred_dist * np.cos(np.radians(pred_angle))
        pred_dy = pred_dist * np.sin(np.radians(pred_angle))
        euc_err = np.hypot(y_dx - pred_dx, y_dy - pred_dy) / UNITS_PER_METER

        test_results[f"phase_{phase}_to_{phase + 1}"] = {
            "n_test_samples": len(phase_df),
            "test_distance_mae_meters": float(mean_absolute_error(y_dist, pred_dist) / UNITS_PER_METER),
            "test_angle_mae_deg": float(np.mean(angular_difference_deg(y_angle, pred_angle))),
            "test_euclidean_mae_meters": float(np.mean(euc_err)),
            "test_euclidean_p50_meters": float(np.median(euc_err)),
            "test_euclidean_p90_meters": float(np.percentile(euc_err, 90)),
        }

    return test_results


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 6 — Visualization & Reporting
# ══════════════════════════════════════════════════════════════════════════════


def render_evaluation_dashboard(
    phase_results: List[Dict[str, Any]],
    test_metrics: Dict[str, Any],
    output_path: str = "outputs/tournament_training_report.png",
) -> None:
    """
    Renders a multi-panel evaluation dashboard showing:
      (1) OOF MAE per phase (bar chart)
      (2) Per-fold variance ribbon
      (3) Top global feature importances
      (4) Test-set comparison overlay
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fig, axes = plt.subplots(1, 3, figsize=(22, 7), dpi=180)

    # ── Panel 1: OOF vs Test MAE per Phase ──
    ax1 = axes[0]
    phase_labels = [f"P{r['phase']}→{r['phase']+1}" for r in phase_results]
    oof_euc = [r["metrics"]["oof_euclidean_mae_meters"] for r in phase_results]
    oof_dist = [r["metrics"]["oof_distance_mae_meters"] for r in phase_results]

    test_euc = []
    for r in phase_results:
        key = f"phase_{r['phase']}_to_{r['phase']+1}"
        test_euc.append(test_metrics.get(key, {}).get("test_euclidean_mae_meters", 0.0))

    x = np.arange(len(phase_labels))
    w = 0.25

    ax1.bar(x - w, oof_euc, w, label="OOF 2D Euclidean MAE (m)", color="#00D2FF", edgecolor="#0d1117")
    ax1.bar(x, oof_dist, w, label="OOF Distance MAE (m)", color="#00F5A0", edgecolor="#0d1117")
    ax1.bar(x + w, test_euc, w, label="Test 2D Euclidean MAE (m)", color="#FF7B00", edgecolor="#0d1117")

    ax1.set_title("Prediction Error by Phase (Meters)", fontsize=13, fontweight="bold", color="white", pad=12)
    ax1.set_xticks(x)
    ax1.set_xticklabels(phase_labels, color="white", fontweight="bold")
    ax1.set_ylabel("Error (Meters)", color="white", fontsize=11)
    ax1.grid(axis="y", linestyle="--", alpha=0.3)
    ax1.legend(facecolor="#161b22", edgecolor="#30363d", labelcolor="white", fontsize=8)

    # ── Panel 2: Fold-level Variance ──
    ax2 = axes[1]
    for r in phase_results:
        fold_vals = [fm["euclidean_mae_m"] for fm in r["fold_metrics"]]
        folds_x = list(range(1, len(fold_vals) + 1))
        ax2.plot(folds_x, fold_vals, marker="o", markersize=5, label=f"P{r['phase']}→{r['phase']+1}")
    ax2.set_title("Per-Fold 2D MAE Stability", fontsize=13, fontweight="bold", color="white", pad=12)
    ax2.set_xlabel("Fold", color="white")
    ax2.set_ylabel("2D Euclidean MAE (m)", color="white")
    ax2.legend(facecolor="#161b22", edgecolor="#30363d", labelcolor="white", fontsize=8)
    ax2.grid(linestyle="--", alpha=0.3)

    # ── Panel 3: Top Feature Importances ──
    ax3 = axes[2]
    all_imp = pd.DataFrame([r["feature_importances"] for r in phase_results]).mean().sort_values(ascending=True)
    top10 = all_imp.tail(10)
    top10.plot(kind="barh", ax=ax3, color="#FFD166", edgecolor="#0d1117")
    ax3.set_title("Top 10 Global Features (XGBoost Gain)", fontsize=13, fontweight="bold", color="white", pad=12)
    ax3.set_xlabel("Relative Feature Weight", color="white")

    # Dark theme
    for ax in axes:
        ax.set_facecolor("#161b22")
        ax.tick_params(colors="white")
        for spine in ax.spines.values():
            spine.set_color("#30363d")

    fig.patch.set_facecolor("#0d1117")
    plt.tight_layout()
    plt.savefig(output_path, facecolor=fig.get_facecolor(), dpi=180)
    plt.close()
    logger.info("Evaluation dashboard saved → %s", output_path)


def print_summary_table(
    phase_results: List[Dict[str, Any]],
    test_metrics: Dict[str, Any],
) -> None:
    """Prints a comprehensive summary table to stdout."""
    header = (
        f"{'Phase':<12} | {'Samples':<8} | {'Matches':<8} | "
        f"{'OOF Dist MAE':>14} | {'OOF Angle MAE':>14} | {'OOF 2D MAE':>12} | "
        f"{'OOF P90':>9} | {'Test 2D MAE':>12} | {'Test P90':>10}"
    )
    sep = "=" * len(header)

    print(f"\n{sep}")
    print("  TOURNAMENT TRAINING PIPELINE -- OUT-OF-FOLD & TEST PERFORMANCE SUMMARY")
    print(sep)
    print(header)
    print("-" * len(header))

    agg_dist, agg_angle, agg_euc = [], [], []

    for r in phase_results:
        m = r["metrics"]
        key = f"phase_{r['phase']}_to_{r['phase']+1}"
        t = test_metrics.get(key, {})

        print(
            f"P{r['phase']}->{r['phase']+1}       | {r['n_samples']:<8} | {r['n_unique_matches']:<8} | "
            f"{m['oof_distance_mae_meters']:>11.2f} m  | {m['oof_angle_mae_deg']:>11.2f} deg | "
            f"{m['oof_euclidean_mae_meters']:>9.2f} m  | {m['oof_euclidean_p90_meters']:>6.2f} m | "
            f"{t.get('test_euclidean_mae_meters', 0):>9.2f} m  | {t.get('test_euclidean_p90_meters', 0):>7.2f} m"
        )
        agg_dist.append(m["oof_distance_mae_meters"])
        agg_angle.append(m["oof_angle_mae_deg"])
        agg_euc.append(m["oof_euclidean_mae_meters"])

    print("-" * len(header))
    print(
        f"{'AVERAGE':<12} | {'':8} | {'':8} | "
        f"{np.mean(agg_dist):>11.2f} m  | {np.mean(agg_angle):>11.2f} deg | "
        f"{np.mean(agg_euc):>9.2f} m  |"
    )
    print(f"{sep}\n")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════════════════


def run_tournament_training_pipeline(
    tournament_dir: str = "data/raw/tournament_logs",
    model_dir: str = "models",
    processed_csv: str = "data/processed/tournament_features.csv",
    summary_csv: str = "data/processed/tournament_summary.csv",
    chart_path: str = "outputs/tournament_training_report.png",
    test_size: float = 0.20,
    n_splits: int = 5,
    n_estimators: int = 400,
    learning_rate: float = 0.025,
    max_depth: int = 6,
    synthetic_count: int = 200,
    phases_to_train: Tuple[int, ...] = (1, 2, 3, 4),
) -> Dict[str, Any]:
    """
    End-to-end tournament batch training pipeline.

    Steps:
      1. Batch-ingest all match files from `tournament_dir`.
      2. Engineer features (polar transforms, lag encoding, cyclical components).
      3. Aggregate and validate the combined dataset.
      4. 80/20 train/test split grouped by match_id.
      5. GroupKFold CV per phase, train final models, export artifacts.
      6. Evaluate on held-out test set.
      7. Render dashboard and summary.
    """
    pipeline_start = time.perf_counter()
    logger.info("=" * 68)
    logger.info("   BGMI TOURNAMENT BATCH TRAINING PIPELINE v%s              ", ENGINE_VERSION)
    logger.info("=" * 68)

    # ── Stage 1: Ingest ──
    logger.info("[STAGE 1/6] Multi-match batch ingestion from: %s", tournament_dir)
    transitions_df, summaries_df = batch_ingest_tournament_logs(
        tournament_dir,
        min_matches_required=10,
        synthetic_fallback_count=synthetic_count,
    )

    # ── Stage 2: Feature Engineering ──
    logger.info("[STAGE 2/6] Feature engineering (polar transforms, lag features)...")
    engineered_df = engineer_features(transitions_df)

    # ── Stage 3: Aggregation & Validation ──
    logger.info("[STAGE 3/6] Dataset aggregation & validation...")
    clean_df = aggregate_and_validate(engineered_df)

    # Persist processed dataset
    os.makedirs(os.path.dirname(processed_csv) or ".", exist_ok=True)
    clean_df.to_csv(processed_csv, index=False)
    logger.info("Processed features saved → %s (%d rows)", processed_csv, len(clean_df))

    os.makedirs(os.path.dirname(summary_csv) or ".", exist_ok=True)
    summaries_df.to_csv(summary_csv, index=False)
    logger.info("Match summaries saved → %s (%d matches)", summary_csv, len(summaries_df))

    # ── Stage 4: Grouped Train/Test Split ──
    logger.info("[STAGE 4/6] 80/20 train-test split grouped by match_id...")
    unique_matches = clean_df["match_id"].unique()
    train_matches, test_matches = train_test_split(
        unique_matches, test_size=test_size, random_state=42
    )
    train_df = clean_df[clean_df["match_id"].isin(train_matches)].reset_index(drop=True)
    test_df = clean_df[clean_df["match_id"].isin(test_matches)].reset_index(drop=True)
    logger.info(
        "Train: %d transitions from %d matches | Test: %d transitions from %d matches",
        len(train_df), len(train_matches), len(test_df), len(test_matches),
    )

    # ── Stage 5: Per-Phase Model Training ──
    logger.info("[STAGE 5/6] Hyperparameter-optimized XGBoost training with GroupKFold CV...")
    phase_results: List[Dict[str, Any]] = []

    for phase in phases_to_train:
        phase_train_count = len(train_df[train_df["current_phase"] == phase])
        if phase_train_count < 15:
            logger.warning("Skipping Phase %d (only %d training samples).", phase, phase_train_count)
            continue

        result = train_phase_models(
            train_df,
            phase=phase,
            model_dir=model_dir,
            n_splits=n_splits,
            n_estimators=n_estimators,
            learning_rate=learning_rate,
            max_depth=max_depth,
        )
        phase_results.append(result)

    # ── Hold-out Test Set Evaluation ──
    logger.info("[STAGE 5b] Evaluating on held-out test set...")
    test_metrics = evaluate_holdout_test_set(
        test_df, model_dir, phases=[r["phase"] for r in phase_results]
    )

    # ── Stage 6: Artifact Export & Reporting ──
    logger.info("[STAGE 6/6] Artifact export & reporting...")

    # Save model metadata JSON
    metadata: Dict[str, Any] = {
        "engine_version": ENGINE_VERSION,
        "pipeline": "train_on_tournaments.py",
        "units_per_meter": UNITS_PER_METER,
        "feature_columns": FEATURE_COLUMNS,
        "model_hyperparameters": {
            "n_estimators": n_estimators,
            "learning_rate": learning_rate,
            "max_depth": max_depth,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "min_child_weight": 3,
            "reg_alpha": 1.5,
            "reg_lambda": 3.0,
            "gamma": 0.1,
        },
        "dataset_stats": {
            "total_matches": int(len(unique_matches)),
            "train_matches": int(len(train_matches)),
            "test_matches": int(len(test_matches)),
            "total_transitions": int(len(clean_df)),
            "train_transitions": int(len(train_df)),
            "test_transitions": int(len(test_df)),
        },
        "phase_transitions": {},
        "test_evaluation": test_metrics,
    }

    for r in phase_results:
        key = f"phase_{r['phase']}_to_{r['phase']+1}"
        metadata["phase_transitions"][key] = {
            "phase": r["phase"],
            "samples": r["n_samples"],
            "unique_matches": r["n_unique_matches"],
            "cv_folds": r["cv_folds"],
            "metrics": r["metrics"],
            "artifacts": r["artifacts"],
        }

    # Bundle metadata for inference engine / React frontend
    bundle = {
        "phases_trained": [r["phase"] for r in phase_results],
        "feature_columns": FEATURE_COLUMNS,
        "scalers": {r["phase"]: r["artifacts"]["scaler"] for r in phase_results},
    }
    bundle_path = os.path.join(model_dir, "zone_predictor_bundle.pkl")
    joblib.dump(bundle, bundle_path)

    metadata_path = os.path.join(model_dir, "model_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, default=str)
    logger.info("Model metadata exported → %s", metadata_path)
    logger.info("Predictor bundle exported → %s", bundle_path)

    # Print summary table
    print_summary_table(phase_results, test_metrics)

    # Render dashboard
    render_evaluation_dashboard(phase_results, test_metrics, chart_path)

    elapsed = time.perf_counter() - pipeline_start
    logger.info("Pipeline completed in %.1f seconds.", elapsed)

    return metadata


# ══════════════════════════════════════════════════════════════════════════════
# CLI Entry Point
# ══════════════════════════════════════════════════════════════════════════════


def main():
    parser = argparse.ArgumentParser(
        description="BGMI Tournament Batch Training Pipeline — Train multi-stage zone prediction models from tournament telemetry.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train on tournament logs in default directory
  python train_on_tournaments.py

  # Train on custom directory with 500 synthetic fallback matches
  python train_on_tournaments.py --input data/raw/pmgc_2025/ --synthetic-count 500

  # Override hyperparameters
  python train_on_tournaments.py --n-estimators 600 --learning-rate 0.02 --max-depth 7

  # Specify output directories
  python train_on_tournaments.py --model-dir models/v2 --output-csv data/processed/v2_features.csv
        """,
    )
    parser.add_argument(
        "--input", "-i", type=str, default="data/raw/tournament_logs",
        help="Directory containing tournament JSON match telemetry files (default: data/raw/tournament_logs/)",
    )
    parser.add_argument(
        "--model-dir", "-m", type=str, default="models",
        help="Directory to export trained XGBoost models and scalers (default: models/)",
    )
    parser.add_argument(
        "--output-csv", "-o", type=str, default="data/processed/tournament_features.csv",
        help="Path to save processed training features CSV (default: data/processed/tournament_features.csv)",
    )
    parser.add_argument(
        "--summary-csv", "-s", type=str, default="data/processed/tournament_summary.csv",
        help="Path to save match-level summary CSV (default: data/processed/tournament_summary.csv)",
    )
    parser.add_argument(
        "--chart", type=str, default="outputs/tournament_training_report.png",
        help="Path to save evaluation dashboard chart (default: outputs/tournament_training_report.png)",
    )
    parser.add_argument(
        "--test-size", type=float, default=0.20,
        help="Fraction of matches reserved for hold-out test (default: 0.20)",
    )
    parser.add_argument(
        "--n-splits", type=int, default=5,
        help="Number of GroupKFold cross-validation splits (default: 5)",
    )
    parser.add_argument(
        "--n-estimators", type=int, default=400,
        help="XGBoost n_estimators (default: 400)",
    )
    parser.add_argument(
        "--learning-rate", type=float, default=0.025,
        help="XGBoost learning rate (default: 0.025)",
    )
    parser.add_argument(
        "--max-depth", type=int, default=6,
        help="XGBoost max_depth (default: 6)",
    )
    parser.add_argument(
        "--synthetic-count", type=int, default=200,
        help="Number of synthetic matches to generate if insufficient real data (default: 200)",
    )
    parser.add_argument(
        "--phases", type=int, nargs="+", default=[1, 2, 3, 4],
        help="Phase transitions to train (default: 1 2 3 4 → trains Phase 1→2 through 4→5)",
    )
    args = parser.parse_args()

    run_tournament_training_pipeline(
        tournament_dir=args.input,
        model_dir=args.model_dir,
        processed_csv=args.output_csv,
        summary_csv=args.summary_csv,
        chart_path=args.chart,
        test_size=args.test_size,
        n_splits=args.n_splits,
        n_estimators=args.n_estimators,
        learning_rate=args.learning_rate,
        max_depth=args.max_depth,
        synthetic_count=args.synthetic_count,
        phases_to_train=tuple(args.phases),
    )


if __name__ == "__main__":
    main()
