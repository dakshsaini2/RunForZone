import React from 'react';
import { 
  Plane, 
  CircleDot, 
  Sliders, 
  Layers 
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
          <Sliders size={14} className="panel-title-icon" />
          <span>Match Parameters</span>
        </div>
      </div>

      <div className="panel-body">
        {/* Section 1: Flight Trajectory */}
        <div className="control-section">
          <div className="section-header">
            <span className="section-title">
              <Plane size={13} />
              <span>Plane Flight Path</span>
            </span>
            <span className="meta-badge mono">
              {Math.round(flightAngle)}° ({toCompassBearing(flightAngle)}) • {flightDistKm} km
            </span>
          </div>

          <div className="coords-grid">
            <div className="coord-field">
              <label>Start X (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="50"
                value={flightStart.x}
                onChange={(e) => onFlightChange({ start: { ...flightStart, x: Number(e.target.value) }, end: flightEnd })}
              />
            </div>
            <div className="coord-field">
              <label>Start Y (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="50"
                value={flightStart.y}
                onChange={(e) => onFlightChange({ start: { ...flightStart, y: Number(e.target.value) }, end: flightEnd })}
              />
            </div>
            <div className="coord-field">
              <label>End X (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="50"
                value={flightEnd.x}
                onChange={(e) => onFlightChange({ start: flightStart, end: { ...flightEnd, x: Number(e.target.value) } })}
              />
            </div>
            <div className="coord-field">
              <label>End Y (m)</label>
              <input
                type="number"
                min="0"
                max="8000"
                step="50"
                value={flightEnd.y}
                onChange={(e) => onFlightChange({ start: flightStart, end: { ...flightEnd, y: Number(e.target.value) } })}
              />
            </div>
          </div>

          <div className="quick-routes-row">
            <button
              className="route-btn"
              onClick={() => onFlightChange({ start: { x: 4000, y: 800 }, end: { x: 4000, y: 7200 } })}
            >
              N ➔ S Central
            </button>
            <button
              className="route-btn"
              onClick={() => onFlightChange({ start: { x: 800, y: 4000 }, end: { x: 7200, y: 4000 } })}
            >
              W ➔ E Horizon
            </button>
            <button
              className="route-btn"
              onClick={() => onFlightChange({ start: { x: 1500, y: 1800 }, end: { x: 6600, y: 6200 } })}
            >
              Diagonal
            </button>
          </div>
        </div>

        {/* Section 2: Stage 1 Safe Zone */}
        <div className="control-section">
          <div className="section-header">
            <span className="section-title">
              <CircleDot size={13} />
              <span>Stage 1 Safe Zone</span>
            </span>
            <span className="meta-badge mono">{phase1Radius}m radius</span>
          </div>

          <div className="coords-grid">
            <div className="coord-field">
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
            <div className="coord-field">
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

          <div className="slider-box">
            <div className="slider-meta">
              <span>Radius Scale</span>
              <span className="mono">{(phase1Radius * 2 / 1000).toFixed(1)} km diameter</span>
            </div>
            <input
              type="range"
              min="1600"
              max="2400"
              step="50"
              value={phase1Radius}
              onChange={(e) => onPhase1Change(phase1Center.x, phase1Center.y, Number(e.target.value))}
            />
          </div>
        </div>

        {/* Section 3: Map Overlays */}
        <div className="control-section">
          <div className="section-header">
            <span className="section-title">
              <Layers size={13} />
              <span>Display Layers</span>
            </span>
          </div>

          <div className="toggles-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
              <span>Shift Heatmap</span>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showShiftVectors}
                onChange={(e) => setShowShiftVectors(e.target.checked)}
              />
              <span>Shift Arrows</span>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <span>Erangel Grid (A1-H8)</span>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={enforceTerrain}
                onChange={(e) => setEnforceTerrain(e.target.checked)}
              />
              <span>Terrain Land Lock</span>
            </label>
          </div>
        </div>
      </div>

      <style>{`
        .control-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px;
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .panel-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13.5px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .panel-title-icon {
          color: var(--color-flight);
        }

        .panel-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .control-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .meta-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .coords-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .coord-field {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .coord-field label {
          font-size: 10.5px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .coord-field input {
          padding: 6px 9px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-medium);
          background: var(--bg-input);
          color: var(--text-primary);
          font-size: 12px;
          font-family: var(--font-mono);
        }

        .coord-field input:focus {
          border-color: var(--border-focus);
          outline: none;
        }

        .quick-routes-row {
          display: flex;
          gap: 6px;
        }

        .route-btn {
          flex: 1;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 600;
          border-radius: var(--radius-sm);
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          transition: all 0.15s ease;
        }

        .route-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .slider-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .slider-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-muted);
        }

        .slider-box input[type="range"] {
          accent-color: #2563eb;
          cursor: pointer;
        }

        .toggles-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11.5px;
          color: var(--text-primary);
          cursor: pointer;
          user-select: none;
        }

        .toggle-row input {
          accent-color: #2563eb;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
