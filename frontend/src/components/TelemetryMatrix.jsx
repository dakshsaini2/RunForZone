import React from 'react';
import { 
  CheckCircle2, 
  MapPin, 
  Layers, 
  ChevronRight 
} from 'lucide-react';
import { PHASE_CONFIG, getErangelLandmark } from '../utils/engine';

export default function TelemetryMatrix({
  phases,
  activePhase,
  setActivePhase
}) {
  const phaseEntries = Object.values(phases).sort((a, b) => a.phase - b.phase);

  const getStageTacticalRole = (stageNum) => {
    switch (stageNum) {
      case 1: return { role: 'Initial Drop', tactic: 'Mainland drop area & vehicle scouting' };
      case 2: return { role: 'Primary Shift', tactic: 'First major rotation pull • Secure deep compounds' };
      case 3: return { role: 'Mid-Game Choke', tactic: 'River bridges & ridges become bottleneck zones' };
      case 4: return { role: 'Late Collapse', tactic: 'High-ground crest control & vehicle barricades' };
      case 5: return { role: 'Final Circle', tactic: 'Endgame victory defilade & smoke discipline' };
      default: return { role: 'Safe Zone', tactic: 'Rotational transit' };
    }
  };

  return (
    <div className="telemetry-deck tactical-card">
      <div className="telemetry-header">
        <div className="header-title">
          <Layers size={14} className="title-icon" />
          <span>Stage Progression (Stages 1 to 5)</span>
        </div>
        <span className="telemetry-hint">Click any stage to isolate on the map</span>
      </div>

      <div className="phase-cards-row">
        {phaseEntries.map((p) => {
          const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb', label: `Stage ${p.phase}` };
          const isSelected = activePhase === p.phase;
          const isPhase1 = p.phase === 1;
          const poi = getErangelLandmark(p.x, p.y);
          const meta = getStageTacticalRole(p.phase);

          return (
            <div
              key={p.phase}
              className={`phase-card ${isSelected ? 'selected' : ''}`}
              style={{ '--phase-color': cfg.color }}
              onClick={() => setActivePhase(isSelected ? null : p.phase)}
            >
              <div className="card-top-bar">
                <div className="stage-pill-tag" style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}>
                  <span className="dot" style={{ backgroundColor: cfg.color }} />
                  <span>Stage {p.phase}</span>
                </div>
                <span className="grid-ref-tag mono">Grid {p.grid}</span>
              </div>

              <div className="card-landmark">
                <span className="landmark-title">
                  <MapPin size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                  <span className="truncate">{poi.name}</span>
                </span>
                <span className="landmark-tactic">{meta.tactic}</span>
              </div>

              <div className="card-kpi-stack">
                <div className="kpi-line">
                  <span className="kpi-key">Zone Size:</span>
                  <span className="kpi-val mono">{(p.r * 2 / 1000).toFixed(1)}km</span>
                </div>
                <div className="kpi-line">
                  <span className="kpi-key">Circle Shift:</span>
                  <span className="kpi-val mono highlight">
                    {isPhase1 ? 'Drop Center' : `${p.shiftDist}m ${p.compass}`}
                  </span>
                </div>
              </div>

              <div className="card-status-footer">
                <span className="status-label">
                  <CheckCircle2 size={11} color={cfg.color} />
                  <span>{meta.role}</span>
                </span>
                <ChevronRight size={13} className="arrow-icon" />
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .telemetry-deck {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px 20px;
        }

        .telemetry-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13.5px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .title-icon {
          color: var(--color-phase1);
        }

        .telemetry-hint {
          font-size: 11px;
          color: var(--text-muted);
        }

        .phase-cards-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .phase-card {
          display: flex;
          flex-direction: column;
          gap: 9px;
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
          overflow: hidden;
        }

        .phase-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--phase-color);
        }

        .phase-card:hover {
          transform: translateY(-1px);
          border-color: var(--phase-color);
        }

        .phase-card.selected {
          border-color: var(--phase-color);
          background: var(--bg-surface);
          box-shadow: 0 0 0 1.5px var(--phase-color);
        }

        .card-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .stage-pill-tag {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }

        .stage-pill-tag .dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }

        .grid-ref-tag {
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 3px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
        }

        .card-landmark {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .landmark-title {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .landmark-tactic {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.35;
        }

        .card-kpi-stack {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 7px 9px;
          background: var(--bg-surface);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .kpi-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
        }

        .kpi-key {
          color: var(--text-muted);
        }

        .kpi-val {
          font-weight: 700;
          color: var(--text-primary);
        }

        .kpi-val.highlight {
          color: var(--phase-color);
        }

        .card-status-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 6px;
          border-top: 1px solid var(--border-subtle);
          font-size: 10.5px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .status-label {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .arrow-icon {
          color: var(--text-faint);
        }
      `}</style>
    </div>
  );
}
