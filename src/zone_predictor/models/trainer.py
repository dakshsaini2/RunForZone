"""
BGMI Offline Multi-Stage Zone Predictor - Option 4: Production ML Training Pipeline
Author: BGMI Tactical Analytics Engineering
Module: src/zone_predictor/models/trainer.py
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

from ..config import (
    MAP_CENTER_X,
    MAP_CENTER_Y,
    MAP_EXTENT_UNITS,
    UNITS_PER_METER,
    FEATURE_COLUMNS,
    DEFAULT_FEATURES_CSV,
    DEFAULT_SUMMARY_CSV,
    MODELS_DIR,
    OUTPUTS_DIR,
    RAW_DATA_DIR
)


def angular_difference_deg(angle1: np.ndarray, angle2: np.ndarray) -> np.ndarray:
    """Computes minimum absolute angular distance on circle in degrees [0, 180]."""
    diff = np.abs(angle1 - angle2) % 360.0
    return np.minimum(diff, 360.0 - diff)


def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    """Computes relational spatial, polar, and lag features on telemetry data."""
    data = df.copy()

    # Map Center Features
    dx_center = data["curr_x"] - MAP_CENTER_X
    dy_center = data["curr_y"] - MAP_CENTER_Y
    data["dist_to_map_center"] = np.hypot(dx_center, dy_center)
    data["angle_to_map_center_deg"] = (np.degrees(np.arctan2(dy_center, dx_center))) % 360.0
    data["norm_dist_to_map_center"] = data["dist_to_map_center"] / (MAP_EXTENT_UNITS / 2.0)

    # Flight Path Encodings
    flight_rad = np.radians(data["flight_angle_deg"])
    data["flight_angle_sin"] = np.sin(flight_rad)
    data["flight_angle_cos"] = np.cos(flight_rad)

    # Historical Lag Encodings
    prev_angle_rad = np.radians(data["prev_shift_angle"])
    data["prev_shift_angle_sin"] = np.sin(prev_angle_rad)
    data["prev_shift_angle_cos"] = np.cos(prev_angle_rad)
    data["prev_relative_flight_angle"] = (data["prev_shift_angle"] - data["flight_angle_deg"]) % 360.0

    # Polar Targets
    data["target_dist"] = np.hypot(data["target_delta_x"], data["target_delta_y"])
    data["target_angle_deg"] = (np.degrees(np.arctan2(data["target_delta_y"], data["target_delta_x"]))) % 360.0
    data["target_shift_ratio"] = np.clip(data["target_dist"] / np.maximum(1.0, data["max_shift_allowed"]), 0.0, 1.0)

    return data


def tune_and_train_xgb(X_train: pd.DataFrame, y_train: np.ndarray, target_name: str, random_state: int = 42) -> xgb.XGBRegressor:
    """Trains an XGBoost Regressor with optimized production hyperparameters."""
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


def run_phase_training_pipeline(df: pd.DataFrame, phase: int, output_model_dir: str = str(MODELS_DIR)) -> Dict[str, Any]:
    """Trains and evaluates out-of-fold MAE in meters for a single phase transition."""
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

    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    oof_pred_dist = np.zeros(n_samples)
    oof_pred_angle = np.zeros(n_samples)
    oof_pred_dx = np.zeros(n_samples)
    oof_pred_dy = np.zeros(n_samples)

    for fold, (train_idx, val_idx) in enumerate(kf.split(X), start=1):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]

        dist_model = tune_and_train_xgb(X_tr, y_dist[train_idx], "distance", 42 + fold)
        pred_dist_val = np.clip(dist_model.predict(X_val), 0.0, max_shift_allowed[val_idx])

        angle_model = tune_and_train_xgb(X_tr, y_angle[train_idx], "angle", 100 + fold)
        pred_angle_val = (angle_model.predict(X_val)) % 360.0

        pred_angle_rad = np.radians(pred_angle_val)
        pred_dx_val = pred_dist_val * np.cos(pred_angle_rad)
        pred_dy_val = pred_dist_val * np.sin(pred_angle_rad)

        oof_pred_dist[val_idx] = pred_dist_val
        oof_pred_angle[val_idx] = pred_angle_val
        oof_pred_dx[val_idx] = pred_dx_val
        oof_pred_dy[val_idx] = pred_dy_val

    oof_dist_mae_meters = mean_absolute_error(y_dist, oof_pred_dist) / UNITS_PER_METER
    oof_dist_rmse_meters = root_mean_squared_error(y_dist, oof_pred_dist) / UNITS_PER_METER
    oof_angle_mae_deg = float(np.mean(angular_difference_deg(y_angle, oof_pred_angle)))

    euclidean_offset_errors = np.hypot(y_dx_true - oof_pred_dx, y_dy_true - oof_pred_dy) / UNITS_PER_METER
    oof_euclidean_mae_meters = float(np.mean(euclidean_offset_errors))
    oof_euclidean_p90_meters = float(np.percentile(euclidean_offset_errors, 90))

    final_model_dist = tune_and_train_xgb(X, y_dist, "final_distance")
    final_model_angle = tune_and_train_xgb(X, y_angle, "final_angle")
    final_model_dx = tune_and_train_xgb(X, y_dx_true, "final_dx")
    final_model_dy = tune_and_train_xgb(X, y_dy_true, "final_dy")

    os.makedirs(output_model_dir, exist_ok=True)
    final_model_dist.save_model(os.path.join(output_model_dir, f"xgb_phase_{phase}_dist.json"))
    final_model_angle.save_model(os.path.join(output_model_dir, f"xgb_phase_{phase}_angle.json"))
    final_model_dx.save_model(os.path.join(output_model_dir, f"xgb_phase_{phase}_dx.json"))
    final_model_dy.save_model(os.path.join(output_model_dir, f"xgb_phase_{phase}_dy.json"))

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


def run_complete_training_pipeline(csv_path: str = str(DEFAULT_FEATURES_CSV), model_dir: str = str(MODELS_DIR)) -> Dict[str, Any]:
    """Executes full training pipeline across all phases 1 through 4."""
    if not os.path.exists(csv_path):
        from ..telemetry.parser import run_pipeline
        run_pipeline(str(RAW_DATA_DIR / "telemetry"), csv_path, str(DEFAULT_SUMMARY_CSV))

    raw_df = pd.read_csv(csv_path)
    engineered_df = add_engineered_features(raw_df)

    phase_results = []
    metadata = {
        "engine_version": "1.0.0",
        "units_per_meter": UNITS_PER_METER,
        "feature_columns": FEATURE_COLUMNS,
        "phase_transitions": {}
    }

    for p in range(1, 5):
        res = run_phase_training_pipeline(engineered_df, phase=p, output_model_dir=model_dir)
        phase_results.append(res)
        metadata["phase_transitions"][f"phase_{p}_to_{p+1}"] = {
            "phase": p,
            "samples": res["n_samples"],
            "metrics": res["metrics"],
            "artifacts": res["artifacts"]
        }

    with open(os.path.join(model_dir, "model_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


run_training_pipeline = run_complete_training_pipeline


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Model Training Pipeline")
    parser.add_argument("--features", "-f", type=str, default=str(DEFAULT_FEATURES_CSV))
    parser.add_argument("--model-dir", "-m", type=str, default=str(MODELS_DIR))
    args = parser.parse_args()

    run_complete_training_pipeline(args.features, args.model_dir)


if __name__ == "__main__":
    main()
