"""
Unit tests for geometric circle containment and physics boundary constraints (FR-03).
"""

import math
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from zone_predictor.models.engine import ZonePredictorEngine
from zone_predictor.config import DEFAULT_PHASE_RADII


def test_containment_clamping():
    """Validates that any circle predicted outside the parent circle is clamped mathematically."""
    engine = ZonePredictorEngine()

    c1_x, c1_y, c1_r = 400000.0, 400000.0, DEFAULT_PHASE_RADII[1] # r = 200000
    c2_r = DEFAULT_PHASE_RADII[2] # r = 110000
    max_allowed = c1_r - c2_r # 90000

    # Test A: Circle predicted way outside parent boundary
    wild_pred_x = c1_x + 150000.0
    wild_pred_y = c1_y + 150000.0

    clamped_x, clamped_y = engine.enforce_containment(c1_x, c1_y, c1_r, wild_pred_x, wild_pred_y, c2_r)
    dist = math.hypot(clamped_x - c1_x, clamped_y - c1_y)

    assert dist <= max_allowed, f"Clamped distance {dist} exceeds max allowed {max_allowed}"

    # Verify that child circle fits 100% inside parent circle
    child_outermost_point_dist = dist + c2_r
    assert child_outermost_point_dist <= c1_r + 1e-4, "Child circle breaches parent radius!"


def test_sequential_phase_prediction():
    """Validates multi-phase prediction latency and SLA (<500ms)."""
    engine = ZonePredictorEngine()
    result = engine.predict_sequential_phases(
        flight_start=(100000.0, 100000.0),
        flight_end=(700000.0, 700000.0),
        phase_1_center=(400000.0, 400000.0),
        phase_1_radius=200000.0
    )

    assert result["meets_latency_sla"] is True, f"Inference latency {result['inference_latency_ms']}ms failed SLA < 500ms"
    assert len(result["phases"]) == 5, "Expected 5 phases in sequential prediction"


if __name__ == "__main__":
    test_containment_clamping()
    test_sequential_phase_prediction()
    print("[+] All containment and engine tests PASSED!")
