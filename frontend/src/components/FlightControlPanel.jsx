import React from 'react';
import { 
  Plane, 
  CircleDot, 
  Sliders, 
  Layers, 
  Sparkles, 
  ShieldAlert, 
  Compass,
  ArrowRight
} from 'lucide-react';
import { toCompassBearing } from '../utils/engine';

export default function FlightControlPanel({
  flightStart,
  flightEnd,
  phase1Center,
  phase1Radius,
  showHeatmap,
  setShowHeatmap,
  showGrid,
  setShowGrid,
  showFlightCorridor,
  setShowFlightCorridor,
  showShiftVectors,
  setShowShiftVectors,
  enforceTerrain,
  setEnforceTerrain,
  onFlightChange,
  onPhase1Change
}) {
  const flightDx = flightEnd.x - flightStart.x;
  const flightDy = flightEnd.y - flightStart.y;
  const flightAngle = ((Math.atan2(flightDy, flightDx) * 180) / Math.PI + 360) % 360;
  const flightDistKm = (Math.hypot(flightDx, flightDy) / 1000).toFixed(1);

  return (
    <div className="control-panel tactical-card">
      <div className="panel-header">
        <div className="panel-title">
          <Sliders size={15} className="panel-title-icon" />
          <span>Zone & Flight Settings</span>
        </div>
      </div>

      <div className="panel-body">
        {/* SECTION 1: Flight Path */}
        <div className="parameter-section">
          <div className="section-title-row">
            <span className="section-title">
              <Plane size={14} />
              <span>Flight Path</span>
            </span>
            <span className="section-badge mono">
              {Math.round(flightAngle)}° ({toCompassBearing(flightAngle)}) • {flightDistKm} km
            </span>
          </div>

          <div className="input-grid">
            <div className="input-field">
              <label>Origin X (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="100"
                value={flightStart.x}
                onChange={(e) => onFlightChange({
                  start: { ...flightStart, x: Number(e.target.value) },
                  end: flightEnd
                })}
              />
            </div>
            <div className="input-field">
              <label>Origin Y (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="100"
                value={flightStart.y}
                onChange={(e) => onFlightChange({
                  start: { ...flightStart, y: Number(e.target.value) },
                  end: flightEnd
                })}
              />
            </div>
            <div className="input-field">
              <label>Drop End X (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="100"
                value={flightEnd.x}
                onChange={(e) => onFlightChange({
                  start: flightStart,
                  end: { ...flightEnd, x: Number(e.target.value) }
                })}
              />
            </div>
            <div className="input-field">
              <label>Drop End Y (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="100"
                value={flightEnd.y}
                onChange={(e) => onFlightChange({
                  start: flightStart,
                  end: { ...flightEnd, y: Number(e.target.value) }
                })}
              />
            </div>
          </div>

          {/* Quick Route Shortcuts */}
          <div className="quick-buttons-row">
            <button
              className="quick-route-btn"
              onClick={() => onFlightChange({
                start: { x: 4000, y: 800 },
                end: { x: 4000, y: 7200 }
              })}
            >
              N ➔ S Central
            </button>
            <button
              className="quick-route-btn"
              onClick={() => onFlightChange({
                start: { x: 800, y: 4000 },
                end: { x: 7200, y: 4000 }
              })}
            >
              W ➔ E Horizon
            </button>
            <button
              className="quick-route-btn"
              onClick={() => onFlightChange({
                start: { x: 1200, y: 1500 },
                end: { x: 6800, y: 6800 }
              })}
            >
              MilBase Diagonal
            </button>
          </div>
        </div>

        {/* SECTION 2: Stage 1 Circle */}
        <div className="parameter-section">
          <div className="section-title-row">
            <span className="section-title">
              <CircleDot size={14} />
              <span>Stage 1 Safe Zone</span>
            </span>
            <span className="section-badge mono">
              Radius: {phase1Radius}m
            </span>
          </div>

          <div className="input-grid">
            <div className="input-field">
              <label>Center X (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="50"
                value={phase1Center.x}
                onChange={(e) => onPhase1Change(Number(e.target.value), phase1Center.y, phase1Radius)}
              />
            </div>
            <div className="input-field">
              <label>Center Y (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="50"
                value={phase1Center.y}
                onChange={(e) => onPhase1Change(phase1Center.x, Number(e.target.value), phase1Radius)}
              />
            </div>
          </div>

          <div className="slider-row">
            <div className="slider-header">
              <span>Phase 1 Radius</span>
              <span className="mono">{phase1Radius}m (Diameter: {(phase1Radius * 2) / 1000}km)</span>
            </div>
            <input
              type="range"
              min="1500"
              max="2400"
              step="50"
              value={phase1Radius}
              onChange={(e) => onPhase1Change(phase1Center.x, phase1Center.y, Number(e.target.value))}
            />
          </div>
        </div>

        {/* SECTION 3: Map Layers */}
        <div className="parameter-section">
          <div className="section-title-row">
            <span className="section-title">
              <Layers size={14} />
              <span>Map Layers</span>
            </span>
          </div>

          <div className="toggles-grid">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
              <span className="toggle-label">
                <b>Shift Heatmap</b>
                <small>Highlight likely shift areas</small>
              </span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <span className="toggle-label">
                <b>Map Grid (A1-H8)</b>
                <small>1km coordinate grid</small>
              </span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={showShiftVectors}
                onChange={(e) => setShowShiftVectors(e.target.checked)}
              />
              <span className="toggle-label">
                <b>Shift Arrows</b>
                <small>Direction from Stage 1 to 5</small>
              </span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={showFlightCorridor}
                onChange={(e) => setShowFlightCorridor(e.target.checked)}
              />
              <span className="toggle-label">
                <b>Flight Drop Reach</b>
                <small>Glide reach boundary</small>
              </span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={enforceTerrain}
                onChange={(e) => setEnforceTerrain(e.target.checked)}
              />
              <span className="toggle-label">
                <b>Land Adjustment</b>
                <small>Avoid placing circles in deep water</small>
              </span>
            </label>
          </div>
        </div>
      </div>

      <style>{`
        .control-panel {
          display: flex;
          flex-direction: column;
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-surface-subtle);
        }

        .panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 13px;
          color: var(--text-primary);
        }

        .panel-title-icon {
          color: #2563eb;
        }

        .panel-body {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .parameter-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .parameter-section:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .section-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .section-badge {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .input-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .input-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .input-field label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .input-field input {
          width: 100%;
        }

        .quick-buttons-row {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }

        .quick-route-btn {
          flex: 1;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 600;
          background: var(--bg-surface-subtle);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .quick-route-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--border-medium);
        }

        .slider-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 4px;
        }

        .slider-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .toggles-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .toggle-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          user-select: none;
          padding: 4px 6px;
          border-radius: var(--radius-sm);
          transition: background 0.15s ease;
        }

        .toggle-item:hover {
          background: var(--bg-hover);
        }

        .toggle-item input[type="checkbox"] {
          margin-top: 3px;
          accent-color: #2563eb;
          cursor: pointer;
        }

        .toggle-label {
          display: flex;
          flex-direction: column;
          font-size: 12px;
          color: var(--text-primary);
        }

        .toggle-label small {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: normal;
        }
      `}</style>
    </div>
  );
}
