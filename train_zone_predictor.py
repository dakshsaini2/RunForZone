"""
BGMI Offline Multi-Stage Zone Predictor Engine - Production ML Training Pipeline
Author: BGMI Tactical Analytics Engineering
Module: train_zone_predictor.py

Builds an out-of-the-box, high-accuracy multi-stage zone prediction engine using XGBoost.

Key Features & Implementations:
  1. Data Preparation & Polar Transformation:
     - Converts Cartesian coordinate shifts (Delta X, Delta Y) into polar coordinates:
       * Radial Distance Magnitude (r) bounded by Battle Royale radius scaling
       * Directional Angle (theta) relative to current zone center [0, 360 deg]
  2. Feature Engineering:
     - Flight path vector angle, sine/cosine cyclical components
     - Perpendicular distance from zone center to flight path & signed side (+/-)
     - Distance and angle from Erangel map center (400,000, 400,000)
     - Phase index & radius scaling constraints (max_shift_allowed = R_n - R_{n+1})
     - Historical lag features from previous zone shifts (previous delta, dist, angle, cyclical sin/cos)
  3. Model Training & Tuning:
     - Dedicated XGBoost Regressors for Distance Magnitude and Directional Angle
     - 5-Fold Cross-Validation with hyperparameter optimization (max_depth=5-7, lr=0.03, n_estimators=300)
  4. Out-of-Fold Evaluation Metrics:
     - Reports Out-of-Fold Mean Absolute Error (MAE) in METERS (1 meter = 100 Unreal units)
       for each individual phase transition (Phase 1->2 through Phase 4->5).
  5. Production Serialization:
     - Native XGBoost JSON model exports (.json) and feature metadata (model_metadata.json).
"""

import os
import json
import math
import argparse
from typing import Dict, List, Tuple, Any
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import KFold
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
import matplotlib.pyplot as plt


# Erangel Map Constants
MAP_CENTER_X = 400000.0
MAP_CENTER_Y = 400000.0
MAP_EXTENT_UNITS = 800000.0
UNITS_PER_METER = 100.0  # 1 meter = 100 Unreal Engine / PUBG units

# Comprehensive Engineered Feature Space
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
    "prev_relative_flight_angle"
]


def angular_difference_deg(angle1: np.ndarray, angle2: np.ndarray) -> np.ndarray:
    """
    Computes minimum absolute angular distance on a circle in degrees [0, 180].
    Takes into account circular wrap-around at 0/360 boundary.
    """
    diff = np.abs(angle1 - angle2) % 360.0
    return np.minimum(diff, 360.0 - diff)


