import React from 'react';
import { 
  Crosshair, 
  Sun, 
  Moon, 
  Upload, 
  Map 
} from 'lucide-react';

export default function Header({
  theme,
  setTheme,
  activeTab,
  setActiveTab
}) {
  return (
    <header className="tactical-header">
      <div className="header-left">
        <div className="brand-lockup" onClick={() => setActiveTab('simulator')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon-wrapper">
            <Crosshair className="brand-icon" size={17} />
          </div>
          <div className="brand-text">
            <span className="brand-title">RUNFORZONE</span>
            <span className="brand-subtitle">Safe Zone Predictor</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            <Map size={13} />
            <span>Interactive Map</span>
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'image_input' ? 'active' : ''}`}
            onClick={() => setActiveTab('image_input')}
          >
            <Upload size={13} />
            <span>Upload Screenshot</span>
          </button>
        </div>
      </div>

      <div className="header-right">
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
        }

        .brand-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: #2563eb;
          color: #ffffff;
          border-radius: var(--radius-sm);
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.05em;
          color: var(--text-primary);
        }

        .brand-subtitle {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
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
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          background: transparent;
          transition: all 0.15s ease;
        }

        .nav-tab-btn:hover {
          color: var(--text-primary);
        }

        .nav-tab-btn.active {
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .theme-toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: var(--radius-sm);
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          transition: all 0.15s ease;
        }

        .theme-toggle-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
      `}</style>
    </header>
  );
}
