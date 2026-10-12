"""
BGMI Offline Multi-Stage Zone Predictor - Option 3: Visualizer & Map Overlay
Uses OpenCV and Matplotlib to render multi-stage safe zone circles (Phases 1-5),
flight path vectors, shift trajectory arrows, and 2D probability heatmaps onto Erangel.
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

from ..config import (
    MAP_EXTENT_UNITS,
    PHASE_PALETTE,
    DEFAULT_MAP_PATH,
    OUTPUTS_DIR
)


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
    Renders semi-transparent circle overlays, shift arrows, and tactical HUD directly using OpenCV.
    """
    img_h, img_w = base_image.shape[:2]
    canvas = base_image.copy()

    # Probability Heatmap
    if heatmap_grid is not None:
        heat_resized = cv2.resize(heatmap_grid, (img_w, img_h), interpolation=cv2.INTER_LINEAR)
        heat_norm = cv2.normalize(heat_resized, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        heat_color = cv2.applyColorMap(heat_norm, cv2.COLORMAP_JET)
        canvas = cv2.addWeighted(canvas, 0.75, heat_color, 0.25, 0)

    # Flight Path
    if flight_path and "start" in flight_path and "end" in flight_path:
        fx1, fy1 = game_to_pixel(*flight_path["start"], img_w, img_h)
        fx2, fy2 = game_to_pixel(*flight_path["end"], img_w, img_h)

        dist = math.hypot(fx2 - fx1, fy2 - fy1)
        dash_len = 25
        num_dashes = max(1, int(dist / dash_len))
        for d in range(0, num_dashes, 2):
            t1 = d / num_dashes
            t2 = min(1.0, (d + 1) / num_dashes)
            p1 = (int(fx1 + t1 * (fx2 - fx1)), int(fy1 + t1 * (fy2 - fy1)))
            p2 = (int(fx1 + t2 * (fx2 - fx1)), int(fy1 + t2 * (fy2 - fy1)))
            cv2.line(canvas, p1, p2, (255, 255, 255), 3, cv2.LINE_AA)

        cv2.arrowedLine(canvas, (int(fx1 + 0.85 * (fx2 - fx1)), int(fy1 + 0.85 * (fy2 - fy1))),
                        (fx2, fy2), (0, 255, 255), 4, cv2.LINE_AA, tipLength=0.04)
        cv2.putText(canvas, "FLIGHT PATH", (fx1 + 15, fy1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)

    # Semi-transparent Phase Circles
    overlay_layer = canvas.copy()
    for p_num in range(1, 6):
        if p_num not in phases:
            continue
        p_data = phases[p_num]
        style = PHASE_PALETTE.get(p_num, PHASE_PALETTE[1])
        px, py = game_to_pixel(p_data["x"], p_data["y"], img_w, img_h)
        pr = game_radius_to_pixel(p_data["r"], img_w)
        cv2.circle(overlay_layer, (px, py), pr, style["bgr"], -1, cv2.LINE_AA)

    canvas = cv2.addWeighted(overlay_layer, 0.28, canvas, 0.72, 0)

    # Solid circle borders
    centers_px = []
    for p_num in range(1, 6):
        if p_num not in phases:
            continue
        p_data = phases[p_num]
        style = PHASE_PALETTE.get(p_num, PHASE_PALETTE[1])
        px, py = game_to_pixel(p_data["x"], p_data["y"], img_w, img_h)
        pr = game_radius_to_pixel(p_data["r"], img_w)
        centers_px.append((p_num, px, py))
        cv2.circle(canvas, (px, py), pr, style["bgr"], int(style["border_w"]), cv2.LINE_AA)

    # Trajectory Shift Vectors
    for i in range(len(centers_px) - 1):
        _, c1_x, c1_y = centers_px[i]
        p_next_num, c2_x, c2_y = centers_px[i + 1]
        cv2.arrowedLine(canvas, (c1_x, c1_y), (c2_x, c2_y), (255, 255, 255), 3, cv2.LINE_AA, tipLength=0.12)
        curr_bgr = PHASE_PALETTE[p_next_num]["bgr"]
        cv2.arrowedLine(canvas, (c1_x, c1_y), (c2_x, c2_y), curr_bgr, 2, cv2.LINE_AA, tipLength=0.12)

    # Labeled Center Badges
    for p_num, px, py in centers_px:
        bgr = PHASE_PALETTE[p_num]["bgr"]
        cv2.circle(canvas, (px, py), 12, (0, 0, 0), -1, cv2.LINE_AA)
        cv2.circle(canvas, (px, py), 10, bgr, -1, cv2.LINE_AA)
        cv2.putText(canvas, f"P{p_num}", (px + 14, py + 6),
                    cv2.FONT_HERSHEY_DUPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)

    # Tactical HUD & Compliance Disclaimer
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
    output_path: str = str(OUTPUTS_DIR / "zone_prediction_matplotlib.png")
):
    """
    Renders publication-grade analytics visualization using Matplotlib with kilometer axes and legend.
    """
    base_rgb = cv2.cvtColor(base_image, cv2.COLOR_BGR2RGB)
    fig, ax = plt.subplots(figsize=(12, 12), dpi=200)
    ax.imshow(base_rgb, extent=[0, 8, 8, 0])

    legend_elements = []

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

    centers_km = []
    for p_num in range(1, 6):
        if p_num not in phases:
            continue
        p = phases[p_num]
        cfg = PHASE_PALETTE[p_num]
        cx_km = p["x"] / 100000.0
        cy_km = p["y"] / 100000.0
        cr_km = p["r"] / 100000.0

        circle = patches.Circle(
            (cx_km, cy_km), cr_km,
            facecolor=(*cfg["rgb"], cfg["alpha"]),
            edgecolor=cfg["rgb"],
            linewidth=cfg["border_w"],
            linestyle="-"
        )
        ax.add_patch(circle)
        ax.plot(cx_km, cy_km, marker='o', markersize=8, color=cfg["rgb"], markeredgecolor='black', markeredgewidth=1.5)
        ax.text(cx_km + 0.12, cy_km + 0.12, f"P{p_num}", color="white", fontsize=11, fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.2", facecolor=cfg["rgb"], alpha=0.9, edgecolor="black"))

        centers_km.append((p_num, cx_km, cy_km))
        legend_elements.append(Line2D([0], [0], color=cfg["rgb"], lw=3, label=f"Phase {p_num} (r={cr_km*1000:.0f}m)"))

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


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Multi-Stage Visualizer")
    parser.add_argument("--map", "-m", type=str, default=str(DEFAULT_MAP_PATH))
    parser.add_argument("--output-cv", type=str, default=str(OUTPUTS_DIR / "zone_prediction_opencv.png"))
    parser.add_argument("--output-mpl", type=str, default=str(OUTPUTS_DIR / "zone_prediction_matplotlib.png"))
    args = parser.parse_args()

    base_img = cv2.imread(args.map)
    demo_phases = {
        1: {"x": 410000.0, "y": 390000.0, "r": 200000.0},
        2: {"x": 377194.0, "y": 415769.0, "r": 110000.0},
        3: {"x": 363455.0, "y": 425717.0, "r": 65000.0},
        4: {"x": 345893.0, "y": 433878.0, "r": 35000.0},
        5: {"x": 338539.0, "y": 435189.0, "r": 18000.0},
    }
    demo_flight = {"start": (120000.0, 160000.0), "end": (680000.0, 680000.0)}

    cv_rendered = render_opencv_overlay(base_img, demo_phases, demo_flight)
    cv2.imwrite(args.output_cv, cv_rendered)
    render_matplotlib_publication_overlay(base_img, demo_phases, demo_flight, args.output_mpl)
    print(f"[Visualizer] Overlays saved to {args.output_cv} and {args.output_mpl}")


if __name__ == "__main__":
    main()
