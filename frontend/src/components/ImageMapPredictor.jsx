import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Sliders, 
  Layers, 
  Download, 
  CheckCircle2, 
  Maximize2, 
  Eye, 
  Split, 
  Plane,
  Crosshair,
  FileImage,
  MapPin,
  Car,
  Clock,
  Compass,
  ZoomIn,
  ZoomOut,
  Target,
  Map
} from 'lucide-react';
import { 
  predictSequentialPhases, 
  generateTacticalBriefing,
  PHASE_CONFIG, 
  getErangelLandmark,
  MAP_EXTENT_METERS 
} from '../utils/engine';
import StageMapCanvas from './StageMapCanvas';
import './ImageMapPredictor.css';

export default function ImageMapPredictor() {
  const [uploadedImageSrc, setUploadedImageSrc] = useState('/samples/match_sample_1.png');
  const [imageName, setImageName] = useState('match_sample_1.png');

  // Map Background: '8k' (Ultra High-Res 8192x8192) | 'screenshot' (Uploaded Image)
  const [mapBackground, setMapBackground] = useState('8k');

  // Pan & Zoom viewport state
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Calibration state (in meters: 0 to 8000)
  const [flightStart, setFlightStart] = useState({ x: 1500, y: 1800 });
  const [flightEnd, setFlightEnd] = useState({ x: 6600, y: 6200 });
  const [phase1Center, setPhase1Center] = useState({ x: 4100, y: 3900 });
  const [phase1Radius, setPhase1Radius] = useState(2000);

  // View & Layer options
  const [viewMode, setViewMode] = useState('overlay'); // 'overlay' | 'stages' | 'split'
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [selectedStage, setSelectedStage] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showShiftArrows, setShowShiftArrows] = useState(true);
  const [showFlightLine, setShowFlightLine] = useState(true);
  const [calibrationMode, setCalibrationMode] = useState(null); // null | 'setCircle' | 'setFlightStart' | 'setFlightEnd'

  const canvasRef = useRef(null);
  const imageObjRef = useRef(null);
  const erangel8kRef = useRef(null);
  const erangelPreviewRef = useRef(null);
  const fileInputRef = useRef(null);

  // Compute multi-stage predictions
  const prediction = predictSequentialPhases({
    flightStart,
    flightEnd,
    phase1Center,
    phase1Radius,
    enforceTerrain: true
  });
  const { phases, flightPath } = prediction;
  const briefing = generateTacticalBriefing(phases, flightPath);

  // Preload Erangel 8K map and fast preview
  useEffect(() => {
    const preview = new Image();
    preview.src = '/erangel_map.png';
    preview.onload = () => {
      erangelPreviewRef.current = preview;
      renderCanvas();
    };

    const full8k = new Image();
    full8k.src = '/erangel_map_8k.png';
    full8k.onload = () => {
      erangel8kRef.current = full8k;
      renderCanvas();
    };
  }, []);

  // Load uploaded image object whenever source changes
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = uploadedImageSrc;
    img.onload = () => {
      imageObjRef.current = img;
      renderCanvas();
    };
  }, [uploadedImageSrc]);

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImageSrc(event.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const handleLoadSample = (sampleSrc, name) => {
    setImageName(name);
    setUploadedImageSrc(sampleSrc);
  };

  const focusStage = (stageNum = 5) => {
    const target = phases[stageNum];
    const canvas = canvasRef.current;
    if (!target || !canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const targetScale = stageNum === 5 ? 6.5 : stageNum >= 3 ? 4.0 : 2.5;

    const px = (target.x / MAP_EXTENT_METERS) * width;
    const py = (target.y / MAP_EXTENT_METERS) * height;
    const midX = width / 2;
    const midY = height / 2;

    const newOffsetX = -(px - midX) * targetScale;
    const newOffsetY = -(py - midY) * targetScale;

    setTransform({ scale: targetScale, offsetX: newOffsetX, offsetY: newOffsetY });
  };

  const resetView = () => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  };

  const screenToMeters = (clickX, clickY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 4000, y: 4000 };

    const midX = canvas.width / 2;
    const midY = canvas.height / 2;
    const unscaledX = (clickX - transform.offsetX - midX) / transform.scale + midX;
    const unscaledY = (clickY - transform.offsetY - midY) / transform.scale + midY;

    const meterX = Math.round(Math.max(0, Math.min(MAP_EXTENT_METERS, (unscaledX / canvas.width) * MAP_EXTENT_METERS)));
    const meterY = Math.round(Math.max(0, Math.min(MAP_EXTENT_METERS, (unscaledY / canvas.height) * MAP_EXTENT_METERS)));
    return { x: meterX, y: meterY };
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    setTransform((prev) => {
      const newScale = Math.min(16.0, Math.max(0.75, prev.scale * zoomFactor));
      const scaleRatio = newScale / prev.scale;
      const newOffsetX = mouseX - (mouseX - prev.offsetX) * scaleRatio;
      const newOffsetY = mouseY - (mouseY - prev.offsetY) * scaleRatio;
      return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
    });
  };

  const handleMouseDown = (e) => {
    if (calibrationMode) {
      handleCalibrationClick(e);
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setTransform((prev) => ({
      ...prev,
      offsetX: e.clientX - dragStart.x,
      offsetY: e.clientY - dragStart.y
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCalibrationClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !calibrationMode) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { x: meterX, y: meterY } = screenToMeters(clickX, clickY);

    if (calibrationMode === 'setCircle') {
      setPhase1Center({ x: meterX, y: meterY });
      setCalibrationMode(null);
    } else if (calibrationMode === 'setFlightStart') {
      setFlightStart({ x: meterX, y: meterY });
      setCalibrationMode('setFlightEnd');
    } else if (calibrationMode === 'setFlightEnd') {
      setFlightEnd({ x: meterX, y: meterY });
      setCalibrationMode(null);
    }
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    const midX = width / 2;
    const midY = height / 2;
    ctx.translate(midX + transform.offsetX, midY + transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-midX, -midY);

    const activeBaseImg = (mapBackground === '8k')
      ? (erangel8kRef.current || erangelPreviewRef.current || imageObjRef.current)
      : imageObjRef.current;

    if (activeBaseImg) {
      ctx.drawImage(activeBaseImg, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    }

    const mToPx = (m) => (m / MAP_EXTENT_METERS) * width;
    const strokeScale = 1 / Math.sqrt(Math.max(1, transform.scale));

    ctx.save();
    ctx.globalAlpha = overlayOpacity;

    // Heatmap
    if (showHeatmap && phases[1]) {
      const p1 = phases[1];
      const p1PxX = mToPx(p1.x);
      const p1PxY = mToPx(p1.y);
      const p1PxR = mToPx(p1.r);

      const target = phases[2] || p1;
      const targetPxX = mToPx(target.x);
      const targetPxY = mToPx(target.y);

      const grad = ctx.createRadialGradient(
        targetPxX, targetPxY, 10,
        p1PxX, p1PxY, p1PxR * 0.95
      );
      grad.addColorStop(0, 'rgba(220, 38, 38, 0.45)');
      grad.addColorStop(0.35, 'rgba(217, 119, 6, 0.3)');
      grad.addColorStop(0.75, 'rgba(37, 99, 235, 0.15)');
      grad.addColorStop(1, 'rgba(37, 99, 235, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.arc(p1PxX, p1PxY, p1PxR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // Flight Path
    if (showFlightLine) {
      const f1x = mToPx(flightStart.x);
      const f1y = mToPx(flightStart.y);
      const f2x = mToPx(flightEnd.x);
      const f2y = mToPx(flightEnd.y);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(1.5, 3 * strokeScale);
      ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);
      ctx.beginPath();
      ctx.moveTo(f1x, f1y);
      ctx.lineTo(f2x, f2y);
      ctx.stroke();
      ctx.setLineDash([]);

      const angle = Math.atan2(f2y - f1y, f2x - f1x);
      const hLen = Math.max(8, 16 * strokeScale);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(f2x, f2y);
      ctx.lineTo(f2x - hLen * Math.cos(angle - Math.PI / 7), f2y - hLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(f2x - (hLen * 0.6) * Math.cos(angle), f2y - (hLen * 0.6) * Math.sin(angle));
      ctx.lineTo(f2x - hLen * Math.cos(angle + Math.PI / 7), f2y - hLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(1.2, 2.5 * strokeScale);
      ctx.beginPath();
      ctx.arc(f1x, f1y, Math.max(3.5, 7 * strokeScale), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Shift Direction Vectors
    const phaseList = Object.values(phases).sort((a, b) => a.phase - b.phase);

    if (showShiftArrows && phaseList.length > 1) {
      for (let i = 0; i < phaseList.length - 1; i++) {
        const curr = phaseList[i];
        const next = phaseList[i + 1];

        if (selectedStage !== null && selectedStage !== next.phase) continue;

        const c1x = mToPx(curr.x);
        const c1y = mToPx(curr.y);
        const c2x = mToPx(next.x);
        const c2y = mToPx(next.y);

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
        ctx.setLineDash([4 * strokeScale, 4 * strokeScale]);
        ctx.beginPath();
        ctx.moveTo(c1x, c1y);
        ctx.lineTo(c2x, c2y);
        ctx.stroke();
        ctx.setLineDash([]);

        const arrowAngle = Math.atan2(c2y - c1y, c2x - c1x);
        const arrowLen = Math.max(5, 9 * strokeScale);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(c2x, c2y);
        ctx.lineTo(c2x - arrowLen * Math.cos(arrowAngle - Math.PI / 6), c2y - arrowLen * Math.sin(arrowAngle - Math.PI / 6));
        ctx.lineTo(c2x - arrowLen * Math.cos(arrowAngle + Math.PI / 6), c2y - arrowLen * Math.sin(arrowAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Safe Zone Circles (Stages 1-5)
    phaseList.forEach((p) => {
      const isVisible = selectedStage === null || selectedStage === p.phase;
      if (!isVisible) return;

      const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb' };
      const cx = mToPx(p.x);
      const cy = mToPx(p.y);
      const cr = mToPx(p.r);

      ctx.fillStyle = cfg.bg || 'rgba(37, 99, 235, 0.1)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = Math.max(1.4, ((selectedStage === p.phase) ? 3.5 : 2.5) * strokeScale);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();

      const chSize = Math.max(3.5, 7 * strokeScale);
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
      ctx.beginPath();
      ctx.moveTo(cx - chSize, cy);
      ctx.lineTo(cx + chSize, cy);
      ctx.moveTo(cx, cy - chSize);
      ctx.lineTo(cx, cy + chSize);
      ctx.stroke();

      const label = `Stage ${p.phase} • ${p.r}m`;
      const fontSize = Math.max(8, Math.round(11 * strokeScale));
      ctx.font = `700 ${fontSize}px JetBrains Mono, monospace`;
      const textW = ctx.measureText(label).width;

      const badgeX = cx + 8 * strokeScale;
      const badgeY = cy - cr - 8 * strokeScale;
      const pad = 4 * strokeScale;
      const boxH = Math.max(12, 18 * strokeScale);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(badgeX - pad, badgeY - boxH + pad, textW + pad * 2, boxH, 3);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, badgeX, badgeY);
    });

    ctx.restore();
    ctx.restore();
  }, [
    mapBackground,
    transform,
    overlayOpacity,
    showHeatmap,
    showFlightLine,
    showShiftArrows,
    selectedStage,
    phases,
    flightStart,
    flightEnd
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleDownloadResult = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ZonePrediction_${imageName.replace(/\.[^/.]+$/, "")}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="image-predictor-container">
      {/* Top Upload Bar */}
      <div className="ingestion-deck tactical-card">
        <div className="ingestion-header">
          <FileImage size={17} className="deck-icon" />
          <div>
            <div className="deck-title">Match Map Screenshot Scanner</div>
            <div className="deck-subtitle">Upload map image to predict safe zone progression (Stages 1–5)</div>
          </div>
        </div>

        <div className="deck-right">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/png, image/jpeg, image/jpg, image/webp"
            style={{ display: 'none' }}
          />

          <button
            className="upload-btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={13} />
            <span>Upload Screenshot</span>
          </button>

          <div className="sample-btn-group">
            <button
              className="sample-btn"
              onClick={() => handleLoadSample('/samples/match_sample_1.png', 'match_sample_1.png')}
            >
              Sample Match
            </button>
            <button
              className="sample-btn"
              onClick={() => handleLoadSample('/samples/match_sample_2.png', 'erangel_official.png')}
            >
              Erangel Base
            </button>
          </div>
        </div>
      </div>

      {/* Rotation HUD Bar */}
      <div className="abstracted-hud-bar tactical-card">
        <div className="hud-metric">
          <span className="hud-label">
            <MapPin size={12} className="hud-icon" />
            <span>Projected Final Zone</span>
          </span>
          <span className="hud-val">{briefing.primaryAnchor}</span>
          <span className="hud-sub">Grid [{briefing.endgameGrid}] • {briefing.endgameTerrain}</span>
        </div>

        <div className="hud-metric">
          <span className="hud-label">
            <Clock size={12} className="hud-icon" />
            <span>Rotation Urgency</span>
          </span>
          <span className="hud-val" style={{ color: briefing.urgencyColor }}>{briefing.urgency}</span>
          <span className="hud-sub">Move Window: <b>{briefing.moveWindow}</b></span>
        </div>

        <div className="hud-metric">
          <span className="hud-label">
            <Car size={12} className="hud-icon" />
            <span>Vehicle Priority</span>
          </span>
          <span className="hud-val">
            {briefing.vehicleStatus === 'MANDATORY' ? '🚗 Secure Vehicles' : '🚶 Defilade Walk'}
          </span>
          <span className="hud-sub">{briefing.vehicleStatus === 'MANDATORY' ? 'Required for deep shift' : 'Safe on foot'}</span>
        </div>

        <div className="hud-metric">
          <span className="hud-label">
            <Compass size={12} className="hud-icon" />
            <span>Stage 2 Shift</span>
          </span>
          <span className="hud-val">{briefing.shiftType}</span>
          <span className="hud-sub">{briefing.shiftDescription}</span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="predictor-workspace-grid">
        {/* Left: Map */}
        <div className="image-canvas-card tactical-card">
          <div className="canvas-header-bar">
            <div className="image-meta mono">
              <span>MAP: <b>{imageName}</b></span>
            </div>

            <div className="view-mode-tabs">
              <button
                className={`tab-btn ${viewMode === 'overlay' ? 'active' : ''}`}
                onClick={() => setViewMode('overlay')}
              >
                <Eye size={13} />
                <span>Overlay</span>
              </button>
              <button
                className={`tab-btn ${viewMode === 'stages' ? 'active' : ''}`}
                onClick={() => setViewMode('stages')}
              >
                <Layers size={13} />
                <span>Stages</span>
              </button>
              <button
                className={`tab-btn ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => setViewMode('split')}
              >
                <Split size={13} />
                <span>Side-by-Side</span>
              </button>

              <button
                className="tab-btn download-btn"
                onClick={handleDownloadResult}
                title="Download image with predicted zones"
              >
                <Download size={13} />
                <span>Export PNG</span>
              </button>
            </div>
          </div>

          <div className="canvas-container">
            {viewMode === 'stages' ? (
              <div className="stages-multi-grid">
                <div className="multi-grid-intro">
                  <div className="intro-text">
                    <b>Stages 1 to 5 Progression</b>
                    <span>Individual maps showing each safe zone circle.</span>
                  </div>
                </div>

                <div className="stage-maps-masonry">
                  {[1, 2, 3, 4, 5, 'all'].map((stg) => (
                    <StageMapCanvas
                      key={stg}
                      stage={stg}
                      phases={phases}
                      flightPath={flightPath}
                      imageObj={imageObjRef.current}
                      canvasWidth={520}
                      canvasHeight={520}
                      showHeatmap={showHeatmap}
                      onOpenFull={() => {
                        if (stg !== 'all') {
                          setSelectedStage(stg);
                          focusStage(stg);
                        } else {
                          setSelectedStage(null);
                          resetView();
                        }
                        setMapBackground('8k');
                        setViewMode('overlay');
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : viewMode === 'split' ? (
              <div className="split-view-wrapper">
                <div className="split-panel">
                  <div className="panel-badge">RAW INPUT</div>
                  <img src={uploadedImageSrc} alt="Input Map" className="split-img" />
                </div>
                <div className="split-panel">
                  <div className="panel-badge">PREDICTED STAGES</div>
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={800}
                    className="split-canvas"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                  />
                </div>
              </div>
            ) : (
              <div className="single-canvas-wrapper">
                <div className="canvas-zoom-toolbar">
                  <div className="toolbar-left">
                    <div className="map-source-switch">
                      <button
                        className={`map-switch-btn ${mapBackground === '8k' ? 'active' : ''}`}
                        onClick={() => setMapBackground('8k')}
                        title="Show prediction on 8K map"
                      >
                        <Map size={13} />
                        <span>8K Map</span>
                      </button>
                      <button
                        className={`map-switch-btn ${mapBackground === 'screenshot' ? 'active' : ''}`}
                        onClick={() => setMapBackground('screenshot')}
                        title="Show prediction on screenshot"
                      >
                        <FileImage size={13} />
                        <span>Screenshot</span>
                      </button>
                    </div>
                  </div>

                  <div className="toolbar-center">
                    <button
                      className="focus-stage5-btn"
                      onClick={() => focusStage(5)}
                      title="Zoom into Stage 5 Final Circle"
                    >
                      <Target size={13} />
                      <span>Focus Final Zone</span>
                    </button>
                  </div>

                  <div className="toolbar-right">
                    <span className="zoom-level-badge mono">
                      {Math.round(transform.scale * 100)}%
                    </span>
                    <button
                      className="zoom-tool-btn"
                      onClick={() => setTransform((p) => ({ ...p, scale: Math.max(0.75, p.scale / 1.25) }))}
                      title="Zoom Out"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <button
                      className="zoom-tool-btn"
                      onClick={() => setTransform((p) => ({ ...p, scale: Math.min(16.0, p.scale * 1.25) }))}
                      title="Zoom In"
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      className="zoom-tool-btn"
                      onClick={resetView}
                      title="Reset View"
                    >
                      <Maximize2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="canvas-viewport-box">
                  <canvas
                    ref={canvasRef}
                    width={860}
                    height={860}
                    className={`main-image-canvas ${calibrationMode ? 'calibrating-cursor' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                  />

                  {calibrationMode && (
                    <div className="calibration-prompt-pill">
                      <Crosshair size={14} />
                      <span>
                        {calibrationMode === 'setCircle' && 'Click map to place Stage 1 Center'}
                        {calibrationMode === 'setFlightStart' && 'Click flight trajectory START point on map'}
                        {calibrationMode === 'setFlightEnd' && 'Now click flight trajectory END point on map'}
                      </span>
                      <button className="cancel-pill-btn" onClick={() => setCalibrationMode(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="stage-filter-bar">
            <span className="filter-title">Inspect Stage:</span>
            <button
              className={`stage-pill ${selectedStage === null ? 'active' : ''}`}
              onClick={() => setSelectedStage(null)}
            >
              All Stages
            </button>
            {[1, 2, 3, 4, 5].map((stg) => (
              <button
                key={stg}
                className={`stage-pill ${selectedStage === stg ? 'active' : ''}`}
                style={{ '--stg-color': PHASE_CONFIG[stg].color }}
                onClick={() => setSelectedStage(stg)}
              >
                Stage {stg}
              </button>
            ))}

            <div className="opacity-slider-group">
              <span className="mono">Opacity: {Math.round(overlayOpacity * 100)}%</span>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Right: Clean Calibration Controls */}
        <div className="calibration-deck tactical-card">
          <div className="deck-title-bar">
            <div className="deck-title-text">
              <Sliders size={14} className="deck-title-icon" />
              <span>Map Calibration</span>
            </div>
          </div>

          <div className="deck-body">
            {/* Interactive Pinpoint Tools */}
            <div className="calibration-tools-group">
              <div className="tools-title">Map Pinpointing</div>
              <div className="tools-grid">
                <button
                  className={`tool-action-btn ${calibrationMode === 'setCircle' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode(calibrationMode === 'setCircle' ? null : 'setCircle')}
                >
                  <Crosshair size={13} />
                  <span>Set Stage 1 Center</span>
                </button>
                <button
                  className={`tool-action-btn ${calibrationMode === 'setFlightStart' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode(calibrationMode === 'setFlightStart' ? null : 'setFlightStart')}
                >
                  <Plane size={13} />
                  <span>Set Flight Vector</span>
                </button>
              </div>
            </div>

            {/* Stage 1 Parameters */}
            <div className="param-group">
              <div className="group-label">
                <span>Stage 1 Center (m)</span>
                <span className="mono">{phase1Center.x}, {phase1Center.y}</span>
              </div>
              <div className="two-col-inputs">
                <div className="input-box">
                  <label>Center X</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    step="50"
                    value={phase1Center.x}
                    onChange={(e) => setPhase1Center({ ...phase1Center, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>Center Y</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    step="50"
                    value={phase1Center.y}
                    onChange={(e) => setPhase1Center({ ...phase1Center, y: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="slider-box" style={{ marginTop: '6px' }}>
                <div className="slider-label">
                  <span>Circle Radius</span>
                  <span className="mono">{phase1Radius}m</span>
                </div>
                <input
                  type="range"
                  min="1600"
                  max="2400"
                  step="50"
                  value={phase1Radius}
                  onChange={(e) => setPhase1Radius(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Flight Path Parameters */}
            <div className="param-group">
              <div className="group-label">
                <span>Flight Vector (m)</span>
                <span className="mono">
                  {Math.round(flightPath.angle)}° • {Math.round(flightPath.lengthMeters / 1000)}km
                </span>
              </div>
              <div className="two-col-inputs">
                <div className="input-box">
                  <label>Start X</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightStart.x}
                    onChange={(e) => setFlightStart({ ...flightStart, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>Start Y</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightStart.y}
                    onChange={(e) => setFlightStart({ ...flightStart, y: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>End X</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightEnd.x}
                    onChange={(e) => setFlightEnd({ ...flightEnd, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>End Y</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightEnd.y}
                    onChange={(e) => setFlightEnd({ ...flightEnd, y: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            {/* Layer Toggles */}
            <div className="param-group">
              <div className="group-label">Overlays</div>
              <div className="toggle-list">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                  />
                  <span>Shift Probability Heatmap</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showShiftArrows}
                    onChange={(e) => setShowShiftArrows(e.target.checked)}
                  />
                  <span>Shift Direction Arrows</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showFlightLine}
                    onChange={(e) => setShowFlightLine(e.target.checked)}
                  />
                  <span>Flight Trajectory Line</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Stage Progression Cards */}
      <div className="all-stages-summary tactical-card">
        <div className="summary-header">
          <div className="summary-title">
            <CheckCircle2 size={15} color="#059669" />
            <span>Predicted Safe Zone Stages (1 to 5)</span>
          </div>
        </div>

        <div className="stages-cards-row">
          {[1, 2, 3, 4, 5].map((stg) => {
            const p = phases[stg];
            const cfg = PHASE_CONFIG[stg];
            if (!p) return null;
            const poi = getErangelLandmark(p.x, p.y);

            return (
              <div
                key={stg}
                className="stage-summary-card"
                style={{ '--card-border': cfg.color }}
              >
                <div className="card-top">
                  <span className="stage-tag" style={{ color: cfg.color }}>
                    Stage {stg} ({cfg.name})
                  </span>
                  <span className="grid-tag mono">Grid {p.grid}</span>
                </div>

                <div className="card-body">
                  <div className="data-line">
                    <span className="data-label">Landmark:</span>
                    <span className="data-val truncate">{poi.name}</span>
                  </div>
                  <div className="data-line">
                    <span className="data-label">Diameter:</span>
                    <span className="data-val mono">{(p.r * 2 / 1000).toFixed(1)} km</span>
                  </div>
                  <div className="data-line">
                    <span className="data-label">Shift:</span>
                    <span className="data-val mono">
                      {stg === 1 ? 'Base Circle' : `${p.shiftDist}m ${p.compass}`}
                    </span>
                  </div>
                </div>

                <div className="card-footer">
                  <span className="contain-status">
                    {stg === 1 ? 'Mainland Drop' : stg === 5 ? 'Final Safe Zone' : `Stage ${stg} Safe Circle`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
