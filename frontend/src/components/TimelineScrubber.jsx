import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Clock, 
  CheckCircle,
  Eye
} from 'lucide-react';
import { PHASE_CONFIG } from '../utils/engine';

export default function TimelineScrubber({
  activePhase,
  setActivePhase
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setActivePhase((prev) => {
          if (prev === null || prev >= 5) return 1;
          return prev + 1;
        });
      }, 1600);
    }
    return () => clearInterval(interval);
  }, [isPlaying, setActivePhase]);

  const handleStepBack = () => {
    setIsPlaying(false);
    setActivePhase((prev) => (prev === null || prev <= 1 ? 5 : prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setActivePhase((prev) => (prev === null || prev >= 5 ? 1 : prev + 1));
  };

  const togglePlay = () => {
    if (!isPlaying && activePhase === null) {
      setActivePhase(1);
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="scrubber-card tactical-card">
      <div className="scrubber-left">
        <div className="timeline-title">
          <Clock size={15} className="timeline-icon" />
          <span>Match Phase Progression</span>
        </div>

        <div className="playback-controls">
          <button
            className="ctrl-btn"
            title="Previous Phase"
            onClick={handleStepBack}
          >
            <SkipBack size={14} />
          </button>

          <button
            className={`ctrl-btn play-btn ${isPlaying ? 'playing' : ''}`}
            title={isPlaying ? 'Pause Simulation' : 'Play Sequential Shift Simulation'}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            className="ctrl-btn"
            title="Next Phase"
            onClick={handleStepForward}
          >
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      <div className="scrubber-middle">
        <div className="phase-steps-row">
          {[1, 2, 3, 4, 5].map((pNum) => {
            const cfg = PHASE_CONFIG[pNum];
            const isActive = activePhase === pNum;
            const isPassed = activePhase !== null && pNum <= activePhase;

            return (
              <button
                key={pNum}
                className={`step-btn ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''}`}
                style={{ '--step-color': cfg.color }}
                onClick={() => {
                  setIsPlaying(false);
                  setActivePhase(isActive ? null : pNum);
                }}
              >
                <span className="step-num mono">P{pNum}</span>
                <span className="step-name">{cfg.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scrubber-right">
        <button
          className={`all-phases-btn ${activePhase === null ? 'active' : ''}`}
          onClick={() => {
            setIsPlaying(false);
            setActivePhase(null);
          }}
          title="Show all 5 phases simultaneously"
        >
          <Eye size={14} />
          <span>Show All 5 Phases</span>
        </button>
      </div>

      <style>{`
        .scrubber-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 18px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .scrubber-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .timeline-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          font-size: 12px;
          color: var(--text-primary);
        }

        .timeline-icon {
          color: #2563eb;
        }

        .playback-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ctrl-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 9px;
          background: var(--bg-surface-subtle);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 700;
        }

        .ctrl-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .play-btn.playing {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        .scrubber-middle {
          flex: 1;
          display: flex;
          justify-content: center;
          max-width: 600px;
        }

        .phase-steps-row {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
        }

        .step-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 6px 4px;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
        }

        .step-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-medium);
        }

        .step-btn.active {
          border-color: var(--step-color);
          box-shadow: 0 0 0 1px var(--step-color);
          background: var(--bg-surface);
        }

        .step-num {
          font-size: 11px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .step-name {
          font-size: 9px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .scrubber-right {
          display: flex;
          align-items: center;
        }

        .all-phases-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          background: var(--bg-surface-subtle);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .all-phases-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .all-phases-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }
      `}</style>
    </div>
  );
}
