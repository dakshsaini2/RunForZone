import React, { useState } from 'react';
import { 
  Radio, 
  AlertCircle, 
  MapPin, 
  Copy, 
  Check, 
  Flame, 
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { generateTacticalBriefing } from '../utils/engine';

export default function TacticalBriefing({ phases, flightPath }) {
  const [copied, setCopied] = useState(false);
  const briefing = generateTacticalBriefing(phases, flightPath);

  const handleCopyBrief = () => {
    const text = `=== RUNFORZONE TACTICAL BRIEFING ===
Flight Vector: Bearing ${briefing.flightBearing}
Rotation Urgency: ${briefing.urgency}
Projected Phase 5 Endgame: Grid [${briefing.endgameGrid}] near ${briefing.primaryAnchor}

PHASE COORDINATES:
- Phase 1: (${Math.round(phases[1].x)}m, ${Math.round(phases[1].y)}m) | Radius: ${phases[1].r}m [Grid ${phases[1].grid}]
- Phase 2: (${Math.round(phases[2].x)}m, ${Math.round(phases[2].y)}m) | Shift: ${Math.round(phases[2].shiftDist)}m (${phases[2].compass})
- Phase 3: (${Math.round(phases[3].x)}m, ${Math.round(phases[3].y)}m) | Shift: ${Math.round(phases[3].shiftDist)}m (${phases[3].compass})
- Phase 4: (${Math.round(phases[4].x)}m, ${Math.round(phases[4].y)}m) | Shift: ${Math.round(phases[4].shiftDist)}m (${phases[4].compass})
- Phase 5: (${Math.round(phases[5].x)}m, ${Math.round(phases[5].y)}m) | Shift: ${Math.round(phases[5].shiftDist)}m (${phases[5].compass})

TACTICAL RECOMMENDATIONS:
${briefing.recommendations.map(r => `• ${r}`).join('\n')}
====================================`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="briefing-card tactical-card">
      <div className="briefing-header">
        <div className="header-title">
          <Radio size={15} className="title-icon" />
          <span>Rotation Advisory</span>
        </div>
        <button
          className="copy-btn"
          onClick={handleCopyBrief}
          title="Copy brief to clipboard for team comms"
        >
          {copied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy Zone Brief'}</span>
        </button>
      </div>

      <div className="briefing-content">
        {/* Urgency Alert Bar */}
        <div
          className="urgency-banner"
          style={{
            borderColor: briefing.urgencyColor,
            background: briefing.isHardShift ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)'
          }}
        >
          <div className="urgency-status">
            <span className="urgency-tag" style={{ color: briefing.urgencyColor }}>
              {briefing.urgency}
            </span>
            <span className="urgency-desc">
              {briefing.isHardShift
                ? 'Major hard shift. Outer teams must rotate immediately to avoid heavy circle damage.'
                : 'Standard center pull. Secure high-ground compounds inside the circle early.'}
            </span>
          </div>

          <div className="endgame-anchor mono">
            <span className="anchor-label">STAGE 5 TARGET</span>
            <span className="anchor-title">
              <MapPin size={13} style={{ color: briefing.urgencyColor }} />
              {briefing.primaryAnchor} [{briefing.endgameGrid}]
            </span>
          </div>
        </div>

        {/* Strategic Guidance Bullet Points */}
        <div className="recommendations-list">
          {briefing.recommendations.map((rec, i) => (
            <div key={i} className="rec-item">
              <ArrowUpRight size={14} className="rec-bullet" />
              <span>{rec}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .briefing-card {
          display: flex;
          flex-direction: column;
        }

        .briefing-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-surface-subtle);
          flex-wrap: wrap;
          gap: 8px;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 13px;
          color: var(--text-primary);
        }

        .title-icon {
          color: #dc2626;
        }

        .copy-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          background: var(--bg-surface);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .copy-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .briefing-content {
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .urgency-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          border-left: 4px solid;
          gap: 16px;
          flex-wrap: wrap;
        }

        .urgency-status {
          display: flex;
          flex-direction: column;
          gap: 3px;
          max-width: 600px;
        }

        .urgency-tag {
          font-weight: 800;
          font-size: 12px;
          letter-spacing: 0.04em;
        }

        .urgency-desc {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .endgame-anchor {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .anchor-label {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
        }

        .anchor-title {
          display: flex;
          align-items: center;
          gap: 5px;
          font-weight: 700;
          font-size: 12px;
          color: var(--text-primary);
        }

        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .rec-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .rec-bullet {
          color: #2563eb;
          flex-shrink: 0;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