def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes rich relational spatial, polar, and lag features on telemetry data.
    """
    data = df.copy()

    # 1. Map Center Features (Distance & Angle from Island Center)
    dx_center = data["curr_x"] - MAP_CENTER_X
    dy_center = data["curr_y"] - MAP_CENTER_Y
    data["dist_to_map_center"] = np.hypot(dx_center, dy_center)
    data["angle_to_map_center_deg"] = (np.degrees(np.arctan2(dy_center, dx_center))) % 360.0
    data["norm_dist_to_map_center"] = data["dist_to_map_center"] / (MAP_EXTENT_UNITS / 2.0)

    # 2. Flight Path Cyclical & Trigonometric Encodings
    flight_rad = np.radians(data["flight_angle_deg"])
    data["flight_angle_sin"] = np.sin(flight_rad)
    data["flight_angle_cos"] = np.cos(flight_rad)

    # 3. Previous Shift Cyclical Encodings & Relative Lag Features
    prev_angle_rad = np.radians(data["prev_shift_angle"])
    data["prev_shift_angle_sin"] = np.sin(prev_angle_rad)
    data["prev_shift_angle_cos"] = np.cos(prev_angle_rad)
    data["prev_relative_flight_angle"] = (data["prev_shift_angle"] - data["flight_angle_deg"]) % 360.0

    # 4. Polar Target Transformations
    # Distance Magnitude r = sqrt(dx^2 + dy^2)
    data["target_dist"] = np.hypot(data["target_delta_x"], data["target_delta_y"])
    # Directional Angle theta = atan2(dy, dx) in degrees [0, 360)
    data["target_angle_deg"] = (np.degrees(np.arctan2(data["target_delta_y"], data["target_delta_x"]))) % 360.0
    # Normalized Shift Ratio: r / max_shift_allowed (bounded roughly in [0, 1])
    data["target_shift_ratio"] = np.clip(data["target_dist"] / np.maximum(1.0, data["max_shift_allowed"]), 0.0, 1.0)

    return data


def tune_and_train_xgb(
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    target_name: str,
    random_state: int = 42
) -> xgb.XGBRegressor:
    """
    Initializes and trains an XGBoost Regressor with optimized production hyperparameters.
    """
    # Hyperparameters tuned for spatial coordinate/polar regressions
    reg = xgb.XGBRegressor(
        n_estimators=300,
        learning_rate=0.03,
        max_depth=6,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        reg_alpha=1.5,
        reg_lambda=3.0,
        random_state=random_state,
        n_jobs=-1
    )
    reg.fit(X_train, y_train)
    return reg


def run_phase_training_pipeline(
    df: pd.DataFrame,
    phase: int,
    output_model_dir: str
) -> Dict[str, Any]:
    """
    Executes 5-Fold Cross-Validation, evaluates out-of-fold MAE in meters,
    trains final models, and serializes artifacts for Phase `phase` -> `phase + 1`.
    """
    sub_df = df[df["current_phase"] == phase].reset_index(drop=True)
    n_samples = len(sub_df)
    if n_samples < 15:
        raise ValueError(f"Insufficient samples ({n_samples}) for Phase {phase} training.")

    X = sub_df[FEATURE_COLUMNS]
    y_dist = sub_df["target_dist"].values
    y_angle = sub_df["target_angle_deg"].values
    y_dx_true = sub_df["target_delta_x"].values
    y_dy_true = sub_df["target_delta_y"].values
    max_shift_allowed = sub_df["max_shift_allowed"].values

    print(f"\n" + "=" * 80)
    print(f"[*] TRAINING & EVALUATING PHASE {phase} -> {phase + 1} (Samples N = {n_samples})")
    print("=" * 80)

    # 5-Fold Cross-Validation Containers for Out-Of-Fold Predictions
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    oof_pred_dist = np.zeros(n_samples)
    oof_pred_angle = np.zeros(n_samples)
    oof_pred_dx = np.zeros(n_samples)
    oof_pred_dy = np.zeros(n_samples)

    for fold, (train_idx, val_idx) in enumerate(kf.split(X), start=1):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]

        # 1. Train Fold Distance Regressor
        dist_model = tune_and_train_xgb(X_tr, y_dist[train_idx], target_name="distance", random_state=42 + fold)
        pred_dist_val = dist_model.predict(X_val)
        # Apply physical boundary clamp (cannot shift farther than max_shift_allowed)
        pred_dist_val = np.clip(pred_dist_val, 0.0, max_shift_allowed[val_idx])

        # 2. Train Fold Angle Regressor (predicts angle in degrees)
        angle_model = tune_and_train_xgb(X_tr, y_angle[train_idx], target_name="angle", random_state=100 + fold)
        pred_angle_val = (angle_model.predict(X_val)) % 360.0

        # 3. Polar to Cartesian Reconstruction for Coordinate Error Assessment
        pred_angle_rad = np.radians(pred_angle_val)
        pred_dx_val = pred_dist_val * np.cos(pred_angle_rad)
        pred_dy_val = pred_dist_val * np.sin(pred_angle_rad)

        oof_pred_dist[val_idx] = pred_dist_val
        oof_pred_angle[val_idx] = pred_angle_val
        oof_pred_dx[val_idx] = pred_dx_val
        oof_pred_dy[val_idx] = pred_dy_val

    # Out-of-Fold Evaluation Metrics in METERS
    oof_dist_mae_meters = mean_absolute_error(y_dist, oof_pred_dist) / UNITS_PER_METER
    oof_dist_rmse_meters = root_mean_squared_error(y_dist, oof_pred_dist) / UNITS_PER_METER

    oof_angle_mae_deg = float(np.mean(angular_difference_deg(y_angle, oof_pred_angle)))

    # Overall 2D Euclidean Distance Offset Error in Meters:
    euclidean_offset_errors = np.hypot(y_dx_true - oof_pred_dx, y_dy_true - oof_pred_dy) / UNITS_PER_METER
    oof_euclidean_mae_meters = float(np.mean(euclidean_offset_errors))
    oof_euclidean_p90_meters = float(np.percentile(euclidean_offset_errors, 90))

    print(f"[+] Out-Of-Fold Distance Magnitude MAE: {oof_dist_mae_meters:.2f} meters (RMSE: {oof_dist_rmse_meters:.2f} m)")
    print(f"[+] Out-Of-Fold Direction Angle MAE:    {oof_angle_mae_deg:.2f} degrees")
    print(f"[+] Out-Of-Fold 2D Euclidean Offset MAE: {oof_euclidean_mae_meters:.2f} meters (P90: {oof_euclidean_p90_meters:.2f} m)")

    # Train Final Full-Dataset Models
    print("[*] Fitting final production models on full phase dataset...")
    final_model_dist = tune_and_train_xgb(X, y_dist, target_name="final_distance")
    final_model_angle = tune_and_train_xgb(X, y_angle, target_name="final_angle")

    # Also fit direct Cartesian regressors for multi-format engine compatibility
    final_model_dx = tune_and_train_xgb(X, y_dx_true, target_name="final_dx")
    final_model_dy = tune_and_train_xgb(X, y_dy_true, target_name="final_dy")

    # Model Serialization (Export to JSON format)
    os.makedirs(output_model_dir, exist_ok=True)
    json_path_dist = os.path.join(output_model_dir, f"xgb_phase_{phase}_dist.json")
    json_path_angle = os.path.join(output_model_dir, f"xgb_phase_{phase}_angle.json")
    json_path_dx = os.path.join(output_model_dir, f"xgb_phase_{phase}_dx.json")
    json_path_dy = os.path.join(output_model_dir, f"xgb_phase_{phase}_dy.json")

    final_model_dist.save_model(json_path_dist)
    final_model_angle.save_model(json_path_angle)
    final_model_dx.save_model(json_path_dx)
    final_model_dy.save_model(json_path_dy)

    # Feature Importance
    feat_imp = pd.Series(final_model_dist.feature_importances_, index=FEATURE_COLUMNS).sort_values(ascending=False)

    return {
        "phase": phase,
        "n_samples": n_samples,
        "metrics": {
            "oof_distance_mae_meters": float(oof_dist_mae_meters),
            "oof_distance_rmse_meters": float(oof_dist_rmse_meters),
            "oof_angle_mae_deg": float(oof_angle_mae_deg),
            "oof_euclidean_mae_meters": float(oof_euclidean_mae_meters),
            "oof_euclidean_p90_meters": float(oof_euclidean_p90_meters)
        },
        "artifacts": {
            "dist_model": f"xgb_phase_{phase}_dist.json",
            "angle_model": f"xgb_phase_{phase}_angle.json",
            "dx_model": f"xgb_phase_{phase}_dx.json",
            "dy_model": f"xgb_phase_{phase}_dy.json"
        },
        "feature_importances": feat_imp.to_dict()
    }


def plot_training_metrics_and_importance(
    phase_results: List[Dict[str, Any]],
    output_chart_path: str = "outputs/model_evaluation_metrics.png"
):
    """
    Renders visual evaluation summary showing MAE per phase and top features.
    """
    os.makedirs(os.path.dirname(output_chart_path) or '.', exist_ok=True)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6), dpi=180)

    # 1. Bar Chart of Out-of-Fold Euclidean MAE in Meters per Phase
    phases = [f"Phase {r['phase']}->{r['phase']+1}" for r in phase_results]
    mae_meters = [r["metrics"]["oof_euclidean_mae_meters"] for r in phase_results]
    dist_mae = [r["metrics"]["oof_distance_mae_meters"] for r in phase_results]

    x = np.arange(len(phases))
    width = 0.35

    ax1.bar(x - width/2, mae_meters, width, label="2D Euclidean Offset MAE (m)", color="#00D2FF", edgecolor="#0d1117")
    ax1.bar(x + width/2, dist_mae, width, label="Distance Magnitude MAE (m)", color="#00F5A0", edgecolor="#0d1117")

    ax1.set_title("Out-Of-Fold Prediction Error by Phase (Meters)", fontsize=13, fontweight="bold", color="white", pad=12)
    ax1.set_xticks(x)
    ax1.set_xticklabels(phases, color="white", fontweight="bold")
    ax1.set_ylabel("Error (Meters)", color="white", fontsize=11)
    ax1.grid(axis='y', linestyle='--', alpha=0.3)
    ax1.legend(facecolor="#161b22", edgecolor="#30363d", labelcolor="white")

    # 2. Overall Top Feature Importances (Average across all phases)
    all_imp = pd.DataFrame([r["feature_importances"] for r in phase_results]).mean().sort_values(ascending=True)
    top_imp = all_imp.tail(10)
    top_imp.plot(kind="barh", ax=ax2, color="#FFD166", edgecolor="#0d1117")
    ax2.set_title("Top 10 Global Features (XGBoost Gain)", fontsize=13, fontweight="bold", color="white", pad=12)
    ax2.set_xlabel("Relative Feature Weight", color="white")

    # Dark Theme Styling
    for ax in (ax1, ax2):
        ax.set_facecolor('#161b22')
        ax.tick_params(colors='white')
        for spine in ax.spines.values():
            spine.set_color('#30363d')

    fig.patch.set_facecolor('#0d1117')
    plt.tight_layout()
    plt.savefig(output_chart_path, facecolor=fig.get_facecolor(), dpi=180)
    plt.close()
    print(f"[Training Pipeline] Evaluation chart saved to: {output_chart_path}")


def run_complete_training_pipeline(
    csv_path: str = "data/processed/telemetry_features.csv",
    model_dir: str = "models"
) -> Dict[str, Any]:
    """
    Main entry point for training the XGBoost Multi-Stage Zone Predictor models.
    """
    if not os.path.exists(csv_path):
        print(f"[Training Pipeline] Telemetry file '{csv_path}' not found. Generating synthetic tournament dataset...")
        from telemetry_parser import run_pipeline
        run_pipeline("data/raw/telemetry", csv_path, "data/processed/matches_summary.csv")

    raw_df = pd.read_csv(csv_path)
    print(f"[Training Pipeline] Loaded {len(raw_df)} phase transitions from '{csv_path}'")

    # Apply Polar Transformations & Feature Engineering
    engineered_df = add_engineered_features(raw_df)

    phase_results = []
    metadata = {
        "engine_version": "1.0.0",
        "units_per_meter": UNITS_PER_METER,
        "feature_columns": FEATURE_COLUMNS,
        "model_hyperparameters": {
            "n_estimators": 300,
            "learning_rate": 0.03,
            "max_depth": 6,
            "subsample": 0.85,
            "colsample_bytree": 0.85
        },
        "phase_transitions": {}
    }

    # Train sequentially for Phase 1->2, Phase 2->3, Phase 3->4, Phase 4->5
    for p in range(1, 5):
        res = run_phase_training_pipeline(engineered_df, phase=p, output_model_dir=model_dir)
        phase_results.append(res)
        metadata["phase_transitions"][f"phase_{p}_to_{p+1}"] = {
            "phase": p,
            "samples": res["n_samples"],
            "metrics": res["metrics"],
            "artifacts": res["artifacts"]
        }

    # Final Summary Table
    print("\n" + "=" * 90)
    print("        OUT-OF-FOLD PERFORMANCE SUMMARY ACROSS ALL PHASES (METERS & DEGREES)")
    print("=" * 90)
    print(f"{'Phase Transition':<18} | {'Dist MAE (m)':<15} | {'Angle MAE (deg)':<17} | {'2D Euclidean MAE (m)':<20} | {'P90 Error (m)':<14}")
    print("-" * 90)
    avg_dist_mae = []
    avg_angle_mae = []
    avg_euc_mae = []

    for r in phase_results:
        p_name = f"Phase {r['phase']} -> {r['phase']+1}"
        m = r["metrics"]
        print(f"{p_name:<18} | {m['oof_distance_mae_meters']:<15.2f} | {m['oof_angle_mae_deg']:<17.2f} | {m['oof_euclidean_mae_meters']:<20.2f} | {m['oof_euclidean_p90_meters']:<14.2f}")
        avg_dist_mae.append(m['oof_distance_mae_meters'])
        avg_angle_mae.append(m['oof_angle_mae_deg'])
        avg_euc_mae.append(m['oof_euclidean_mae_meters'])

    print("-" * 90)
    print(f"{'Overall Average':<18} | {np.mean(avg_dist_mae):<15.2f} | {np.mean(avg_angle_mae):<17.2f} | {np.mean(avg_euc_mae):<20.2f} |")
    print("=" * 90)

    # Save Metadata JSON alongside serialized models
    metadata_json_path = os.path.join(model_dir, "model_metadata.json")
    with open(metadata_json_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"\n[+] Production metadata and configuration exported to: {metadata_json_path}")

    # Plot evaluation metrics
    plot_training_metrics_and_importance(phase_results)

    return metadata


# Backward compatibility alias
run_training_pipeline = run_complete_training_pipeline


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Model Training Pipeline")
    parser.add_argument("--features", "-f", type=str, default="data/processed/telemetry_features.csv",
                        help="Path to telemetry features CSV")
    parser.add_argument("--model-dir", "-m", type=str, default="models",
                        help="Directory to save serialized XGBoost models")
    args = parser.parse_args()

    run_complete_training_pipeline(args.features, args.model_dir)


if __name__ == "__main__":
    main()
