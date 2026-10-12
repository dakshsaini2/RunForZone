"""
BGMI Offline Multi-Stage Zone Predictor - Core Inference Engine
Module: src/zone_predictor/models/engine.py
"""

import os
import time
import math
import argparse
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
import cv2
import pandas as pd
import xgboost as xgb

from ..config import (
    MAP_EXTENT_UNITS,
    DEFAULT_PHASE_RADII,
    DEFAULT_MASK_PATH,
    DEFAULT_MAP_PATH,
    MODELS_DIR,
    OUTPUTS_DIR
)
from ..telemetry.parser import compute_point_to_line_distance
from ..visualization.overlay import render_opencv_overlay, render_matplotlib_publication_overlay


class ZonePredictorEngine:
    def __init__(self, model_dir: str = str(MODELS_DIR), terrain_mask_path: str = str(DEFAULT_MASK_PATH)):
        self.model_dir = model_dir
        self.terrain_mask_path = terrain_mask_path
        self.models_dist = {}
        self.models_angle = {}
        self.models_dx = {}
        self.models_dy = {}
        self.terrain_mask = None

        self._load_models()
        self._load_terrain_mask()

    def _load_models(self):
        """Loads trained XGBoost regression models."""
        for p in range(1, 5):
            json_dist = os.path.join(self.model_dir, f"xgb_phase_{p}_dist.json")
            json_angle = os.path.join(self.model_dir, f"xgb_phase_{p}_angle.json")
            json_dx = os.path.join(self.model_dir, f"xgb_phase_{p}_dx.json")
            json_dy = os.path.join(self.model_dir, f"xgb_phase_{p}_dy.json")

            if os.path.exists(json_dist) and os.path.exists(json_angle):
                reg_dist = xgb.XGBRegressor()
                reg_dist.load_model(json_dist)
                reg_angle = xgb.XGBRegressor()
                reg_angle.load_model(json_angle)
                self.models_dist[p] = reg_dist
                self.models_angle[p] = reg_angle

            if os.path.exists(json_dx) and os.path.exists(json_dy):
                reg_dx = xgb.XGBRegressor()
                reg_dx.load_model(json_dx)
                reg_dy = xgb.XGBRegressor()
                reg_dy.load_model(json_dy)
                self.models_dx[p] = reg_dx
                self.models_dy[p] = reg_dy

    def _load_terrain_mask(self):
        """Loads binary terrain mask."""
        if os.path.exists(self.terrain_mask_path):
            self.terrain_mask = cv2.imread(self.terrain_mask_path, cv2.IMREAD_GRAYSCALE)

    def is_land(self, gx: float, gy: float) -> bool:
        """Returns True if coordinate falls on land, False if water."""
        if self.terrain_mask is None:
            return True
        h, w = self.terrain_mask.shape
        px = int(np.clip((gx / MAP_EXTENT_UNITS) * w, 0, w - 1))
        py = int(np.clip((gy / MAP_EXTENT_UNITS) * h, 0, h - 1))
        return bool(self.terrain_mask[py, px] > 127)

    def reproject_to_nearest_land(self, gx: float, gy: float, max_search_radius_units: float = 80000.0) -> Tuple[float, float]:
        """Re-projects invalid water coordinates to the nearest walkable landmass."""
        if self.terrain_mask is None or self.is_land(gx, gy):
            return gx, gy

        h, w = self.terrain_mask.shape
        px = int(np.clip((gx / MAP_EXTENT_UNITS) * w, 0, w - 1))
        py = int(np.clip((gy / MAP_EXTENT_UNITS) * h, 0, h - 1))

        search_px = int((max_search_radius_units / MAP_EXTENT_UNITS) * w)
        min_y = max(0, py - search_px)
        max_y = min(h, py + search_px)
        min_x = max(0, px - search_px)
        max_x = min(w, px + search_px)

        sub_mask = self.terrain_mask[min_y:max_y, min_x:max_x]
        land_y, land_x = np.where(sub_mask > 127)

        if len(land_y) == 0:
            return gx, gy

        dists_sq = (land_x + min_x - px) ** 2 + (land_y + min_y - py) ** 2
        nearest_idx = np.argmin(dists_sq)

        nearest_px = land_x[nearest_idx] + min_x
        nearest_py = land_y[nearest_idx] + min_y

        return (nearest_px / w) * MAP_EXTENT_UNITS, (nearest_py / h) * MAP_EXTENT_UNITS

    def enforce_containment(self, cx: float, cy: float, cr: float, pred_x: float, pred_y: float, next_r: float) -> Tuple[float, float]:
        """Ensures Circle(n+1) fits 100% inside Circle(n)."""
        dx = pred_x - cx
        dy = pred_y - cy
        dist = math.hypot(dx, dy)
        max_allowed = max(1.0, cr - next_r)

        if dist > max_allowed:
            scale = (max_allowed * 0.98) / dist
            return cx + dx * scale, cy + dy * scale

        return pred_x, pred_y

    def predict_sequential_phases(
        self,
        flight_start: Tuple[float, float],
        flight_end: Tuple[float, float],
        phase_1_center: Tuple[float, float],
        phase_1_radius: float = DEFAULT_PHASE_RADII[1],
        target_phases: int = 5
    ) -> Dict[str, Any]:
        """Executes sequential prediction for Phases 2 through target_phases."""
        start_time = time.perf_counter()

        fx1, fy1 = flight_start
        fx2, fy2 = flight_end
        fdx = fx2 - fx1
        fdy = fy2 - fy1
        flight_angle = math.degrees(math.atan2(fdy, fdx)) % 360.0

        predictions = {
            1: {
                "x": float(phase_1_center[0]),
                "y": float(phase_1_center[1]),
                "r": float(phase_1_radius),
                "is_reprojected": False
            }
        }

        prev_dx = 0.0
        prev_dy = 0.0
        prev_dist = 0.0
        prev_angle = 0.0

        for n in range(1, target_phases):
            curr_c = predictions[n]
            cx, cy, cr = curr_c["x"], curr_c["y"], curr_c["r"]
            next_r = DEFAULT_PHASE_RADII.get(n + 1, cr * 0.5)
            max_shift = max(1.0, cr - next_r)

            dist_to_flight, side_sign = compute_point_to_line_distance(cx, cy, fx1, fy1, fx2, fy2)
            relative_flight_angle = (prev_angle - flight_angle) % 360.0

            dx_c = cx - 400000.0
            dy_c = cy - 400000.0
            dist_map_c = math.hypot(dx_c, dy_c)
            angle_map_c = math.degrees(math.atan2(dy_c, dx_c)) % 360.0

            flight_rad = math.radians(flight_angle)
            prev_angle_rad = math.radians(prev_angle)

            feat_dict = {
                "curr_x": cx,
                "curr_y": cy,
                "curr_r": cr,
                "next_r": next_r,
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
                "prev_delta_x": prev_dx,
                "prev_delta_y": prev_dy,
                "prev_shift_dist": prev_dist,
                "prev_shift_angle": prev_angle,
                "prev_shift_angle_sin": math.sin(prev_angle_rad),
                "prev_shift_angle_cos": math.cos(prev_angle_rad),
                "prev_relative_flight_angle": (prev_angle - flight_angle) % 360.0
            }

            feat_df = pd.DataFrame([feat_dict])

            if n in self.models_dist and n in self.models_angle:
                pred_dist = float(self.models_dist[n].predict(feat_df)[0])
                pred_angle = float(self.models_angle[n].predict(feat_df)[0]) % 360.0
                pred_angle_rad = math.radians(pred_angle)
                pred_dx = pred_dist * math.cos(pred_angle_rad)
                pred_dy = pred_dist * math.sin(pred_angle_rad)
            elif n in self.models_dx and n in self.models_dy:
                pred_dx = float(self.models_dx[n].predict(feat_df)[0])
                pred_dy = float(self.models_dy[n].predict(feat_df)[0])
            else:
                shift_mag = max_shift * 0.65
                pred_dx = shift_mag * math.cos(math.radians(flight_angle + 45))
                pred_dy = shift_mag * math.sin(math.radians(flight_angle + 45))

            raw_next_x = cx + pred_dx
            raw_next_y = cy + pred_dy

            contained_x, contained_y = self.enforce_containment(cx, cy, cr, raw_next_x, raw_next_y, next_r)
            land_x, land_y = self.reproject_to_nearest_land(contained_x, contained_y)
            final_x, final_y = self.enforce_containment(cx, cy, cr, land_x, land_y, next_r)

            was_reprojected = (math.hypot(final_x - raw_next_x, final_y - raw_next_y) > 1000.0)

            predictions[n + 1] = {
                "x": float(final_x),
                "y": float(final_y),
                "r": float(next_r),
                "is_reprojected": was_reprojected,
                "delta_x": float(final_x - cx),
                "delta_y": float(final_y - cy),
                "shift_dist": float(math.hypot(final_x - cx, final_y - cy))
            }

            prev_dx = final_x - cx
            prev_dy = final_y - cy
            prev_dist = math.hypot(prev_dx, prev_dy)
            prev_angle = math.degrees(math.atan2(prev_dy, prev_dx)) % 360.0

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        return {
            "flight_path": {"start": flight_start, "end": flight_end},
            "phases": predictions,
            "inference_latency_ms": latency_ms,
            "meets_latency_sla": latency_ms < 500.0
        }

    def generate_probability_heatmap(
        self,
        phase_predictions: Dict[int, Dict[str, float]],
        grid_size: int = 128
    ) -> np.ndarray:
        """Generates 2D probability density heatmap overlay."""
        heatmap = np.zeros((grid_size, grid_size), dtype=np.float32)
        grid_extent = MAP_EXTENT_UNITS

        for p_num in range(2, 6):
            if p_num not in phase_predictions:
                continue
            center = phase_predictions[p_num]
            cx, cy, cr = center["x"], center["y"], center["r"]

            phase_weight = 1.0 + (p_num * 0.5)
            sigma = (cr * 0.45) / grid_extent * grid_size

            gx_center = (cx / grid_extent) * grid_size
            gy_center = (cy / grid_extent) * grid_size

            y_coords, x_coords = np.ogrid[:grid_size, :grid_size]
            dist_sq = (x_coords - gx_center) ** 2 + (y_coords - gy_center) ** 2
            gaussian = np.exp(-dist_sq / (2 * (sigma ** 2))) * phase_weight
            heatmap += gaussian

        if self.terrain_mask is not None:
            mask_resized = cv2.resize(self.terrain_mask, (grid_size, grid_size), interpolation=cv2.INTER_AREA)
            land_weight = mask_resized.astype(np.float32) / 255.0
            heatmap = heatmap * (0.2 + 0.8 * land_weight)

        return heatmap


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Core Engine Runner")
    parser.add_argument("--flight-start", nargs=2, type=float, default=[120000.0, 160000.0])
    parser.add_argument("--flight-end", nargs=2, type=float, default=[680000.0, 680000.0])
    parser.add_argument("--p1-center", nargs=2, type=float, default=[410000.0, 390000.0])
    parser.add_argument("--p1-radius", type=float, default=200000.0)
    parser.add_argument("--output-img", type=str, default=str(OUTPUTS_DIR / "predicted_zones_overlay.png"))
    args = parser.parse_args()

    engine = ZonePredictorEngine()
    result = engine.predict_sequential_phases(
        flight_start=tuple(args.flight_start),
        flight_end=tuple(args.flight_end),
        phase_1_center=tuple(args.p1_center),
        phase_1_radius=args.p1_radius
    )

    print(f"[*] Latency: {result['inference_latency_ms']:.2f} ms")
    base_map = cv2.imread(str(DEFAULT_MAP_PATH))
    heatmap = engine.generate_probability_heatmap(result["phases"])
    rendered = render_opencv_overlay(base_map, result["phases"], result["flight_path"], heatmap_grid=heatmap)
    cv2.imwrite(args.output_img, rendered)
    print(f"[+] Output saved to: {args.output_img}")


if __name__ == "__main__":
    main()
