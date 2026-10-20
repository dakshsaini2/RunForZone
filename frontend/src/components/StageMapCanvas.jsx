import React, { useRef, useEffect } from 'react';
import { Download, Maximize2 } from 'lucide-react';
import { 
  MAP_EXTENT_METERS, 
  PHASE_CONFIG 
} from '../utils/engine';

export default function StageMapCanvas({
  stage, // 1 | 2 | 3 | 4 | 5 | 'all'
  phases,
  flightPath,
  imageObj,
  canvasWidth = 460,
  canvasHeight = 460,
  showHeatmap: _showHeatmap = true,
  onOpenFull = null
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw base map image
    if (imageObj) {
      ctx.drawImage(imageObj, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);
    }

    const mToPx = (m) => (m / MAP_EXTENT_METERS) * w;

    // 2. Flight Path (Rendered on Stage 1 or 'all')
    if ((stage === 1 || stage === 'all') && flightPath && flightPath.start && flightPath.end) {
      const f1x = mToPx(flightPath.start.x);
      const f1y = mToPx(flightPath.start.y);
      const f2x = mToPx(flightPath.end.x);
      const f2y = mToPx(flightPath.end.y);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(f1x, f1y);
      ctx.lineTo(f2x, f2y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flight direction arrow
      const angle = Math.atan2(f2y - f1y, f2x - f1x);
      const hLen = 14;
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(f2x, f2y);
      ctx.lineTo(f2x - hLen * Math.cos(angle - Math.PI / 7), f2y - hLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(f2x - (hLen * 0.6) * Math.cos(angle), f2y - (hLen * 0.6) * Math.sin(angle));
      ctx.lineTo(f2x - hLen * Math.cos(angle + Math.PI / 7), f2y - hLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();

      // Origin Marker
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f1x, f1y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Draw Stage-Specific Circles
    if (stage === 'all') {
      // Draw all 5 phases
      [1, 2, 3, 4, 5].forEach((pNum) => {
        const p = phases[pNum];
        if (!p) return;
        const cfg = PHASE_CONFIG[pNum];
        const cx = mToPx(p.x);
        const cy = mToPx(p.y);
        const cr = mToPx(p.r);

        ctx.fillStyle = cfg.bg || 'rgba(37, 99, 235, 0.08)';
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy);
        ctx.lineTo(cx + 5, cy);
        ctx.moveTo(cx, cy - 5);
        ctx.lineTo(cx, cy + 5);
        ctx.stroke();
      });

      // Shift vectors between phases
      for (let i = 1; i < 5; i++) {
        const curr = phases[i];
        const next = phases[i + 1];
        if (!curr || !next) continue;

        const c1x = mToPx(curr.x);
        const c1y = mToPx(curr.y);
        const c2x = mToPx(next.x);
        const c2y = mToPx(next.y);

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(c1x, c1y);
        ctx.lineTo(c2x, c2y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      const pNum = Number(stage);
      const curr = phases[pNum];
      if (!curr) return;
      const cfg = PHASE_CONFIG[pNum];

      // Draw previous phase outline as reference if stage > 1
      if (pNum > 1 && phases[pNum - 1]) {
        const prev = phases[pNum - 1];
        const prevCx = mToPx(prev.x);
        const prevCy = mToPx(prev.y);
        const prevCr = mToPx(prev.r);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(prevCx, prevCy, prevCr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Shift Vector Arrow from Prev -> Curr
        const c1x = prevCx;
        const c1y = prevCy;
        const c2x = mToPx(curr.x);
        const c2y = mToPx(curr.y);

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c1x, c1y);
        ctx.lineTo(c2x, c2y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead
        const arrowAngle = Math.atan2(c2y - c1y, c2x - c1x);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(c2x, c2y);
        ctx.lineTo(c2x - 10 * Math.cos(arrowAngle - Math.PI / 6), c2y - 10 * Math.sin(arrowAngle - Math.PI / 6));
        ctx.lineTo(c2x - 10 * Math.cos(arrowAngle + Math.PI / 6), c2y - 10 * Math.sin(arrowAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }

      // Draw Active Stage Circle
      const cx = mToPx(curr.x);
      const cy = mToPx(curr.y);
      const cr = mToPx(curr.r);

      // Circle Fill
      ctx.fillStyle = cfg.bg || 'rgba(37, 99, 235, 0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      // Circle Stroke
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();

      // Center Crosshair
      const chSize = 7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - chSize, cy);
      ctx.lineTo(cx + chSize, cy);
      ctx.moveTo(cx, cy - chSize);
      ctx.lineTo(cx, cy + chSize);
      ctx.stroke();

      // Badge Label
      const label = `Stage ${pNum} • ${curr.r}m`;
      ctx.font = '700 11px JetBrains Mono, monospace';
      const textW = ctx.measureText(label).width;

      const badgeX = cx + 8;
      const badgeY = cy - cr - 8;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(badgeX - 4, badgeY - 14, textW + 8, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, badgeX, badgeY);
    }
  }, [stage, phases, flightPath, imageObj, canvasWidth, canvasHeight]);

  const handleDownloadStage = (e) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Stage_${stage}_Prediction_Map.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const pData = stage !== 'all' ? phases[Number(stage)] : null;
  const cfg = stage !== 'all' ? PHASE_CONFIG[Number(stage)] : { name: 'Master Composite', color: '#2563eb' };

  return (
    <div className="stage-map-card tactical-card" onClick={onOpenFull}>
      <div className="stage-card-header">
        <div className="header-left">
          <span className="stage-dot" style={{ background: cfg.color }} />
          <span className="stage-title">
            {stage === 'all' ? 'All 5 Stages Combined' : `Stage ${stage}: ${cfg.name}`}
          </span>
        </div>

        <div className="header-right">
          {pData && (
            <span className="grid-tag mono">Grid: <b>{pData.grid}</b></span>
          )}
          <button
            className="card-download-btn"
            title={`Download Stage ${stage} Map`}
            onClick={handleDownloadStage}
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      <div className="canvas-holder">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="stage-canvas"
        />

        <div className="stage-canvas-badge mono">
          {stage === 'all' ? (
            <span>ALL 5 STAGES OVERVIEW</span>
          ) : (
            <span>
              RADIUS: {pData?.r}m {pData?.shiftDist > 0 && `• SHIFT: ${Math.round(pData.shiftDist)}m (${pData.compass})`}
            </span>
          )}
        </div>
      </div>

      {pData && (
        <div className="stage-card-footer mono">
          <div className="footer-metric">
            <span className="m-label">RADIUS:</span>
            <span className="m-val">{pData.r}m</span>
          </div>
          <div className="footer-metric">
            <span className="m-label">SHIFT:</span>
            <span className="m-val">
              {pData.shiftDist > 0 ? `${Math.round(pData.shiftDist)}m (${pData.compass})` : 'Base Circle'}
            </span>
          </div>
          <div className="footer-metric">
            <span className="m-label">GRID:</span>
            <span className="m-val">{pData.grid}</span>
          </div>
        </div>
      )}

      <style>{`
        .stage-map-card {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          cursor: pointer;
        }

        .stage-map-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .stage-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stage-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .stage-title {
          font-weight: 700;
          font-size: 12px;
          color: var(--text-primary);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .grid-tag {
          font-size: 10px;
          padding: 2px 6px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
        }

        .card-download-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
        }

        .card-download-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .canvas-holder {
          position: relative;
          background: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stage-canvas {
          width: 100%;
          height: auto;
          display: block;
        }

        .stage-canvas-badge {
          position: absolute;
          bottom: 8px;
          left: 8px;
          background: rgba(15, 23, 42, 0.88);
          color: #ffffff;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .stage-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          font-size: 10px;
          gap: 6px;
          flex-wrap: wrap;
        }

        .footer-metric {
          display: flex;
          gap: 4px;
        }

        .m-label {
          color: var(--text-muted);
        }

        .m-val {
          font-weight: 700;
          color: var(--text-primary);
        }

        .m-status {
          color: var(--color-success);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
