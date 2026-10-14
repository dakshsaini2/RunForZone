import React, { useState, useMemo, useRef, useEffect } from 'react';
import Header from './components/Header';
import TacticalCanvas from './components/TacticalCanvas';
import FlightControlPanel from './components/FlightControlPanel';
import TelemetryMatrix from './components/TelemetryMatrix';
import TacticalBriefing from './components/TacticalBriefing';
import TimelineScrubber from './components/TimelineScrubber';
import ImageMapPredictor from './components/ImageMapPredictor';
import { 
  predictSequentialPhases, 
  DEFAULT_PHASE_RADII_METERS 
} from './utils/engine';
import './App.css';

export default function App() {
  const [theme, setTheme] = useState('studio-light');

  // Navigation tab: 'simulator' (Interactive tactical map) | 'image_input' (Upload screenshot)
  const [activeTab, setActiveTab] = useState('simulator');

  // Flight Path Vector (Meters: 0 to 8000)
  const [flightStart, setFlightStart] = useState({ x: 1500, y: 1800 });
  const [flightEnd, setFlightEnd] = useState({ x: 6600, y: 6200 });

  // Phase 1 Safe Zone (Meters: 0 to 8000)
  const [phase1Center, setPhase1Center] = useState({ x: 4100, y: 3900 });
  const [phase1Radius, setPhase1Radius] = useState(DEFAULT_PHASE_RADII_METERS[1]);

  // Visual Layer Toggles
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showShiftVectors, setShowShiftVectors] = useState(true);
  const [enforceTerrain, setEnforceTerrain] = useState(true);

  // Active Phase Focus (null = show all)
  const [activePhase, setActivePhase] = useState(null);

  const canvasRef = useRef(null);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Run Sequential Prediction Engine
  const predictionResult = useMemo(() => {
    return predictSequentialPhases({
      flightStart,
      flightEnd,
      phase1Center,
      phase1Radius,
      enforceTerrain
    });
  }, [flightStart, flightEnd, phase1Center, phase1Radius, enforceTerrain]);

  const { phases, flightPath } = predictionResult;

  // Handlers for interactive canvas editing
  const handleUpdatePhase1Center = (newX, newY) => {
    setPhase1Center({ x: newX, y: newY });
  };

  const handleUpdateFlightPath = ({ start, end }) => {
    setFlightStart(start);
    setFlightEnd(end);
  };

  const handlePhase1Change = (newX, newY, newR) => {
    setPhase1Center({ x: newX, y: newY });
    setPhase1Radius(newR);
  };

  const handleFlightChange = ({ start, end }) => {
    setFlightStart(start);
    setFlightEnd(end);
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        theme={theme}
        setTheme={setTheme}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workspace Layout */}
      <main className="main-content">
        {activeTab === 'image_input' ? (
          /* Match Map Screenshot Mode */
          <ImageMapPredictor />
        ) : (
          /* Interactive Tactical Map Mode */
          <>
            <div className="tactical-workspace-grid">
              {/* LEFT: Map Canvas & Timeline Scrubber */}
              <section className="map-column">
                <TacticalCanvas
                  phases={phases}
                  flightPath={flightPath}
                  activePhase={activePhase}
                  showHeatmap={showHeatmap}
                  showGrid={showGrid}
                  showFlightCorridor={true}
                  showShiftVectors={showShiftVectors}
                  onUpdatePhase1Center={handleUpdatePhase1Center}
                  onUpdateFlightPath={handleUpdateFlightPath}
                  canvasRef={canvasRef}
                />

                <TimelineScrubber
                  activePhase={activePhase}
                  setActivePhase={setActivePhase}
                />
              </section>

              {/* RIGHT: Flight & Circle Controls */}
              <aside className="controls-column">
                <FlightControlPanel
                  flightStart={flightStart}
                  flightEnd={flightEnd}
                  phase1Center={phase1Center}
                  phase1Radius={phase1Radius}
                  showHeatmap={showHeatmap}
                  setShowHeatmap={setShowHeatmap}
                  showGrid={showGrid}
                  setShowGrid={setShowGrid}
                  showShiftVectors={showShiftVectors}
                  setShowShiftVectors={setShowShiftVectors}
                  enforceTerrain={enforceTerrain}
                  setEnforceTerrain={setEnforceTerrain}
                  onFlightChange={handleFlightChange}
                  onPhase1Change={handlePhase1Change}
                />
              </aside>
            </div>

            {/* Rotation Advisory & Stage Breakdown */}
            <section className="analytics-section">
              <TacticalBriefing
                phases={phases}
                flightPath={flightPath}
              />

              <TelemetryMatrix
                phases={phases}
                activePhase={activePhase}
                setActivePhase={setActivePhase}
              />
            </section>
          </>
        )}
      </main>

      {/* Clean Utility Footer */}
      <footer className="tactical-footer">
        <div className="footer-left">
          <span>RUNFORZONE • Safe Zone Predictor</span>
        </div>
        <div className="footer-right">
          <span>Competitive Erangel (8x8 km)</span>
        </div>
      </footer>
    </div>
  );
}
