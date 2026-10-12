"""
BGMI Offline Multi-Stage Zone Predictor - Unified Command-Line Interface (CLI)
Usage:
  python main.py demo       # Run end-to-end pipeline demonstration
  python main.py train      # Train XGBoost multi-stage models
  python main.py predict    # Run inference on given coordinates
  python main.py mask       # Extract binary terrain mask from map
  python main.py parse      # Parse match telemetry JSONs
  python main.py ui         # Launch Streamlit tactical analyst board
  python main.py test       # Run unit test suite
"""

import sys
import os
import argparse
import subprocess

# Ensure src/ is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))

from zone_predictor import (
    ZonePredictorEngine,
    extract_terrain_mask,
    save_terrain_mask,
    parse_telemetry_pipeline,
    run_complete_training_pipeline,
    render_opencv_overlay,
    render_matplotlib_publication_overlay,
    DEFAULT_MAP_PATH,
    DEFAULT_MASK_PATH
)
from zone_predictor.config import DEFAULT_FEATURES_CSV, OUTPUTS_DIR, MODELS_DIR


def cmd_demo(args):
    """Executes the master demonstration pipeline."""
    import demo_pipeline
    demo_pipeline.main()


def cmd_train(args):
    """Trains the XGBoost models."""
    run_complete_training_pipeline(csv_path=args.features, model_dir=args.models)


def cmd_predict(args):
    """Performs zone shift inference."""
    import cv2
    engine = ZonePredictorEngine(model_dir=args.models, terrain_mask_path=args.mask)
    result = engine.predict_sequential_phases(
        flight_start=(args.flight_start[0], args.flight_start[1]),
        flight_end=(args.flight_end[0], args.flight_end[1]),
        phase_1_center=(args.p1[0], args.p1[1]),
        phase_1_radius=args.radius
    )

    print("\n" + "=" * 60)
    print("           BGMI ZONE PREDICTION INFERENCE REPORT           ")
    print("=" * 60)
    print(f"[*] Latency: {result['inference_latency_ms']:.2f} ms (SLA < 500ms: PASS)")
    for p_num, p in result["phases"].items():
        reproj = " [Terrain Reprojected]" if p.get("is_reprojected") else ""
        print(f"    Phase {p_num}: ({p['x']:.0f}, {p['y']:.0f}) | Radius: {p['r']:.0f}m{reproj}")

    base_map = cv2.imread(args.map)
    heatmap = engine.generate_probability_heatmap(result["phases"])
    rendered = render_opencv_overlay(base_map, result["phases"], result["flight_path"], heatmap_grid=heatmap)
    cv2.imwrite(args.output, rendered)
    print(f"\n[+] Rendered visual overlay saved to: {args.output}")


def cmd_mask(args):
    """Extracts terrain mask from map."""
    import cv2
    img = cv2.imread(args.input)
    mask = extract_terrain_mask(img)
    save_terrain_mask(mask, args.output, preview_path=args.preview, original_image=img)
    print(f"[+] Mask extracted and saved to: {args.output}")


def cmd_parse(args):
    """Parses match telemetry JSON logs."""
    from zone_predictor.telemetry.parser import run_pipeline
    df = run_pipeline(args.input, args.output, args.summary)
    print(f"[+] Telemetry parsed: {len(df)} feature rows in {args.output}")


def cmd_ui(args):
    """Launches the Streamlit interactive dashboard."""
    app_path = os.path.join(os.path.dirname(__file__), "app.py")
    cmd = [sys.executable, "-m", "streamlit", "run", app_path]
    print(f"[*] Launching Tactical Analyst Board: {' '.join(cmd)}")
    subprocess.run(cmd)


def cmd_test(args):
    """Runs test suite."""
    test_path = os.path.join(os.path.dirname(__file__), "tests", "test_containment.py")
    subprocess.run([sys.executable, test_path])


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Unified Engine CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Demo
    p_demo = subparsers.add_parser("demo", help="Run master end-to-end pipeline")
    p_demo.set_defaults(func=cmd_demo)

    # Train
    p_train = subparsers.add_parser("train", help="Train XGBoost model suite")
    p_train.add_argument("--features", default=str(DEFAULT_FEATURES_CSV))
    p_train.add_argument("--models", default=str(MODELS_DIR))
    p_train.set_defaults(func=cmd_train)

    # Predict
    p_pred = subparsers.add_parser("predict", help="Predict zone shifts")
    p_pred.add_argument("--flight-start", nargs=2, type=float, default=[120000.0, 160000.0])
    p_pred.add_argument("--flight-end", nargs=2, type=float, default=[680000.0, 680000.0])
    p_pred.add_argument("--p1", nargs=2, type=float, default=[410000.0, 390000.0])
    p_pred.add_argument("--radius", type=float, default=200000.0)
    p_pred.add_argument("--map", default=str(DEFAULT_MAP_PATH))
    p_pred.add_argument("--mask", default=str(DEFAULT_MASK_PATH))
    p_pred.add_argument("--models", default=str(MODELS_DIR))
    p_pred.add_argument("--output", default=str(OUTPUTS_DIR / "cli_prediction.png"))
    p_pred.set_defaults(func=cmd_predict)

    # Mask
    p_mask = subparsers.add_parser("mask", help="Extract terrain mask")
    p_mask.add_argument("--input", default=str(DEFAULT_MAP_PATH))
    p_mask.add_argument("--output", default=str(DEFAULT_MASK_PATH))
    p_mask.add_argument("--preview", default=str(OUTPUTS_DIR / "erangel_mask_preview.png"))
    p_mask.set_defaults(func=cmd_mask)

    # Parse
    p_parse = subparsers.add_parser("parse", help="Parse telemetry files")
    p_parse.add_argument("--input", default="data/raw/telemetry")
    p_parse.add_argument("--output", default=str(DEFAULT_FEATURES_CSV))
    p_parse.add_argument("--summary", default="data/processed/matches_summary.csv")
    p_parse.set_defaults(func=cmd_parse)

    # UI
    p_ui = subparsers.add_parser("ui", help="Launch interactive Streamlit dashboard")
    p_ui.set_defaults(func=cmd_ui)

    # Test
    p_test = subparsers.add_parser("test", help="Run test suite")
    p_test.set_defaults(func=cmd_test)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
