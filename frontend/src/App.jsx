import React, { useState, useMemo, useRef, useEffect } from 'react';
import Header from './components/Header';
import TacticalCanvas from './components/TacticalCanvas';
import FlightControlPanel from './components/FlightControlPanel';
import TelemetryMatrix from './components/TelemetryMatrix';
import TacticalBriefing from './components/TacticalBriefing';
import TimelineScrubber from './components/TimelineScrubber';
import ImageMapPredictor from './components/ImageMapPredictor';
import LandingPage from './components/LandingPage';
import { 
  predictSequentialPhases, 
  PRESET_SCENARIOS, 
  DEFAULT_PHASE_RADII_METERS 
} from './utils/engine';
import './App.css';

export default function App() {
  // Theme state: default is studio-light (NOT generic AI dark mode!)
  const [theme, setTheme] = useState('studio-light');

  // Navigation tab: 'overview' (Landing Page) | 'image_input' (Input map image) | 'simulator' (Interactive tactical board)
  const [activeTab, setActiveTab] = useState('overview');

  // Preset state
  const [selectedPreset, setSelectedPreset] = useState('pochinki');

  // Flight Path Vector (Meters: 0 to 8000)
  const [flightStart, setFlightStart] = useState({ x: 1500, y: 1800 });
  const [flightEnd, setFlightEnd] = useState({ x: 6600, y: 6200 });

  // Phase 1 Safe Zone (Meters: 0 to 8000)
  const [phase1Center, setPhase1Center] = useState({ x: 4100, y: 3900 });
  const [phase1Radius, setPhase1Radius] = useState(DEFAULT_PHASE_RADII_METERS[1]);

  // Visual Layer Toggles
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showFlightCorridor, setShowFlightCorridor] = useState(true);
  const [showShiftVectors, setShowShiftVectors] = useState(true);
  const [enforceTerrain, setEnforceTerrain] = useState(true);

  // Active Phase Focus (null = show all)
  const [activePhase, setActivePhase] = useState(null);

  const canvasRef = useRef(null);

  // Apply data-theme to HTML root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle Preset Selection
  const handleSelectPreset = (presetId) => {
    setSelectedPreset(presetId);
    if (presetId === 'custom') return;

    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (preset) {
      setFlightStart({ x: preset.flight.x1, y: preset.flight.y1 });
      setFlightEnd({ x: preset.flight.x2, y: preset.flight.y2 });
      setPhase1Center({ x: preset.phase1.x, y: preset.phase1.y });
      setPhase1Radius(preset.phase1.r);
      setActivePhase(null);
    }
  };

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

  const { phases, flightPath, latencyMs } = predictionResult;

  // Handlers for interactive map manipulations
  const handleUpdatePhase1Center = (newX, newY) => {
    setSelectedPreset('custom');
    setPhase1Center({ x: newX, y: newY });
  };

  const handleUpdateFlightPath = ({ start, end }) => {
    setSelectedPreset('custom');
    setFlightStart(start);
    setFlightEnd(end);
  };

  const handlePhase1Change = (newX, newY, newR) => {
    setSelectedPreset('custom');
    setPhase1Center({ x: newX, y: newY });
    setPhase1Radius(newR);
  };

  const handleFlightChange = ({ start, end }) => {
    setSelectedPreset('custom');
    setFlightStart(start);
    setFlightEnd(end);
  };

  const handleResetView = () => {
    // Reset view triggered in TacticalCanvas
  };

  // Export tactical snapshot as PNG
  const handleExportImage = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `RunForZone_TacticalBrief_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="app-container">
      {/* Top Studio Broadcast Header */}
      <Header
        theme={theme}
        setTheme={setTheme}
        selectedPreset={selectedPreset}
        onSelectPreset={handleSelectPreset}
        latencyMs={latencyMs}
        onResetView={handleResetView}
        onExportImage={handleExportImage}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workspace Layout */}
      <main className="main-content">
        {activeTab === 'overview' ? (
          /* Premium Landing Page */
          <LandingPage
            onLaunchStudio={() => setActiveTab('simulator')}
            onLaunchImagePredictor={() => setActiveTab('image_input')}
          />
        ) : activeTab === 'image_input' ? (
          /* User Input Map Image Mode */
          <ImageMapPredictor />
        ) : (
          /* Interactive Simulator Board Mode */
          <>
            <div className="tactical-workspace-grid">
              {/* LEFT: Tactical Map Canvas & Scrubber */}
              <section className="map-column">
                <TacticalCanvas
                  phases={phases}
                  flightPath={flightPath}
                  activePhase={activePhase}
                  showHeatmap={showHeatmap}
                  showGrid={showGrid}
                  showFlightCorridor={showFlightCorridor}
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

              {/* RIGHT: Flight & Mission Parameters Deck */}
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
                  showFlightCorridor={showFlightCorridor}
                  setShowFlightCorridor={setShowFlightCorridor}
                  showShiftVectors={showShiftVectors}
                  setShowShiftVectors={setShowShiftVectors}
                  enforceTerrain={enforceTerrain}
                  setEnforceTerrain={setEnforceTerrain}
                  onFlightChange={handleFlightChange}
                  onPhase1Change={handlePhase1Change}
                />
              </aside>
            </div>

            {/* BOTTOM SECTION: Telemetry Matrix & Coach Briefing */}
            <section className="analytics-section">
              <TelemetryMatrix
                phases={phases}
                activePhase={activePhase}
                setActivePhase={setActivePhase}
              />

              <TacticalBriefing
                phases={phases}
                flightPath={flightPath}
              />
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="tactical-footer">
        <div className="footer-left">
          <span>RUNFORZONE • Safe Zone Predictor</span>
        </div>
        <div className="footer-right">
          <span>Stages 1 to 5</span>
        </div>
      </footer>
    </div>
  );
}
