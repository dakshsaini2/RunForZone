<div align="center">

# 🗺️ RunForZone
### BGMI Offline Multi-Stage Safe Zone Predictor Engine

*High-performance ML + Computer Vision analytics for esports tactical coaching*

[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.0-FF6600?style=for-the-badge&logo=xgboost&logoColor=white)](https://xgboost.readthedocs.io/)
[![OpenCV](https://img.shields.io/badge/OpenCV-5.0-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)](https://opencv.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Streamlit](https://img.shields.io/badge/Streamlit-Dashboard-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white)](https://streamlit.io/)

[![Inference SLA](https://img.shields.io/badge/Inference%20Latency-~12ms%20(SLA%20%3C500ms)-00C853?style=flat-square)]()
[![Compliance](https://img.shields.io/badge/Compliance-Offline%20VOD%20Only-1565C0?style=flat-square)]()
[![Phase Coverage](https://img.shields.io/badge/Phases-1%20→%205%20Prediction-E91E63?style=flat-square)]()

</div>

---

> [!IMPORTANT]
> **⚖️ COMPLIANCE & ETHICAL FAIR PLAY MANDATE**
> This engine operates **strictly offline** on recorded tournament VODs, historical match telemetry JSON logs, and tactical "what-if" simulations. It includes **no live game memory hooks, packet sniffers, or runtime screen overlays**, ensuring 100% compliance with game publisher Terms of Service.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Prediction Pipeline](#-multi-stage-prediction-pipeline)
- [Data Flow & Training](#-data-flow--training-lifecycle)
- [Repository Structure](#-repository-structure)
- [Mathematical Formulations](#-mathematical--geometric-formulations)
- [Model Performance](#-model-performance--evaluation)
- [Quick Start](#-quick-start)
- [CLI Reference](#-cli-reference)
- [Frontend UI](#-react-frontend-ui)
- [Visual Outputs](#-visual-output-gallery)
- [Requirements Checklist](#-functional-requirements-checklist)

---

## 🎯 Overview

**RunForZone** is a data-science analytics engine designed for **esports tactical coaches, In-Game Leaders (IGLs), and match analysts** studying sequential BGMI/PUBG safe zone shifts (Phases 1 through 5+) on Erangel.

The engine coordinates:
- 📡 **Telemetry Ingestion** — JSON match logs, flight path vectors, Phase 1 center/radius
- 🧠 **XGBoost ML Core** — Polar-coordinate shift regression per phase transition
- 📐 **Geometric Guardrails** — Strict circle containment physics enforcement
- 🗺️ **Terrain Topology** — OpenCV binary mask filtering with water re-projection
- 📊 **Visual Analytics** — 2D Gaussian heatmaps, tactical overlays, and interactive dashboards

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph INPUT["🔵 INPUT LAYER"]
        direction LR
        A1["📁 Match Telemetry\nJSON / VOD Logs"]
        A2["✈️ Flight Path Vector\nStart → End"]
        A3["📍 Phase 1 Center\nX₁, Y₁, R₁"]
    end

    subgraph FEAT["⚙️ FEATURE ENGINEERING"]
        B1["🔢 Polar Encoding\nr, θ"]
        B2["📏 Radial Features\nNormalized Offsets"]
        B3["🧭 Directional Features\nFlight Angle, Bias"]
    end

    subgraph ML["🤖 ML CORE — XGBoost Regressors"]
        direction LR
        C1["Phase 1→2\nXGB Model"]
        C2["Phase 2→3\nXGB Model"]
        C3["Phase 3→4\nXGB Model"]
        C4["Phase 4→5\nXGB Model"]
    end

    subgraph PHYS["📐 PHYSICS GUARDRAILS"]
        D1["📏 Containment Clamper\nCn+1 inside Cn"]
        D2["🌊 Terrain Mask Filter\nOpenCV Binary Mask"]
        D3["🗺️ Water Re-projection\nNearest Land Point"]
    end

    subgraph OUT["📊 OUTPUT LAYER"]
        E1["📈 5-Phase Zone Sequence\nlt 15 ms Latency"]
        E2["🌡️ 2D Gaussian\nProbability Heatmap"]
        E3["🖥️ Streamlit\nAnalyst Dashboard"]
        E4["🖼️ OpenCV + Matplotlib\nTactical Overlays"]
        E5["⚛️ React\nFrontend UI"]
    end

    A1 --> A2 & A3
    A2 & A3 --> B1 & B2 & B3
    B1 & B2 & B3 --> C1 --> C2 --> C3 --> C4
    C1 & C2 & C3 & C4 --> D1 --> D2 --> D3
    D3 --> E1
    E1 --> E2 & E3 & E4 & E5
```

---

## 🛠️ Tech Stack

```mermaid
mindmap
  root((RunForZone))
    Backend Python
      XGBoost 2.0
        5-Fold Cross-Validation
        Phase-Specific Regressors
      OpenCV 5.0
        Binary Terrain Mask
        Water Re-projection
      NumPy and Pandas
        Feature Engineering
        Polar Coordinate Math
      SciPy
        2D Gaussian KDE
        Probability Heatmaps
      Streamlit
        Tactical Dashboard
        Interactive Controls
    Frontend React
      React 19
        Component Architecture
        Interactive Map UI
      Vite 8.3
        HMR Dev Server
        Production Builds
      Lucide React
        Icon Library
    Data Pipeline
      Telemetry Parser
        JSON VOD Logs
        Flight Path Extraction
      Feature CSV
        Phase Transitions
        Polar Features
      XGBoost Models
        json Serialized
        Phase 1 to 5 Coverage
```

---

## 🔄 Multi-Stage Prediction Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Coach as Esports Coach / Analyst
    participant CLI as CLI / Streamlit UI
    participant Engine as ZonePredictorEngine
    participant XGB as XGBoost Models Ph 1-5
    participant Physics as Containment Clamper
    participant Terrain as OpenCV Mask Filter

    Coach->>CLI: Input Flight Trajectory and Phase 1 Center X1 Y1 R1
    CLI->>Engine: predict_sequential_phases()

    loop For Phase n = 1 to 4
        Engine->>XGB: Predict Polar Shift r theta for Phase n+1
        XGB-->>Engine: Raw Distance Magnitude and Directional Angle

        Engine->>Physics: Enforce dist Pn+1 Pn le Rn minus Rn+1
        Physics-->>Engine: Geometrically Contained Coordinates

        Engine->>Terrain: Check is_land X Y via OpenCV Mask
        alt Center Falls on Water
            Terrain-->>Engine: Re-project to Nearest Walkable Land
        else Center on Valid Land
            Terrain-->>Engine: Coordinates Approved
        end
    end

    Engine-->>CLI: Final 5-Phase Zone Sequence lt 15 ms latency
    CLI-->>Coach: Render Multi-Stage Circles Shift Arrows and Heatmap
```

---

## 🔧 Data Flow & Training Lifecycle

```mermaid
flowchart LR
    subgraph RAW["📁 Raw Data"]
        R1["🗺️ Erangel Map\n8K / 2K PNG"]
        R2["📡 Match Telemetry\nJSON Logs"]
    end

    subgraph PROCESS["⚙️ Processing"]
        P1["🎭 Terrain Mask\nExtractor"]
        P2["📊 Telemetry\nParser Pipeline"]
        P3["🔢 Feature\nEngineering CSV"]
    end

    subgraph TRAIN["🏋️ Training"]
        T1["5-Fold\nCross-Validation"]
        T2["XGBoost\nRegressor x4"]
        T3["Model\nSerialization\n.json"]
    end

    subgraph INFER["⚡ Inference"]
        I1["Zone Predictor\nEngine"]
        I2["Containment\nPhysics Check"]
        I3["Terrain\nValidation"]
    end

    subgraph VIZ["📊 Visualization"]
        V1["OpenCV\nTactical Overlay"]
        V2["2D Gaussian\nHeatmap"]
        V3["Streamlit\nDashboard"]
        V4["React\nFrontend"]
    end

    R1 --> P1
    R2 --> P2 --> P3
    P3 --> T1 --> T2 --> T3
    T3 --> I1
    P1 --> I3
    I1 --> I2 --> I3 --> V1 & V2 & V3 & V4
```

---

## 📁 Repository Structure

```
RunForZone/
│
├── 📦 src/
│   └── zone_predictor/              # Production Python Package
│       ├── __init__.py              # Top-level package exports
│       ├── config.py                # Erangel constants, phase radii, color palette
│       ├── terrain/
│       │   └── mask_generator.py    # [FR-04] OpenCV binary terrain mask & reprojection
│       ├── telemetry/
│       │   └── parser.py            # [FR-01] JSON telemetry parser & feature engineering
│       ├── models/
│       │   ├── trainer.py           # [FR-02] XGBoost training & 5-fold cross-validation
│       │   └── engine.py            # [FR-03] Containment physics & inference engine
│       └── visualization/
│           └── overlay.py           # [FR-05] OpenCV & Matplotlib overlays & heatmaps
│
├── ⚛️  frontend/                    # React + Vite Frontend UI
│   ├── src/
│   │   └── components/
│   │       └── ImageMapPredictor.jsx  # Interactive zone prediction map component
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── 📂 data/
│   ├── raw/                         # 8K/2K Erangel maps & match telemetry logs
│   ├── processed/                   # Structured feature CSVs
│   └── masks/                       # Binary terrain masks (erangel_mask.png)
│
├── 🤖 models/                       # Serialized XGBoost models (.json) & metadata
├── 📊 outputs/                      # Rendered maps, heatmaps & evaluation charts
├── 🧪 tests/
│   └── test_containment.py          # Geometric boundary clamp & latency tests
│
├── main.py                          # Unified CLI Entry Point
├── app.py                           # Streamlit Tactical Analyst Dashboard
├── demo_pipeline.py                 # Master end-to-end pipeline runner
├── train_zone_predictor.py          # Standalone training script
├── train_on_tournaments.py          # Tournament-grade batch training
├── evaluate_accuracy.py             # Accuracy evaluation & benchmarking
├── telemetry_parser.py              # Standalone telemetry parser
├── terrain_mask_generator.py        # Standalone mask generator
├── visualizer.py                    # Standalone visualization utilities
├── zone_predictor_engine.py         # Standalone inference engine
├── requirements.txt                 # Python dependencies
└── pyproject.toml                   # Package metadata
```

---

## 📐 Mathematical & Geometric Formulations

### 1. Polar Coordinate Shift Formulation

In circular safe zone shrinking, modeling shifts in Cartesian space (X, Y) ignores radial constraints. The engine predicts in **polar space**:

$$\Delta X = r \cdot \cos(\theta), \quad \Delta Y = r \cdot \sin(\theta)$$

where:
- **r** — Radial shift magnitude, bounded: $0 \le r \le (R_n - R_{n+1})$
- **θ** — Directional angle relative to current phase center: $\theta \in [0°, 360°)$

```mermaid
graph LR
    A["Current Phase Center\nXn Yn Rn"]
    B["XGBoost Predicts\nr Distance Magnitude\ntheta Direction Angle"]
    C["Polar to Cartesian\ndeltaX = r cos theta\ndeltaY = r sin theta"]
    D["Next Phase Center\nXn+1 Yn+1 Rn+1"]
    A --> B --> C --> D
```

### 2. Strict Geometric Containment (FR-03)

A valid Battle Royale phase circle $C_{n+1}$ must reside **100% inside** the prior phase circle $C_n$:

$$\sqrt{(X_{n+1} - X_n)^2 + (Y_{n+1} - Y_n)^2} \le (R_n - R_{n+1})$$

If the predicted center violates this bound, the engine scales the translation vector down:

$$\vec{P}_{n+1} = \vec{P}_n + \frac{\vec{\Delta}}{\|\vec{\Delta}\|} \cdot (R_n - R_{n+1}) \cdot 0.98$$

### 3. Terrain Water Filter & Land Re-projection (FR-04)

Using an OpenCV binary mask $M(x, y) \in \{0, 255\}$, if a predicted center lands on water ($M(x,y) = 0$), the Euclidean distance transform projects it to the closest walkable land:

$$\vec{P}^* = \arg\min_{\vec{p} \in \text{Land}} \|\vec{p} - \vec{P}_{n+1}\|$$

---

## ⚡ Model Performance & Evaluation

Evaluated using **5-Fold Cross-Validation** on real tournament match shifts (converted to meters: $1\text{ m} = 100\text{ units}$):

| Phase Transition | Distance MAE (m) | Direction MAE (°) | 2D Euclidean MAE (m) | P90 Error (m) |
| :---: | :---: | :---: | :---: | :---: |
| **Phase 1 → 2** | 197.07 m | 68.10° | 531.97 m | 833.43 m |
| **Phase 2 → 3** | 88.20 m | 88.65° | 322.85 m | 529.86 m |
| **Phase 3 → 4** | 67.54 m | 78.48° | 218.10 m | 379.16 m |
| **Phase 4 → 5** | **37.98 m** | 78.91° | **116.41 m** | **193.98 m** |
| **Overall Average** | **97.70 m** | **78.53°** | **297.33 m** | — |

> [!TIP]
> **Inference Latency:** Single full 5-phase prediction completes in **~10–13 ms** against a **< 500 ms** SLA — roughly **40× faster than requirement**.

```mermaid
xychart-beta
    title "Phase Transition — 2D Euclidean MAE in meters"
    x-axis ["Ph 1to2", "Ph 2to3", "Ph 3to4", "Ph 4to5"]
    y-axis "MAE meters" 0 --> 600
    bar [531.97, 322.85, 218.10, 116.41]
    line [531.97, 322.85, 218.10, 116.41]
```

---

## 🚀 Quick Start

### Prerequisites

- Python **3.12+**
- Node.js **18+** (for the React frontend)

### 1. Clone & Install Python Backend

```bash
git clone https://github.com/dakshsaini2/RunForZone.git
cd RunForZone
pip install -r requirements.txt
```

### 2. Launch Streamlit Analyst Dashboard

```bash
# Via the unified CLI:
python main.py ui

# Or directly:
python -m streamlit run app.py
```

### 3. Launch React Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## 🖥️ CLI Reference

The unified `main.py` CLI exposes the full engine pipeline:

```mermaid
flowchart TD
    CLI["python main.py"]

    CLI --> DEMO["demo\nRun full end-to-end\npipeline demonstration"]
    CLI --> TRAIN["train\nTrain XGBoost models\nwith 5-fold CV"]
    CLI --> PREDICT["predict\nRun inference on\ncustom coordinates"]
    CLI --> MASK["mask\nExtract binary terrain\nmask from map PNG"]
    CLI --> PARSE["parse\nParse match telemetry\nJSON replay logs"]
    CLI --> UI["ui\nLaunch Streamlit\ntactical dashboard"]
    CLI --> TEST["test\nRun unit and\nintegration tests"]
```

**Command examples:**

```powershell
# Full demo pipeline (Data → Train → Predict → Render)
python main.py demo

# Train XGBoost phase regressors
python main.py train --features data/processed/features.csv --models models/

# Predict zone shifts from custom coordinates
python main.py predict --p1 410000 390000 --flight-start 120000 160000 --flight-end 680000 680000

# Extract terrain mask from Erangel map image
python main.py mask --input data/raw/erangel_map.png --output data/masks/erangel_mask.png

# Parse match telemetry JSON logs
python main.py parse --input data/raw/telemetry --output data/processed/telemetry_features.csv

# Run unit & integration test suite
python main.py test
```

---

## ⚛️ React Frontend UI

The `frontend/` directory contains a **React 19 + Vite** interactive zone prediction interface.

```
frontend/
├── src/
│   └── components/
│       └── ImageMapPredictor.jsx   # Main interactive map component
├── index.html
├── vite.config.js
└── package.json
```

**Run frontend:**
```bash
cd frontend
npm install
npm run dev      # Development server → http://localhost:5173
npm run build    # Production build → dist/
```

**Stack:** React 19 · Vite 8.3 · Lucide React icons

---

## 📊 Visual Output Gallery

All rendered assets are exported to [`outputs/`](./outputs/):

| Asset | Description |
| :--- | :--- |
| `original_map_all_stages.png` | Tactical map with probability heatmap overlay |
| `original_map_all_stages_matplotlib.png` | Publication-quality coordinate overlay |
| `feature_importance.png` | XGBoost feature importance visualization |
| `erangel_mask_preview.png` | Binary terrain mask verification preview |
| `cli_prediction.png` | Output from CLI `predict` command |



## 📄 License & Attribution

Designed for esports analytical research and rotation modeling.

> **BGMI / PUBG** game assets, map topologies, and all related intellectual property are the property of **Krafton, Inc.** This project is an independent offline analytics tool with no affiliation to Krafton.

