import React from 'react';
import { 
  Crosshair, 
  Sun, 
  Moon, 
  Compass,
  Upload,
  Layers,
  Map
} from 'lucide-react';
import { PRESET_SCENARIOS } from '../utils/engine';

export default function Header({
  theme,
  setTheme,
  selectedPreset,
  onSelectPreset,
  activeTab,
  setActiveTab
}) {
  return (
    <header className="tactical-header">
      <div className="header-left">
        <div className="brand-lockup" onClick={() => setActiveTab('overview')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon-wrapper">
            <Crosshair className="brand-icon" size={18} />
          </div>
          <div className="brand-text">
            <span className="brand-title">RUNFORZONE</span>
            <span className="brand-subtitle">Zone Predictor</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <span>Overview</span>
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'image_input' ? 'active' : ''}`}
            onClick={() => setActiveTab('image_input')}
          >
            <Upload size={13} />
            <span>Upload Map</span>
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            <Map size={13} />
            <span>Simulator</span>
          </button>
        </div>
      </div>

      <div className="header-right">
        {/* Preset Selector (shown when in simulator) */}
        {activeTab === 'simulator' && (
          <div className="preset-selector-group">
            <label className="preset-label" htmlFor="preset-select">
              <Compass size={13} />
              <span>Preset:</span>
            </label>
            <select
              id="preset-select"
              className="preset-select"
              value={selectedPreset}
              onChange={(e) => onSelectPreset(e.target.value)}
            >
              <option value="custom">Custom</option>
              {PRESET_SCENARIOS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          className="theme-toggle-btn"
          title={theme === 'studio-light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          onClick={() => setTheme(theme === 'studio-light' ? 'tactical-slate' : 'studio-light')}
        >
          {theme === 'studio-light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>

      <style>{`
        .tactical-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          z-index: 50;
          gap: 16px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
          gap: 10px;
          user-select: none;
        }

        .brand-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          background: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.04em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .brand-subtitle {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.2;
        }

        .nav-tabs {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-surface-subtle);
          padding: 3px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .nav-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          background: transparent;
          border-radius: 4px;
          transition: all 0.15s ease;
        }

        .nav-tab-btn:hover {
          color: var(--text-primary);
        }

        .nav-tab-btn.active {
          background: var(--bg-surface);
          color: #2563eb;
          box-shadow: var(--shadow-sm);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .preset-selector-group {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-surface-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .preset-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .preset-select {
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          outline: none;
          padding: 2px;
        }

        .theme-toggle-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
        }

        .theme-toggle-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        @media (max-width: 768px) {
          .tactical-header {
            flex-direction: column;
            align-items: stretch;
            padding: 10px 14px;
          }
          .header-left {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          .nav-tabs {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </header>
  );
}
