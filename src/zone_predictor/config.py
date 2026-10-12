"""
BGMI Offline Multi-Stage Zone Predictor - Configuration Module
Centralizes map dimensions, coordinate scaling constants, phase radii, color palettes, and default paths.
"""

import os
from pathlib import Path

# Project Root Directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Standard Paths
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
MASKS_DIR = DATA_DIR / "masks"
MODELS_DIR = PROJECT_ROOT / "models"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

DEFAULT_MAP_PATH = RAW_DATA_DIR / "erangel_map.png"
DEFAULT_8K_MAP_PATH = RAW_DATA_DIR / "erangel_map_8k.png"
DEFAULT_MASK_PATH = MASKS_DIR / "erangel_mask.png"
DEFAULT_FEATURES_CSV = PROCESSED_DATA_DIR / "telemetry_features.csv"
DEFAULT_SUMMARY_CSV = PROCESSED_DATA_DIR / "matches_summary.csv"

# PUBG / BGMI Erangel Map Constants
MAP_EXTENT_UNITS = 800000.0  # 800,000 Unreal Units = 8,000 meters = 8 km
MAP_CENTER_X = 400000.0
MAP_CENTER_Y = 400000.0
UNITS_PER_METER = 100.0      # 100 Unreal Engine units = 1 meter

# Default Phase Radii (Unreal Units)
DEFAULT_PHASE_RADII = {
    1: 200000.0,  # ~2,000 m
    2: 110000.0,  # ~1,100 m
    3: 65000.0,   # ~650 m
    4: 35000.0,   # ~350 m
    5: 18000.0,   # ~180 m
    6: 9000.0,    # ~90 m
    7: 4500.0,    # ~45 m
    8: 2000.0     # ~20 m
}

# Curated High-Contrast Esports Phase Visual Palette
PHASE_PALETTE = {
    1: {"name": "Phase 1", "hex": "#00D2FF", "rgb": (0.00, 0.82, 1.00), "bgr": (255, 210, 0), "alpha": 0.18, "border_w": 3.0},
    2: {"name": "Phase 2", "hex": "#00F5A0", "rgb": (0.00, 0.96, 0.63), "bgr": (160, 245, 0), "alpha": 0.22, "border_w": 3.0},
    3: {"name": "Phase 3", "hex": "#FFD166", "rgb": (1.00, 0.82, 0.40), "bgr": (102, 209, 255), "alpha": 0.26, "border_w": 3.2},
    4: {"name": "Phase 4", "hex": "#FF7B00", "rgb": (1.00, 0.48, 0.00), "bgr": (0, 123, 255), "alpha": 0.30, "border_w": 3.5},
    5: {"name": "Phase 5", "hex": "#FF0055", "rgb": (1.00, 0.00, 0.33), "bgr": (85, 0, 255), "alpha": 0.35, "border_w": 4.0},
}

# Machine Learning Feature Definition Space
FEATURE_COLUMNS = [
    "curr_x",
    "curr_y",
    "curr_r",
    "next_r",
    "max_shift_allowed",
    "dist_to_map_center",
    "angle_to_map_center_deg",
    "norm_dist_to_map_center",
    "dist_to_flight",
    "flight_side_sign",
    "flight_angle_deg",
    "flight_angle_sin",
    "flight_angle_cos",
    "relative_flight_angle",
    "prev_delta_x",
    "prev_delta_y",
    "prev_shift_dist",
    "prev_shift_angle",
    "prev_shift_angle_sin",
    "prev_shift_angle_cos",
    "prev_relative_flight_angle"
]

# Ensure required directories exist
for d in [DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, MASKS_DIR, MODELS_DIR, OUTPUTS_DIR]:
    os.makedirs(d, exist_ok=True)
