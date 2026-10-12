"""
BGMI Offline Multi-Stage Zone Predictor - Interactive Tactical Analyst Dashboard (Streamlit)
Allows esports coaches, analysts, and IGLs to simulate flight vectors, adjust Phase 1 circles,
view XGBoost predicted shifts (Phases 1-5), and analyze 2D probability heatmaps.
"""

import os
import streamlit as st
import numpy as np
import cv2
import matplotlib.pyplot as plt

from zone_predictor_engine import ZonePredictorEngine
from visualizer import render_opencv_overlay, MAP_EXTENT_UNITS, DEFAULT_PHASE_RADII, PHASE_PALETTE


st.set_page_config(
    page_title="BGMI Offline Zone Predictor | Esports Tactical Board",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Dark Esports Theme)
st.markdown("""
<style>
    .main { background-color: #0d1117; color: #f0f6fc; }
    .stApp { background-color: #0b0e14; }
    .disclaimer-box {
        background-color: rgba(0, 210, 255, 0.08);
        border: 1px solid #00D2FF;
        border-radius: 8px;
        padding: 12px 18px;
        margin-bottom: 20px;
        font-size: 0.9rem;
    }
    .metric-card {
        background-color: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 14px;
        margin-bottom: 10px;
    }
</style>
""", unsafe_allow_html=True)


@st.cache_resource
def get_engine():
    return ZonePredictorEngine()


def main():
    st.title("🎯 BGMI Offline Multi-Stage Zone Predictor Engine")
    st.caption("Esports Tactical Rotation & Shift Analytics Platform (v1.0 PRD Compliance)")

    # Mandatory Ethical Compliance Disclaimer (Non-Functional Requirement)
    st.markdown("""
    <div class="disclaimer-box">
        <b>⚖️ COMPLIANCE & FAIR PLAY NOTICE:</b>
        This tool operates strictly <b>offline</b> on recorded VODs, custom tournament telemetry, and tactical simulation.
        It does not contain runtime memory hooks, packet sniffers, or live overlays, and is non-compliant with live gameplay assistance.
    </div>
    """, unsafe_allow_html=True)

    engine = get_engine()

    # Sidebar Controls
    st.sidebar.header("🕹️ Match Flight & Circle Parameters")

    st.sidebar.subheader("✈️ Flight Path Vector")
    col_f1, col_f2 = st.sidebar.columns(2)
    fx1 = col_f1.number_input("Start X (m)", min_value=0, max_value=8000, value=1200, step=100) * 100.0
    fy1 = col_f2.number_input("Start Y (m)", min_value=0, max_value=8000, value=1600, step=100) * 100.0

    col_f3, col_f4 = st.sidebar.columns(2)
    fx2 = col_f3.number_input("End X (m)", min_value=0, max_value=8000, value=6800, step=100) * 100.0
    fy2 = col_f4.number_input("End Y (m)", min_value=0, max_value=8000, value=6800, step=100) * 100.0

    st.sidebar.subheader("⭕ Phase 1 Safe Zone")
    col_p1, col_p2 = st.sidebar.columns(2)
    p1_x = col_p1.number_input("P1 Center X (m)", min_value=0, max_value=8000, value=4100, step=50) * 100.0
    p1_y = col_p2.number_input("P1 Center Y (m)", min_value=0, max_value=8000, value=3900, step=50) * 100.0
    p1_r = st.sidebar.slider("P1 Radius (m)", min_value=1500, max_value=2500, value=2000, step=50) * 100.0

    st.sidebar.subheader("🎨 Tactical Overlays")
    show_heatmap = st.sidebar.checkbox("Overlay Probability Heatmap (FR-05)", value=True)
    enforce_reprojection = st.sidebar.checkbox("Enforce Terrain Land Reprojection (FR-04)", value=True)

    # Execute Prediction
    result = engine.predict_sequential_phases(
        flight_start=(fx1, fy1),
        flight_end=(fx2, fy2),
        phase_1_center=(p1_x, p1_y),
        phase_1_radius=p1_r
    )

    phases = result["phases"]
    flight_path = result["flight_path"]
    latency = result["inference_latency_ms"]

    # Main Grid Layout
    left_col, right_col = st.columns([3, 2])

    with left_col:
        st.subheader("🗺️ Tactical Map Overlay")

        base_map = cv2.imread("data/raw/erangel_map.png")
        if base_map is None:
            from terrain_mask_generator import generate_synthetic_erangel_map
            base_map = generate_synthetic_erangel_map("data/raw/erangel_map.png")

        heatmap = None
        if show_heatmap:
            heatmap = engine.generate_probability_heatmap(phases)

        rendered = render_opencv_overlay(base_map, phases, flight_path, heatmap_grid=heatmap)
        rendered_rgb = cv2.cvtColor(rendered, cv2.COLOR_BGR2RGB)
        st.image(rendered_rgb, use_container_width=True)

        st.caption(f"⚡ XGBoost Multi-Stage Inference Latency: **{latency:.2f} ms** (Target SLA < 500ms)")

    with right_col:
        st.subheader("📊 Multi-Stage Sequential Phase Telemetry")

        for p_num in range(1, 6):
            p = phases[p_num]
            cfg = PHASE_PALETTE[p_num]
            r_meters = p["r"] / 100.0
            cx_m = p["x"] / 100.0
            cy_m = p["y"] / 100.0

            shift_info = ""
            if p_num > 1:
                shift_dist = p.get("shift_dist", 0.0) / 100.0
                dx = p.get("delta_x", 0.0) / 100.0
                dy = p.get("delta_y", 0.0) / 100.0
                shift_info = f" | Shift: **{shift_dist:.0f}m** (ΔX: {dx:+.0f}m, ΔY: {dy:+.0f}m)"

            reproj_badge = " 🌊 [Re-projected to Land]" if p.get("is_reprojected") else ""

            st.markdown(f"""
            <div class="metric-card" style="border-left: 5px solid {cfg['hex']};">
                <span style="color: {cfg['hex']}; font-weight: bold; font-size: 1.1rem;">Phase {p_num}</span>
                <span style="float: right; color: #8b949e;">Radius: <b>{r_meters:.0f}m</b></span>
                <br>
                <span>Center: ({cx_m:.0f}m, {cy_m:.0f}m){shift_info}{reproj_badge}</span>
            </div>
            """, unsafe_allow_html=True)

        st.markdown("### 🛡️ Geometric Rule Verification")
        st.write("- **FR-03 Containment:** Circle $C_{n+1} \\subseteq C_n$ strictly guaranteed via mathematical Euclidean clamping.")
        st.write(f"- **FR-04 Terrain Filter:** {'Active (OpenCV Distance Transform Mask)' if enforce_reprojection else 'Inactive'}.")


if __name__ == "__main__":
    main()
