import React from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  Navigation2, 
  Maximize, 
  Circle,
  ShieldCheck
} from 'lucide-react';
import { PHASE_CONFIG } from '../utils/engine';

export default function TelemetryMatrix({
  phases,
  activePhase,
  setActivePhase
}) {
  const phaseEntries = Object.values(phases).sort((a, b) => a.phase - b.phase);

  return (
    <div className="telemetry-deck tactical-card">
      <div className="telemetry-header">
        <div className="deck-title">
          <BarChart3 size={15} className="title-icon" />
          <span>Stage Breakdown (Stages 1–5)</span>
        </div>
      </div>

      <div className="phase-cards-container">
        {phaseEntries.map((p) => {
          const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb', label: `Stage ${p.phase}` };
          const isSelected = activePhase === p.phase;
          const isPhase1 = p.phase === 1;

          return (
            <div
              key={p.phase}
              className={`phase-card ${isSelected ? 'selected' : ''}`}
              style={{ '--phase-color': cfg.color }}
              onClick={() => setActivePhase(isSelected ? null : p.phase)}
            >
              <div className="phase-card-header">
                <div className="phase-pill">
                  <div className="phase-dot" style={{ background: cfg.color }} />
                  <span className="phase-name">Stage {p.phase}</span>
                  <span className="phase-sublabel">{cfg.name}</span>
                </div>

                <div className="phase-grid-badge mono">
                  GRID: <b>{p.grid}</b>
                </div>
              </div>

              <div className="phase-metrics-grid">
                <div className="metric-box">
                  <span className="metric-label">Circle Radius</span>
                  <span className="metric-val mono">
                    {p.r}m
                  </span>
                </div>

                <div className="metric-box">
                  <span className="metric-label">Shift Distance</span>
                  <span className="metric-val mono">
                    {isPhase1 ? 'Initial Drop' : `${Math.round(p.shiftDist)}m`}
                  </span>
                </div>

                <div className="metric-box">
                  <span className="metric-label">Shift Direction</span>
                  <span className="metric-val mono">
                    {isPhase1 ? 'Center Drop' : `${p.compass}`}
                  </span>
                </div>

                <div className="metric-box">
                  <span className="metric-label">Center Point</span>
                  <span className="metric-val mono">
                    {Math.round(p.x)}m, {Math.round(p.y)}m
                  </span>
                </div>
              </div>

              {/* Status footer for each phase */}
              <div className="phase-footer">
                <span className="footer-tag tag-containment">
                  <CheckCircle2 size={11} />
                  <span>Stage {p.phase} Safe Zone</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .telemetry-deck {
          display: flex;
          flex-direction: column;
        }

        .telemetry-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-surface-subtle);
          flex-wrap: wrap;
          gap: 8px;
        }

        .deck-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 13px;
          color: var(--text-primary);
        }

        .title-icon {
          color: #059669;
        }

        .deck-status-badges {
          display: flex;
          gap: 8px;
        }

        .phase-cards-container {
          padding: 14px 18px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 12px;
        }

        .phase-card {
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          border-left: 4px solid var(--phase-color);
          border-radius: var(--radius-sm);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .phase-card:hover {
          background: var(--bg-hover);
          border-color: var(--border-medium);
          transform: translateY(-1px);
        }

        .phase-card.selected {
          border-color: var(--phase-color);
          box-shadow: 0 0 0 1px var(--phase-color);
          background: var(--bg-surface);
        }

        .phase-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .phase-pill {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .phase-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .phase-name {
          font-weight: 800;
          font-size: 13px;
          color: var(--text-primary);
        }

        .phase-sublabel {
          font-size: 10px;
          color: var(--text-muted);
        }

        .phase-grid-badge {
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--bg-surface);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .phase-metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .metric-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-label {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .metric-val {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .metric-val small {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: normal;
        }

        .phase-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
          flex-wrap: wrap;
        }

        .footer-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: var(--radius-sm);
        }

        .tag-containment {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .tag-reproject {
          background: var(--color-info-bg);
          color: var(--color-info);
        }
      `}</style>
    </div>
  );
}
