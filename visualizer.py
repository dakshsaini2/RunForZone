"""
BGMI Offline Multi-Stage Zone Predictor - Option 3: Visualizer & Map Overlay Generator
Uses Matplotlib and OpenCV to overlay predicted multi-stage safe zone circles (Phases 1-5),
flight path trajectories, shift vectors, and probability heatmaps onto the Erangel map.
"""

import os
import math
import argparse
from typing import Dict, List, Tuple, Optional
import numpy as np
import cv2
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.lines import Line2D


# Erangel Map coordinate extent (800,000 x 800,000 units = 8x8 km)
MAP_EXTENT_UNITS = 800000.0

# Curated high-contrast esports phase color palette (HEX, RGB normalized, BGR)
PHASE_PALETTE = {
    1: {"name": "Phase 1", "hex": "#00D2FF", "rgb": (0.00, 0.82, 1.00), "bgr": (255, 210, 0), "alpha": 0.18, "border_w": 3.0},
    2: {"name": "Phase 2", "hex": "#00F5A0", "rgb": (0.00, 0.96, 0.63), "bgr": (160, 245, 0), "alpha": 0.22, "border_w": 3.0},
    3: {"name": "Phase 3", "hex": "#FFD166", "rgb": (1.00, 0.82, 0.40), "bgr": (102, 209, 255), "alpha": 0.26, "border_w": 3.2},
    4: {"name": "Phase 4", "hex": "#FF7B00", "rgb": (1.00, 0.48, 0.00), "bgr": (0, 123, 255), "alpha": 0.30, "border_w": 3.5},
    5: {"name": "Phase 5", "hex": "#FF0055", "rgb": (1.00, 0.00, 0.33), "bgr": (85, 0, 255), "alpha": 0.35, "border_w": 4.0},
}


def game_to_pixel(gx: float, gy: float, map_w: int, map_h: int) -> Tuple[int, int]:
    """Converts PUBG in-game coordinate units (0..800,000) to pixel coordinates (0..W, 0..H)."""
    px = int((gx / MAP_EXTENT_UNITS) * map_w)
    py = int((gy / MAP_EXTENT_UNITS) * map_h)
    return px, py


def game_radius_to_pixel(gr: float, map_dim: int) -> int:
    """Converts game radius units to pixel radius."""
    return max(2, int((gr / MAP_EXTENT_UNITS) * map_dim))


