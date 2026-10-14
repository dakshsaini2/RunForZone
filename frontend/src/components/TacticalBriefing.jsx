import React, { useState } from 'react';
import { 
  Radio, 
  MapPin, 
  Copy, 
  Check, 
  Car, 
  Compass, 
  AlertTriangle,
  Clock
} from 'lucide-react';
import { generateTacticalBriefing } from '../utils/engine';

export default function TacticalBriefing({ phases, flightPath }) {
  const [copied, setCopied] = useState(false);
  const briefing = generateTacticalBriefing(phases, flightPath);

  const handleCopyBrief = () => {
    const text = `=== 🎯 MATCH ROTATION BRIEF ===
Projected Final Circle: [${briefing.endgameGrid}] ${briefing.primaryAnchor} (${briefing.endgameTerrain})
Rotation Urgency: ${briefing.urgency} (Move Window: ${briefing.moveWindow})
Vehicle Status: ${briefing.vehicleStatus}
Stage 2 Shift: ${briefing.shiftType} - ${briefing.shiftDescription}
Flight Heading: ${briefing.flightBearing}

STAGE PROGRESSION:
• Stage 1 (Drop Zone): Grid [${phases[1]?.grid}] Radius: ${phases[1]?.r}m
• Stage 2 (Primary Shift): Grid [${phases[2]?.grid}] Shift: ${phases[2]?.shiftDist}m (${phases[2]?.compass})
• Stage 3 (Mid Choke): Grid [${phases[3]?.grid}] Shift: ${phases[3]?.shiftDist}m (${phases[3]?.compass})
• Stage 4 (Late Collapse): Grid [${phases[4]?.grid}] Shift: ${phases[4]?.shiftDist}m (${phases[4]?.compass})
• Stage 5 (Final Victory): Grid [${phases[5]?.grid}] Shift: ${phases[5]?.shiftDist}m (${phases[5]?.compass})

SQUAD PROTOCOL:
${briefing.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
===============================`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="briefing-deck tactical-card">
      <div className="deck-header">
        <div className="header-left">
          <Radio size={15} style={{ color: briefing.urgencyColor }} />
          <div>
            <h3 className="deck-title">Rotation Advisory</h3>
            <span className="deck-subtitle">Strategic overview for squad movement</span>
          </div>
        </div>

        <button
          className="copy-brief-btn"
          onClick={handleCopyBrief}
          title="Copy formatted comms to clipboard"
        >
          {copied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
          <span>{copied ? 'Copied to Clipboard' : 'Copy Team Comms'}</span>
        </button>
      </div>

      {/* Core Rotation KPIs */}
      <div className="kpi-grid">
        {/* KPI 1: Final Circle */}
        <div className="kpi-card highlight-endgame">
          <div className="kpi-top">
            <span className="kpi-label">
              <MapPin size={12} />
              <span>Projected Final Zone</span>
            </span>
            <span className="grid-badge mono">Grid {briefing.endgameGrid}</span>
          </div>
          <div className="kpi-main">
            <span className="kpi-value">{briefing.primaryAnchor}</span>
            <span className="kpi-subtext">{briefing.endgameTerrain}</span>
          </div>
        </div>

        {/* KPI 2: Rotation Urgency */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">
              <Clock size={12} />
              <span>Rotation Urgency</span>
            </span>
            <span className="urgency-pill" style={{ color: briefing.urgencyColor, backgroundColor: `${briefing.urgencyColor}18` }}>
              {briefing.urgencyBadge}
            </span>
          </div>
          <div className="kpi-main">
            <span className="kpi-value" style={{ color: briefing.urgencyColor }}>
              {briefing.urgency}
            </span>
            <span className="kpi-subtext">Move Window: <b>{briefing.moveWindow}</b></span>
          </div>
        </div>

        {/* KPI 3: Vehicle Priority */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">
              <Car size={12} />
              <span>Vehicle Priority</span>
            </span>
            <span className="kpi-badge mono">{briefing.vehicleStatus}</span>
          </div>
          <div className="kpi-main">
            <span className="kpi-value">
              {briefing.vehicleStatus === 'MANDATORY' ? '🚗 Secure Vehicles' : '🚶 Defilade Walk'}
            </span>
            <span className="kpi-subtext">
              {briefing.vehicleStatus === 'MANDATORY' ? 'Required for deep rotation' : 'Safe on foot'}
            </span>
          </div>
        </div>

        {/* KPI 4: Stage 2 Shift */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">
              <Compass size={12} />
              <span>Stage 2 Shift</span>
            </span>
            <span className="kpi-badge mono">{briefing.shiftType}</span>
          </div>
          <div className="kpi-main">
            <span className="kpi-value">{briefing.shiftDescription}</span>
            <span className="kpi-subtext">Plane Heading: {briefing.flightBearing}</span>
          </div>
        </div>
      </div>

      {/* Choke Alert Banner */}
      {briefing.chokeAlert && (
        <div className="choke-banner" style={{ borderColor: briefing.chokeAlert.color }}>
          <AlertTriangle size={15} style={{ color: briefing.chokeAlert.color, flexShrink: 0 }} />
          <span><b>{briefing.chokeAlert.level}:</b> {briefing.chokeAlert.message}</span>
        </div>
      )}

      {/* Action Plan */}
      <div className="action-plan-box">
        <div className="plan-title">Tactical Execution Plan</div>
        <div className="plan-list">
          {briefing.recommendations.map((rec, index) => (
            <div key={index} className="plan-item">
              <span className="plan-num mono">{index + 1}</span>
              <span className="plan-text">{rec}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .briefing-deck {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 18px 20px;
        }

        .deck-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .deck-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .deck-subtitle {
          font-size: 11.5px;
          color: var(--text-muted);
        }

        .copy-brief-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 11.5px;
          font-weight: 600;
          border-radius: var(--radius-sm);
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-medium);
          color: var(--text-primary);
          transition: all 0.15s ease;
        }

        .copy-brief-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-focus);
          color: var(--border-focus);
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 12px;
        }

        .kpi-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .kpi-card.highlight-endgame {
          border-color: rgba(124, 58, 237, 0.4);
        }

        .kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .kpi-label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .grid-badge, .kpi-badge {
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 3px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
        }

        .urgency-pill {
          font-size: 10.5px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .kpi-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .kpi-value {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .kpi-subtext {
          font-size: 11px;
          color: var(--text-muted);
        }

        .choke-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          background: var(--color-danger-bg);
          border: 1px solid;
          font-size: 12px;
          color: var(--text-primary);
        }

        .action-plan-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
        }

        .plan-title {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .plan-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .plan-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12.5px;
          color: var(--text-primary);
          line-height: 1.4;
        }

        .plan-num {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-medium);
          font-size: 10.5px;
          font-weight: 700;
          color: var(--text-muted);
          flex-shrink: 0;
          margin-top: 1px;
        }
      `}</style>
    </div>
  );
}
