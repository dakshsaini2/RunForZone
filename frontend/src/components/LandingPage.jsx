import React, { useState } from 'react';
import { 
  Upload, 
  Map, 
  ArrowRight, 
  Crosshair, 
  Compass, 
  CheckCircle2, 
  Layers,
  Sparkles,
  ShieldCheck,
  Car,
  Clock,
  MapPin,
  ChevronRight
} from 'lucide-react';
import { PHASE_CONFIG } from '../utils/engine';

export default function LandingPage({ onLaunchStudio, onLaunchImagePredictor }) {
  const [activeStageTab, setActiveStageTab] = useState(1);

  const stagesData = [
    {
      stage: 1,
      name: 'Drop Zone',
      radius: '2,000m (4.0km)',
      shift: 'Flight Path Drop Circle',
      landmark: 'Mainland Central',
      grid: 'E4',
      tactic: 'Initial 4km drop area. Prioritize vehicle scouts and weapons before Phase 1 timer expires.',
      color: '#2563eb'
    },
    {
      stage: 2,
      name: 'Primary Shift',
      radius: '1,100m (2.2km)',
      shift: 'Shift: 348m (SW)',
      landmark: 'Pochinki Church Ridge',
      grid: 'E4',
      tactic: 'First major rotation pull. High ground claims open early deep lines for outer squads.',
      color: '#059669'
    },
    {
      stage: 3,
      name: 'Mid-Game Choke',
      radius: '650m (1.3km)',
      shift: 'Shift: 171m (SW)',
      landmark: 'River Crossing Bluff',
      grid: 'D4',
      tactic: 'River crossings and valley defilades become critical gatekeeping choke points.',
      color: '#d97706'
    },
    {
      stage: 4,
      name: 'Late Collapse',
      radius: '350m (700m)',
      shift: 'Shift: 177m (SW)',
      landmark: 'Farm Defilade Compounds',
      grid: 'E4',
      tactic: 'Circle shrinks rapidly. High-ground compound control and vehicle barricades decide fights.',
      color: '#dc2626'
    },
    {
      stage: 5,
      name: 'Endgame Climax',
      radius: '180m (360m)',
      shift: 'Shift: 95m (W)',
      landmark: 'Church Hill Crest',
      grid: 'E4',
      tactic: 'Final tactical safe zone. Hull-down vehicle hull ridges and smoke discipline secure the win.',
      color: '#7c3aed'
    }
  ];

  const currentStage = stagesData.find((s) => s.stage === activeStageTab) || stagesData[0];

  return (
    <div className="landing-clean">
      {/* 1. HERO SECTION */}
      <section className="clean-hero">
        <div className="hero-pill">
          <span className="pill-dot" />
          <span>BGMI & PUBG Multi-Stage Safe Zone Predictor</span>
          <span className="pill-badge">XGBoost ML</span>
        </div>

        <h1 className="hero-title">
          Predict Circle Shifts <br />
          <span className="hero-accent">Before The Zone Moves</span>
        </h1>

        <p className="hero-lead">
          Abstract complex tournament telemetry into instant, actionable rotation intelligence.
          Predict safe zone shifts from Stages 1 to 5 with sub-millisecond machine learning inference.
        </p>

        <div className="hero-actions">
          <button
            className="action-btn btn-primary"
            onClick={onLaunchStudio}
          >
            <Map size={16} />
            <span>Launch Tactical Simulator</span>
            <ArrowRight size={14} />
          </button>

          <button
            className="action-btn btn-secondary"
            onClick={onLaunchImagePredictor}
          >
            <Upload size={16} />
            <span>Scan Match Screenshot</span>
          </button>
        </div>
      </section>

      {/* 2. THREE ABSTRACTED CORE CAPABILITIES */}
      <section className="capabilities-grid">
        <div className="capability-card tactical-card">
          <div className="cap-icon-box" style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
            <MapPin size={20} />
          </div>
          <h3 className="cap-title">Endgame Anchor Prediction</h3>
          <p className="cap-desc">
            Instantly pinpoints the projected Phase 5 victory compound (e.g. Pochinki Church Crest [E4], Sosnovka Radar, Rozhok Ridge).
          </p>
        </div>

        <div className="capability-card tactical-card">
          <div className="cap-icon-box" style={{ background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
            <Clock size={20} />
          </div>
          <h3 className="cap-title">Rotation Urgency Index</h3>
          <p className="cap-desc">
            Classifies zone pull into Critical Immediate Rotations (&lt;90s) vs Stable Compound Holds, with vehicle necessity warnings.
          </p>
        </div>

        <div className="capability-card tactical-card">
          <div className="cap-icon-box" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
            <Sparkles size={20} />
          </div>
          <h3 className="cap-title">Production XGBoost ML</h3>
          <p className="cap-desc">
            Evaluates 300 gradient boosted regression trees natively client-side in under 1ms, with strict circle containment & land lock.
          </p>
        </div>
      </section>

      {/* 3. STAGE-WISE MULTI-PHASE EVOLUTION */}
      <section className="stage-wise-section tactical-card">
        <div className="section-header-row">
          <div>
            <div className="header-tag">STAGE-BY-STAGE PROGRESSION</div>
            <h2 className="header-title">Sequential Circle Evolution</h2>
            <p className="header-subtitle">
              Explore how safe zones shrink and shift from initial plane drop to the final 180m circle.
            </p>
          </div>
          <div className="stage-selector-chips">
            {stagesData.map((s) => (
              <button
                key={s.stage}
                className={`stage-select-btn ${activeStageTab === s.stage ? 'active' : ''}`}
                style={{ '--btn-color': s.color }}
                onClick={() => setActiveStageTab(s.stage)}
              >
                <span>Stage {s.stage}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Featured Stage Spotlight */}
        <div className="stage-spotlight-card" style={{ '--spotlight-color': currentStage.color }}>
          <div className="spotlight-left">
            <div className="spotlight-badge" style={{ backgroundColor: currentStage.color }}>
              STAGE {currentStage.stage} • {currentStage.name.toUpperCase()}
            </div>
            <h3 className="spotlight-title">{currentStage.landmark}</h3>
            <span className="spotlight-grid mono">Erangel Grid Ref: [{currentStage.grid}]</span>

            <div className="spotlight-kpis">
              <div className="kpi-mini">
                <span className="kpi-mini-label">Circle Radius</span>
                <span className="kpi-mini-val mono">{currentStage.radius}</span>
              </div>
              <div className="kpi-mini">
                <span className="kpi-mini-label">Shift Dynamics</span>
                <span className="kpi-mini-val mono">{currentStage.shift}</span>
              </div>
            </div>

            <p className="spotlight-tactic">{currentStage.tactic}</p>
          </div>

          <div className="spotlight-right">
            <div className="spotlight-preview-frame">
              <img
                src="/samples/match_sample_1.png"
                alt="Tactical Map Preview"
                className="spotlight-img"
              />
              <div className="overlay-pill mono">
                <span className="dot" style={{ backgroundColor: currentStage.color }} />
                <span>Stage {currentStage.stage} Active Safe Zone</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FAST CTA BANNER */}
      <section className="clean-cta-box tactical-card">
        <div className="cta-left">
          <h3 className="cta-title">Ready To Simulate Match Circles?</h3>
          <p className="cta-sub">
            Test custom flight angles, inspect multi-stage probability heatmaps, and export team briefs.
          </p>
        </div>

        <div className="cta-right">
          <button
            className="action-btn btn-primary"
            onClick={onLaunchStudio}
          >
            <Map size={15} />
            <span>Open Interactive Simulator</span>
          </button>
          <button
            className="action-btn btn-secondary"
            onClick={onLaunchImagePredictor}
          >
            <Upload size={15} />
            <span>Upload Screenshot</span>
          </button>
        </div>
      </section>

      <style>{`
        .landing-clean {
          display: flex;
          flex-direction: column;
          gap: 40px;
          padding: 10px 0 30px;
          max-width: 1240px;
          margin: 0 auto;
          width: 100%;
        }

        /* Hero */
        .clean-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 16px;
          padding: 20px 16px 0;
          max-width: 820px;
          margin: 0 auto;
        }

        .hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-full);
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-secondary);
          box-shadow: var(--shadow-sm);
        }

        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #059669;
        }

        .pill-badge {
          background: rgba(37, 99, 235, 0.12);
          color: #2563eb;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
        }

        .hero-title {
          font-size: 40px;
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }

        .hero-accent {
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-lead {
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-secondary);
          max-width: 660px;
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
          padding: 10px 20px;
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          font-weight: 700;
          transition: all 0.15s ease;
        }

        .btn-primary {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
        }

        .btn-primary:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: var(--bg-surface);
          border: 1px solid var(--border-medium);
          color: var(--text-primary);
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
          border-color: var(--border-focus);
        }

        /* 3 Core Capabilities */
        .capabilities-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .capability-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 22px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }

        .cap-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--radius-sm);
        }

        .cap-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .cap-desc {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        /* Stage-Wise Evolution */
        .stage-wise-section {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 24px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }

        .section-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .header-tag {
          font-size: 11px;
          font-weight: 800;
          color: #2563eb;
          letter-spacing: 0.05em;
        }

        .header-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 2px 0 4px;
        }

        .header-subtitle {
          font-size: 13px;
          color: var(--text-muted);
        }

        .stage-selector-chips {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .stage-select-btn {
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-weight: 700;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          transition: all 0.15s ease;
        }

        .stage-select-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .stage-select-btn.active {
          background: var(--btn-color, #2563eb);
          border-color: var(--btn-color, #2563eb);
          color: #ffffff;
        }

        .stage-spotlight-card {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 24px;
          align-items: center;
          padding: 20px;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          border-left: 4px solid var(--spotlight-color);
          border-radius: var(--radius-md);
        }

        .spotlight-left {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .spotlight-badge {
          display: inline-block;
          align-self: flex-start;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 800;
          color: #ffffff;
        }

        .spotlight-title {
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0;
        }

        .spotlight-grid {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
        }

        .spotlight-kpis {
          display: flex;
          gap: 16px;
          margin-top: 4px;
        }

        .kpi-mini {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .kpi-mini-label {
          font-size: 10.5px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .kpi-mini-val {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .spotlight-tactic {
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-secondary);
        }

        .spotlight-right {
          display: flex;
          justify-content: center;
        }

        .spotlight-preview-frame {
          position: relative;
          width: 100%;
          max-width: 380px;
          aspect-ratio: 1;
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border-medium);
          background: #090c10;
        }

        .spotlight-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .overlay-pill {
          position: absolute;
          bottom: 12px;
          left: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
        }

        .overlay-pill .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        /* Bottom CTA */
        .clean-cta-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 30px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          flex-wrap: wrap;
          gap: 20px;
        }

        .cta-title {
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .cta-sub {
          font-size: 13px;
          color: var(--text-muted);
        }

        .cta-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        @media (max-width: 900px) {
          .stage-spotlight-card {
            grid-template-columns: 1fr;
          }
          .hero-title {
            font-size: 30px;
          }
        }
      `}</style>
    </div>
  );
}