def render_opencv_overlay(
    base_image: np.ndarray,
    phases: Dict[int, Dict[str, float]],
    flight_path: Optional[Dict[str, Tuple[float, float]]] = None,
    heatmap_grid: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Renders high-speed, sub-millisecond semi-transparent circle overlays, shift arrows,
    and HUD graphics directly using OpenCV alpha blending.
    """
    img_h, img_w = base_image.shape[:2]
    canvas = base_image.copy()

    # Step 1: Render Probability Heatmap if provided
    if heatmap_grid is not None:
        heat_resized = cv2.resize(heatmap_grid, (img_w, img_h), interpolation=cv2.INTER_LINEAR)
        heat_norm = cv2.normalize(heat_resized, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        heat_color = cv2.applyColorMap(heat_norm, cv2.COLORMAP_JET)
        # Blend heatmap softly over map
        canvas = cv2.addWeighted(canvas, 0.75, heat_color, 0.25, 0)

    # Step 2: Render Flight Path
    if flight_path and "start" in flight_path and "end" in flight_path:
        fx1, fy1 = game_to_pixel(*flight_path["start"], img_w, img_h)
        fx2, fy2 = game_to_pixel(*flight_path["end"], img_w, img_h)

        # Draw dashed flight line
        dist = math.hypot(fx2 - fx1, fy2 - fy1)
        dash_len = 25
        num_dashes = max(1, int(dist / dash_len))
        for d in range(0, num_dashes, 2):
            t1 = d / num_dashes
            t2 = min(1.0, (d + 1) / num_dashes)
            p1 = (int(fx1 + t1 * (fx2 - fx1)), int(fy1 + t1 * (fy2 - fy1)))
            p2 = (int(fx1 + t2 * (fx2 - fx1)), int(fy1 + t2 * (fy2 - fy1)))
            cv2.line(canvas, p1, p2, (255, 255, 255), 3, cv2.LINE_AA)

        # Draw Flight Path Arrow Head
        cv2.arrowedLine(canvas, (int(fx1 + 0.85 * (fx2 - fx1)), int(fy1 + 0.85 * (fy2 - fy1))),
                        (fx2, fy2), (0, 255, 255), 4, cv2.LINE_AA, tipLength=0.04)
        cv2.putText(canvas, "FLIGHT PATH", (fx1 + 15, fy1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)

    # Step 3: Render Semi-transparent Phase Circles
    # We create a transparent overlay layer
    overlay_layer = canvas.copy()

    for p_num in range(1, 6):
        if p_num not in phases:
            continue
        p_data = phases[p_num]
        style = PHASE_PALETTE.get(p_num, PHASE_PALETTE[1])
        px, py = game_to_pixel(p_data["x"], p_data["y"], img_w, img_h)
        pr = game_radius_to_pixel(p_data["r"], img_w)

        # Fill circle on overlay layer
        cv2.circle(overlay_layer, (px, py), pr, style["bgr"], -1, cv2.LINE_AA)

    # Blend overlay layer with canvas according to global alpha
    canvas = cv2.addWeighted(overlay_layer, 0.28, canvas, 0.72, 0)

    # Step 4: Draw crisp circle borders and center badges
    centers_px = []
    for p_num in range(1, 6):
        if p_num not in phases:
            continue
        p_data = phases[p_num]
        style = PHASE_PALETTE.get(p_num, PHASE_PALETTE[1])
        px, py = game_to_pixel(p_data["x"], p_data["y"], img_w, img_h)
        pr = game_radius_to_pixel(p_data["r"], img_w)
        centers_px.append((p_num, px, py))

        # Solid high-contrast circle border
        cv2.circle(canvas, (px, py), pr, style["bgr"], int(style["border_w"]), cv2.LINE_AA)

    # Step 5: Draw Trajectory Vectors (Shift Arrows connecting P1 -> P2 -> ... -> P5)
    for i in range(len(centers_px) - 1):
        p_curr_num, c1_x, c1_y = centers_px[i]
        p_next_num, c2_x, c2_y = centers_px[i + 1]

        # Shift line vector
        cv2.arrowedLine(canvas, (c1_x, c1_y), (c2_x, c2_y), (255, 255, 255), 3, cv2.LINE_AA, tipLength=0.12)
        # Shift vector accent in next phase color
        curr_bgr = PHASE_PALETTE[p_next_num]["bgr"]
        cv2.arrowedLine(canvas, (c1_x, c1_y), (c2_x, c2_y), curr_bgr, 2, cv2.LINE_AA, tipLength=0.12)

    # Step 6: Draw Center Badges
    for p_num, px, py in centers_px:
        bgr = PHASE_PALETTE[p_num]["bgr"]
        cv2.circle(canvas, (px, py), 12, (0, 0, 0), -1, cv2.LINE_AA)
        cv2.circle(canvas, (px, py), 10, bgr, -1, cv2.LINE_AA)
        cv2.putText(canvas, f"P{p_num}", (px + 14, py + 6),
                    cv2.FONT_HERSHEY_DUPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)

    # Step 7: Tactical HUD Overlay & Ethics Disclaimer (FR-05 & Non-Functional Compliance)
    hud_h = 90
    cv2.rectangle(canvas, (0, 0), (img_w, hud_h), (15, 18, 24), -1)
    cv2.line(canvas, (0, hud_h), (img_w, hud_h), (0, 210, 255), 2)

    title_text = "BGMI OFFLINE MULTI-STAGE ZONE PREDICTOR | TACTICAL REPLAY VOD"
    disclaimer_text = "COMPLIANCE NOTICE: STRICTLY OFFLINE POST-MATCH ANALYTICS ENGINE. NO LIVE GAMEPLAY INJECTION."
    cv2.putText(canvas, title_text, (25, 38), cv2.FONT_HERSHEY_DUPLEX, 0.95, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(canvas, disclaimer_text, (25, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 210, 255), 1, cv2.LINE_AA)

    return canvas


def render_matplotlib_publication_overlay(
    base_image: np.ndarray,
    phases: Dict[int, Dict[str, float]],
    flight_path: Optional[Dict[str, Tuple[float, float]]] = None,
    output_path: str = "outputs/zone_prediction_matplotlib.png"
):
    """
    Renders publication-grade analytics visualization using Matplotlib
    with coordinate grid axes (km), legend, and shift trajectory arrows.
    """
    img_h, img_w = base_image.shape[:2]
    # Convert BGR image to RGB for matplotlib
    base_rgb = cv2.cvtColor(base_image, cv2.COLOR_BGR2RGB)

    fig, ax = plt.subplots(figsize=(12, 12), dpi=200)
    # Extent in kilometers: [0, 8, 8, 0] (origin top-left matching image coordinates)
    ax.imshow(base_rgb, extent=[0, 8, 8, 0])

    legend_elements = []

    # Flight path
    if flight_path and "start" in flight_path and "end" in flight_path:
        fx1_km = flight_path["start"][0] / 100000.0
        fy1_km = flight_path["start"][1] / 100000.0
        fx2_km = flight_path["end"][0] / 100000.0
        fy2_km = flight_path["end"][1] / 100000.0

        ax.annotate(
            "", xy=(fx2_km, fy2_km), xytext=(fx1_km, fy1_km),
            arrowprops=dict(arrowstyle="->,head_width=0.6,head_length=0.8", color="white", lw=2.5, linestyle="--")
        )
        legend_elements.append(Line2D([0], [0], color="white", lw=2.5, linestyle="--", label="Flight Path Trajectory"))

    # Plot Phase Circles
    centers_km = []
    for p_num in range(1, 6):
        if p_num not in phases:
            continue
        p = phases[p_num]
        cfg = PHASE_PALETTE[p_num]
        cx_km = p["x"] / 100000.0
        cy_km = p["y"] / 100000.0
        cr_km = p["r"] / 100000.0

        # Circle patch
        circle = patches.Circle(
            (cx_km, cy_km), cr_km,
            facecolor=(*cfg["rgb"], cfg["alpha"]),
            edgecolor=cfg["rgb"],
            linewidth=cfg["border_w"],
            linestyle="-"
        )
        ax.add_patch(circle)

        # Center dot
        ax.plot(cx_km, cy_km, marker='o', markersize=8, color=cfg["rgb"], markeredgecolor='black', markeredgewidth=1.5)
        ax.text(cx_km + 0.12, cy_km + 0.12, f"P{p_num}", color="white", fontsize=11, fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.2", facecolor=cfg["rgb"], alpha=0.9, edgecolor="black"))

        centers_km.append((p_num, cx_km, cy_km))
        legend_elements.append(Line2D([0], [0], color=cfg["rgb"], lw=3, label=f"Phase {p_num} (r={cr_km*1000:.0f}m)"))

    # Draw Shift Trajectory Arrows
    for i in range(len(centers_km) - 1):
        _, x1, y1 = centers_km[i]
        _, x2, y2 = centers_km[i + 1]
        ax.annotate(
            "", xy=(x2, y2), xytext=(x1, y1),
            arrowprops=dict(arrowstyle="-|>,head_width=0.4,head_length=0.6", color="yellow", lw=2)
        )

    legend_elements.append(Line2D([0], [0], color="yellow", lw=2, marker=">", label="Shift Trajectory Vector"))

    ax.set_xlim(0, 8)
    ax.set_ylim(8, 0)
    ax.set_xlabel("Map X Coordinate (Kilometers)", fontsize=12, fontweight="bold", color="white")
    ax.set_ylabel("Map Y Coordinate (Kilometers)", fontsize=12, fontweight="bold", color="white")
    ax.set_title("BGMI Tactical Zone Predictor - Multi-Stage Sequential Phase Overlay",
                 fontsize=14, fontweight="bold", pad=15, color="white")

    # Dark mode theme styling
    fig.patch.set_facecolor('#0d1117')
    ax.set_facecolor('#0d1117')
    ax.tick_params(colors='white')
    for spine in ax.spines.values():
        spine.set_color('#30363d')

    legend = ax.legend(handles=legend_elements, loc="upper right", framealpha=0.85, facecolor="#161b22", edgecolor="#30363d")
    for text in legend.get_texts():
        text.set_color("white")

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    plt.tight_layout()
    plt.savefig(output_path, facecolor=fig.get_facecolor(), dpi=200)
    plt.close()
    print(f"[Visualizer] Matplotlib publication render saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Multi-Stage Visualizer")
    parser.add_argument("--map", "-m", type=str, default="data/raw/erangel_map.png",
                        help="Path to Erangel base map image")
    parser.add_argument("--output-cv", type=str, default="outputs/zone_prediction_opencv.png",
                        help="Output path for OpenCV render")
    parser.add_argument("--output-mpl", type=str, default="outputs/zone_prediction_matplotlib.png",
                        help="Output path for Matplotlib publication render")
    args = parser.parse_args()

    # Load base map or generate synthetic if missing
    if not os.path.exists(args.map):
        from terrain_mask_generator import generate_synthetic_erangel_map
        base_img = generate_synthetic_erangel_map(args.map)
    else:
        base_img = cv2.imread(args.map)

    # Example 5-Phase Tournament Match Shift Scenario
    demo_phases = {
        1: {"x": 420000.0, "y": 380000.0, "r": 200000.0},
        2: {"x": 470000.0, "y": 410000.0, "r": 110000.0},
        3: {"x": 490000.0, "y": 435000.0, "r": 65000.0},
        4: {"x": 515000.0, "y": 450000.0, "r": 35000.0},
        5: {"x": 525000.0, "y": 458000.0, "r": 18000.0},
    }

    demo_flight = {
        "start": (120000.0, 150000.0),
        "end": (680000.0, 690000.0)
    }

    # Render OpenCV overlay
    print("[Visualizer] Generating OpenCV overlay...")
    rendered_cv = render_opencv_overlay(base_img, demo_phases, demo_flight)
    os.makedirs(os.path.dirname(args.output_cv) or '.', exist_ok=True)
    cv2.imwrite(args.output_cv, rendered_cv)
    print(f"[Visualizer] OpenCV overlay saved to: {args.output_cv}")

    # Render Matplotlib overlay
    print("[Visualizer] Generating Matplotlib publication overlay...")
    render_matplotlib_publication_overlay(base_img, demo_phases, demo_flight, args.output_mpl)


if __name__ == "__main__":
    main()
