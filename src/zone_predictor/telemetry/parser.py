"""
BGMI Offline Multi-Stage Zone Predictor - Option 2: Telemetry Parser & Feature Pipeline
Parses replay JSON files, extracts flight paths, multi-stage safe zone circles (Phases 1-5),
and prepares structured feature matrices for model training.
"""

import os
import glob
import json
import math
import argparse
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import pandas as pd

from ..config import (
    MAP_EXTENT_UNITS,
    DEFAULT_PHASE_RADII,
    RAW_DATA_DIR,
    DEFAULT_FEATURES_CSV,
    DEFAULT_SUMMARY_CSV
)


def compute_point_to_line_distance(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float]:
    """
    Computes perpendicular distance from point (px, py) to flight vector line (x1, y1) -> (x2, y2),
    and the signed cross-product side (left vs right of flight trajectory).
    """
    dx = x2 - x1
    dy = y2 - y1
    line_len = math.hypot(dx, dy)
    if line_len == 0:
        return math.hypot(px - x1, py - y1), 0.0

    perp_dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / line_len
    cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    side_sign = 1.0 if cross >= 0 else -1.0
    return perp_dist, side_sign


def parse_pubg_api_telemetry_events(events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Parses official PUBG Developer API telemetry event streams.
    """
    match_id = "unknown_match"
    map_name = "Erangel_Main"
    flight_start = None
    flight_end = None
    phases_captured: Dict[int, Dict[str, float]] = {}

    current_phase_index = 0
    last_radius = None

    for event in events:
        event_type = event.get("_T", "")

        if event_type in ("LogMatchStart", "LogMatchDefinition"):
            match_id = event.get("matchId", match_id)
            map_name = event.get("mapName", map_name)

        if "flightPath" in event:
            fp = event["flightPath"]
            flight_start = (fp.get("startX", 0), fp.get("startY", 0))
            flight_end = (fp.get("endX", 0), fp.get("endY", 0))
        elif event_type == "LogPlayerPosition" and flight_start is None:
            char = event.get("character", {})
            loc = char.get("location", {})
            z = loc.get("z", 0)
            if z > 80000:
                flight_start = (loc.get("x", 0), loc.get("y", 0))

        if event_type == "LogGameStatePeriodic":
            game_state = event.get("gameState", {})
            safety_zone = game_state.get("safetyZonePosition")
            safety_radius = game_state.get("safetyZoneRadius", 0.0)

            if safety_zone and safety_radius > 0:
                sx = float(safety_zone.get("x", 0))
                sy = float(safety_zone.get("y", 0))
                sr = float(safety_radius)

                if last_radius is None or abs(sr - last_radius) > 1000:
                    current_phase_index += 1
                    last_radius = sr
                    if 1 <= current_phase_index <= 5 and current_phase_index not in phases_captured:
                        phases_captured[current_phase_index] = {"x": sx, "y": sy, "r": sr}

    if flight_start is None:
        flight_start = (100000.0, 100000.0)
        flight_end = (700000.0, 700000.0)
    elif flight_end is None:
        flight_end = (flight_start[0] + 500000.0, flight_start[1] + 500000.0)

    if len(phases_captured) < 3:
        return None

    return {
        "match_id": match_id,
        "map_name": map_name,
        "flight_path": {"start": flight_start, "end": flight_end},
        "phases": phases_captured
    }


def parse_structured_replay_json(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parses custom tournament replay JSON format.
    """
    if "phases" not in data:
        return None

    raw_phases = data["phases"]
    phases: Dict[int, Dict[str, float]] = {}

    if isinstance(raw_phases, list):
        for idx, p in enumerate(raw_phases, start=1):
            if idx > 5:
                break
            phases[idx] = {
                "x": float(p.get("x", 0)),
                "y": float(p.get("y", 0)),
                "r": float(p.get("radius", p.get("r", DEFAULT_PHASE_RADII.get(idx, 10000))))
            }
    elif isinstance(raw_phases, dict):
        for k, v in raw_phases.items():
            phase_num = int(k.replace("phase_", "").replace("phase", ""))
            if 1 <= phase_num <= 5:
                phases[phase_num] = {
                    "x": float(v.get("x", 0)),
                    "y": float(v.get("y", 0)),
                    "r": float(v.get("radius", v.get("r", DEFAULT_PHASE_RADII.get(phase_num, 10000))))
                }

    fp = data.get("flight_path", {})
    start = fp.get("start", [150000.0, 100000.0])
    end = fp.get("end", [650000.0, 700000.0])

    return {
        "match_id": data.get("match_id", "custom_match"),
        "map_name": data.get("map", "Erangel"),
        "flight_path": {
            "start": (float(start[0]), float(start[1])),
            "end": (float(end[0]), float(end[1]))
        },
        "phases": phases
    }


def extract_features_from_parsed_match(parsed: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Transforms parsed match telemetry into:
      1. A summary record (1 row per match)
      2. Step-by-step Phase Transition records (1 row per phase transition n -> n+1)
    """
    match_id = parsed["match_id"]
    map_name = parsed["map_name"]
    fx1, fy1 = parsed["flight_path"]["start"]
    fx2, fy2 = parsed["flight_path"]["end"]

    fdx = fx2 - fx1
    fdy = fy2 - fy1
    flight_length = math.hypot(fdx, fdy)
    flight_angle = math.degrees(math.atan2(fdy, fdx)) % 360.0

    summary_record: Dict[str, Any] = {
        "match_id": match_id,
        "map_name": map_name,
        "flight_start_x": fx1,
        "flight_start_y": fy1,
        "flight_end_x": fx2,
        "flight_end_y": fy2,
        "flight_length": flight_length,
        "flight_angle_deg": flight_angle,
    }

    phases = parsed["phases"]
    transitions: List[Dict[str, Any]] = []

    for p_num in range(1, 6):
        if p_num in phases:
            summary_record[f"phase_{p_num}_x"] = phases[p_num]["x"]
            summary_record[f"phase_{p_num}_y"] = phases[p_num]["y"]
            summary_record[f"phase_{p_num}_r"] = phases[p_num]["r"]

    prev_delta_x = 0.0
    prev_delta_y = 0.0
    prev_shift_dist = 0.0
    prev_shift_angle = 0.0

    for n in range(1, 5):
        if n in phases and (n + 1) in phases:
            curr_p = phases[n]
            next_p = phases[n + 1]

            cx, cy, cr = curr_p["x"], curr_p["y"], curr_p["r"]
            nx, ny, nr = next_p["x"], next_p["y"], next_p["r"]

            delta_x = nx - cx
            delta_y = ny - cy
            shift_dist = math.hypot(delta_x, delta_y)
            shift_angle = math.degrees(math.atan2(delta_y, delta_x)) % 360.0

            max_allowed_shift = max(1.0, cr - nr)
            containment_ratio = shift_dist / max_allowed_shift

            dist_to_flight, side_sign = compute_point_to_line_distance(cx, cy, fx1, fy1, fx2, fy2)
            relative_flight_angle = (shift_angle - flight_angle) % 360.0

            trans_record = {
                "match_id": match_id,
                "map_name": map_name,
                "current_phase": n,
                "next_phase": n + 1,
                "curr_x": cx,
                "curr_y": cy,
                "curr_r": cr,
                "next_r": nr,
                "max_shift_allowed": max_allowed_shift,
                "dist_to_flight": dist_to_flight,
                "flight_side_sign": side_sign,
                "flight_angle_deg": flight_angle,
                "relative_flight_angle": relative_flight_angle,
                "prev_delta_x": prev_delta_x,
                "prev_delta_y": prev_delta_y,
                "prev_shift_dist": prev_shift_dist,
                "prev_shift_angle": prev_shift_angle,
                "target_delta_x": delta_x,
                "target_delta_y": delta_y,
                "target_shift_dist": shift_dist,
                "target_shift_angle": shift_angle,
                "containment_ratio": containment_ratio
            }
            transitions.append(trans_record)

            prev_delta_x = delta_x
            prev_delta_y = delta_y
            prev_shift_dist = shift_dist
            prev_shift_angle = shift_angle

    return summary_record, transitions


def generate_synthetic_telemetry_dataset(num_matches: int = 150, output_dir: str = str(RAW_DATA_DIR / "telemetry")) -> List[str]:
    """
    Generates realistic, physically-sound PUBG match telemetry JSON files adhering to
    strict Battle Royale containment circles and flight lines.
    """
    os.makedirs(output_dir, exist_ok=True)
    generated_files = []

    np.random.seed(42)

    for i in range(1, num_matches + 1):
        match_id = f"match_bgmi_{i:04d}"

        flight_angle_rad = np.random.uniform(0, 2 * math.pi)
        flight_len = np.random.uniform(500000, 750000)
        center_x = 400000.0 + np.random.normal(0, 40000)
        center_y = 400000.0 + np.random.normal(0, 40000)

        fx1 = np.clip(center_x - (flight_len / 2) * math.cos(flight_angle_rad), 50000, 750000)
        fy1 = np.clip(center_y - (flight_len / 2) * math.sin(flight_angle_rad), 50000, 750000)
        fx2 = np.clip(center_x + (flight_len / 2) * math.cos(flight_angle_rad), 50000, 750000)
        fy2 = np.clip(center_y + (flight_len / 2) * math.sin(flight_angle_rad), 50000, 750000)

        p1_r = DEFAULT_PHASE_RADII[1]
        p1_x = np.random.uniform(p1_r, MAP_EXTENT_UNITS - p1_r)
        p1_y = np.random.uniform(p1_r, MAP_EXTENT_UNITS - p1_r)

        phases = {
            1: {"x": float(p1_x), "y": float(p1_y), "r": float(p1_r)}
        }

        for n in range(1, 5):
            curr_c = phases[n]
            next_r = DEFAULT_PHASE_RADII[n + 1]
            max_offset = curr_c["r"] - next_r

            shift_magnitude = np.random.uniform(0.2, 0.95) * max_offset
            shift_angle = np.random.uniform(0, 2 * math.pi)

            next_x = curr_c["x"] + shift_magnitude * math.cos(shift_angle)
            next_y = curr_c["y"] + shift_magnitude * math.sin(shift_angle)

            phases[n + 1] = {
                "x": float(next_x),
                "y": float(next_y),
                "r": float(next_r)
            }

        match_payload = {
            "match_id": match_id,
            "map": "Erangel_Main",
            "flight_path": {
                "start": [float(fx1), float(fy1)],
                "end": [float(fx2), float(fy2)]
            },
            "phases": phases
        }

        file_path = os.path.join(output_dir, f"{match_id}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(match_payload, f, indent=2)
        generated_files.append(file_path)

    return generated_files


def run_pipeline(input_path: str = str(RAW_DATA_DIR / "telemetry"),
                 output_csv: str = str(DEFAULT_FEATURES_CSV),
                 output_summary_csv: str = str(DEFAULT_SUMMARY_CSV)) -> pd.DataFrame:
    """
    Parses replay telemetry JSONs and saves processed feature matrices.
    """
    if os.path.isdir(input_path):
        json_files = glob.glob(os.path.join(input_path, "*.json"))
    elif os.path.isfile(input_path):
        json_files = [input_path]
    else:
        json_files = []

    if not json_files:
        json_files = generate_synthetic_telemetry_dataset(num_matches=100, output_dir=input_path)

    all_summaries = []
    all_transitions = []

    for fpath in json_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)

            parsed = None
            if isinstance(data, list):
                parsed = parse_pubg_api_telemetry_events(data)
            elif isinstance(data, dict):
                parsed = parse_structured_replay_json(data)

            if parsed:
                summary, transitions = extract_features_from_parsed_match(parsed)
                all_summaries.append(summary)
                all_transitions.extend(transitions)
        except Exception as err:
            pass

    summary_df = pd.DataFrame(all_summaries)
    transitions_df = pd.DataFrame(all_transitions)

    os.makedirs(os.path.dirname(output_csv) or '.', exist_ok=True)
    transitions_df.to_csv(output_csv, index=False)

    if output_summary_csv:
        os.makedirs(os.path.dirname(output_summary_csv) or '.', exist_ok=True)
        summary_df.to_csv(output_summary_csv, index=False)

    return transitions_df


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Telemetry Parser Pipeline")
    parser.add_argument("--input", "-i", type=str, default=str(RAW_DATA_DIR / "telemetry"))
    parser.add_argument("--output", "-o", type=str, default=str(DEFAULT_FEATURES_CSV))
    parser.add_argument("--summary", "-s", type=str, default=str(DEFAULT_SUMMARY_CSV))
    parser.add_argument("--generate-synthetic", action="store_true")
    parser.add_argument("--num-matches", type=int, default=100)
    args = parser.parse_args()

    if args.generate_synthetic:
        generate_synthetic_telemetry_dataset(num_matches=args.num_matches, output_dir=args.input)

    df = run_pipeline(args.input, args.output, args.summary)
    print(f"[Telemetry Parser] Processed {len(df)} phase transition feature rows.")


if __name__ == "__main__":
    main()
