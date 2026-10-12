"""
BGMI Offline Multi-Stage Zone Predictor Engine
Top-level package initialization.
"""

from .config import (
    MAP_EXTENT_UNITS,
    MAP_CENTER_X,
    MAP_CENTER_Y,
    DEFAULT_PHASE_RADII,
    PHASE_PALETTE,
    DEFAULT_MAP_PATH,
    DEFAULT_MASK_PATH
)
from .terrain.mask_generator import extract_terrain_mask, save_terrain_mask
from .telemetry.parser import run_pipeline as parse_telemetry_pipeline
from .models.engine import ZonePredictorEngine
from .models.trainer import run_complete_training_pipeline, run_training_pipeline
from .visualization.overlay import render_opencv_overlay, render_matplotlib_publication_overlay

__version__ = "1.0.0"

__all__ = [
    "ZonePredictorEngine",
    "extract_terrain_mask",
    "save_terrain_mask",
    "parse_telemetry_pipeline",
    "run_complete_training_pipeline",
    "run_training_pipeline",
    "render_opencv_overlay",
    "render_matplotlib_publication_overlay",
    "MAP_EXTENT_UNITS",
    "DEFAULT_PHASE_RADII",
    "PHASE_PALETTE"
]
