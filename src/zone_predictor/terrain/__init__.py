"""
Terrain module initialization.
"""
from .mask_generator import extract_terrain_mask, save_terrain_mask, generate_synthetic_erangel_map

__all__ = ["extract_terrain_mask", "save_terrain_mask", "generate_synthetic_erangel_map"]
