import React, { useState } from 'react';
import { 
  Upload, 
  Map, 
  ArrowRight, 
  Crosshair, 
  Compass, 
  CheckCircle2, 
  Layers,
  ChevronRight
} from 'lucide-react';
import { PHASE_CONFIG } from '../utils/engine';

export default function LandingPage({ onLaunchStudio, onLaunchImagePredictor }) {
  const [activeStageTab, setActiveStageTab] = useState(1);

  const stagesData = [
    {
      stage: 1,
      name: 'Drop Zone',
      radius: '2,000m',
      shift: 'Flight Path Drop Zone',
      landmark: 'Mainland Central',
      color: '#2563eb',
      desc: 'Initial 4km drop area based on the plane flight path.'
    },
    {
      stage: 2,
      name: 'First Shift',
      radius: '1,100m',
      shift: 'Shift: 680m (WSW)',
      landmark: 'Pochinki Hills',
      color: '#059669',
      desc: 'First major rotation pull. Outer teams secure vehicles and rotate.'
    },
    {
      stage: 3,
      name: 'Mid Zone',
      radius: '700m',
      shift: 'Shift: 420m (South)',
      landmark: 'River Crossing',
      color: '#d97706',
      desc: 'River bridges and bottleneck valleys become critical choke points.'
    },
    {
      stage: 4,
      name: 'Late Zone',
      radius: '400m',
      shift: 'Shift: 260m (NW)',
      landmark: 'Farm Compound',
      color: '#dc2626',
      desc: 'Circle shrinks rapidly. High-ground compound control decides the fight.'
    },
    {
      stage: 5,
      name: 'Final Circle',
      radius: '200m',
      shift: 'Shift: 140m (West)',
      landmark: 'Hilltop Crest',
      color: '#7c3aed',
      desc: 'Final endgame safe zone. Tactical crest control secures the win.'
    }
  ];

  return (
    <div className="landing-clean">
      {/* 1. HERO SECTION */}
      <section className="clean-hero">
        <div className="hero-pill">
          <span className="pill-dot" />
          <span>BGMI & PUBG Safe Zone Predictor</span>
        </div>

        <h1 className="hero-title">
          Predict Safe Zone Shifts <br />
          <span className="hero-accent">Before The Circle Moves</span>
        </h1>

        <p className="hero-lead">
          Upload a match map screenshot or simulate flight paths to see upcoming safe zone predictions for Stages 1 through 5 in real time.
        </p>

        <div className="hero-actions">
          <button
            className="action-btn btn-primary"
            onClick={onLaunchImagePredictor}
          >
            <Upload size={16} />
            <span>Upload Map Image</span>
          </button>

          <button
            className="action-btn btn-secondary"
            onClick={onLaunchStudio}
          >
            <Map size={16} />
            <span>Try Zone Simulator</span>
          </button>
        </div>
      </section>

      {/* 2. STAGE-WISE MULTIPLE MAPS BREAKDOWN */}
      <section className="stage-wise-section">
        <div className="section-header">
          <div className="header-tag">STAGE-BY-STAGE</div>
          <h2 className="header-title">Forecast Across All 5 Stages</h2>
          <p className="header-subtitle">
            See the exact circle size, shift direction, and high-ground targets stage by stage.
          </p>
        </div>

        {/* 5 Stage Cards Grid */}
        <div className="stages-grid">
          {stagesData.map((s) => (
            <div
              key={s.stage}
              className={`stage-card tactical-card ${activeStageTab === s.stage ? 'selected' : ''}`}
              style={{ '--accent-color': s.color }}
              onClick={() => setActiveStageTab(s.stage)}
            >
              <div className="card-top">
                <span className="card-stage-badge" style={{ background: s.color }}>
                  STAGE {s.stage}
                </span>
                <span className="card-radius mono">{s.radius}</span>
              </div>

              <div className="card-preview">
                <img
                  src="/samples/match_sample_1.png"
                  alt={`Stage ${s.stage} Map`}
                  className="card-map-img"
                />
                <div className="card-shift-tag mono">
                  {s.shift}
                </div>
              </div>

              <div className="card-content">
                <div className="card-name">{s.name}</div>
                <div className="card-desc">{s.desc}</div>
                <div className="card-landmark mono">
                  <span>Target:</span> <b>{s.landmark}</b>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="center-action">
          <button
            className="action-btn btn-primary"
            onClick={onLaunchImagePredictor}
          >
            <Layers size={16} />
            <span>Upload Your Map to View All Stages</span>
          </button>
        </div>
      </section>

      {/* 3. HOW IT WORKS (3 SIMPLE STEPS) */}
      <section className="how-it-works-section">
        <div className="section-header">
          <div className="header-tag">HOW IT WORKS</div>
          <h2 className="header-title">3 Simple Steps</h2>
        </div>

        <div className="steps-row">
          <div className="step-card tactical-card">
            <div className="step-num mono">1</div>
            <h3 className="step-title">Upload Map Screenshot</h3>
            <p className="step-text">
              Take a screenshot of your match map during the game and upload it.
            </p>
          </div>

          <div className="step-card tactical-card">
            <div className="step-num mono">2</div>
            <h3 className="step-title">See Predicted Stages</h3>
            <p className="step-text">
              Instantly view safe zone circles and shift directions for Stages 1 to 5.
            </p>
          </div>

          <div className="step-card tactical-card">
            <div className="step-num mono">3</div>
            <h3 className="step-title">Rotate Early & Win</h3>
            <p className="step-text">
              Check shift direction and secure high-ground compounds before the circle moves.
            </p>
          </div>
        </div>
      </section>

      {/* 4. CLEAN BOTTOM CTA */}
      <section className="clean-cta-box tactical-card">
        <div className="cta-left">
          <h3 className="cta-title">Ready To Predict Your Match Zones?</h3>
          <p className="cta-sub">
            Upload your map screenshot or launch the interactive simulator.
          </p>
        </div>

        <div className="cta-right">
          <button
            className="action-btn btn-primary"
            onClick={onLaunchImagePredictor}
          >
            <Upload size={15} />
            <span>Upload Map Image</span>
          </button>

          <button
            className="action-btn btn-secondary"
            onClick={onLaunchStudio}
          >
            <Map size={15} />
            <span>Open Simulator</span>
          </button>
        </div>
      </section>

      <style>{`
        .landing-clean {
          display: flex;
          flex-direction: column;
          gap: 56px;
          padding: 20px 0 40px;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
        }

        /* Hero */
        .clean-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 18px;
          padding: 24px 16px 0;
          max-width: 860px;
          margin: 0 auto;
        }

        .hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #2563eb;
        }

        .hero-title {
          font-size: 44px;
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.025em;
          color: var(--text-primary);
        }

        .hero-accent {
          color: #2563eb;
        }

        .hero-lead {
          font-size: 16px;
          line-height: 1.6;
          color: var(--text-secondary);
          max-width: 680px;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          font-size: 13px;
          font-weight: 700;
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
        }

        .btn-primary {
          background: #2563eb;
          color: #ffffff;
        }

        .btn-primary:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: var(--bg-surface);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
        }

        /* Section Headers */
        .section-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 640px;
          margin: 0 auto 28px;
        }

        .header-tag {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          color: #2563eb;
          letter-spacing: 0.06em;
        }

        .header-title {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }

        .header-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
        }

        /* Stage-Wise Grid */
        .stage-wise-section {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .stages-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .stage-card {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-top: 3px solid var(--accent-color);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          cursor: pointer;
        }

        .stage-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
        }

        .card-stage-badge {
          font-size: 10px;
          font-weight: 800;
          color: #ffffff;
          padding: 2px 7px;
          border-radius: 3px;
        }

        .card-radius {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-preview {
          position: relative;
          background: #0f172a;
          height: 150px;
          overflow: hidden;
        }

        .card-map-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .card-shift-tag {
          position: absolute;
          bottom: 6px;
          left: 6px;
          background: rgba(15, 23, 42, 0.88);
          color: #ffffff;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .card-content {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }

        .card-name {
          font-size: 13px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .card-desc {
          font-size: 11px;
          color: var(--text-secondary);
          line-height: 1.45;
        }

        .card-landmark {
          margin-top: auto;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle);
          font-size: 11px;
          color: var(--text-muted);
        }

        .card-landmark b {
          color: var(--text-primary);
        }

        .center-action {
          display: flex;
          justify-content: center;
          margin-top: 6px;
        }

        /* How it works */
        .how-it-works-section {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .steps-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .step-card {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .step-num {
          font-size: 24px;
          font-weight: 800;
          color: #2563eb;
        }

        .step-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .step-text {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.55;
        }

        /* Clean CTA Box */
        .clean-cta-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 28px 32px;
          gap: 20px;
          flex-wrap: wrap;
        }

        .cta-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 520px;
        }

        .cta-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .cta-sub {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .cta-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        @media (max-width: 768px) {
          .hero-title {
            font-size: 32px;
          }
          .clean-cta-box {
            flex-direction: column;
            align-items: flex-start;
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
}
