import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Sparkles, 
  Sliders, 
  Layers, 
  Download, 
  CheckCircle2, 
  Maximize2, 
  RotateCcw, 
  Eye, 
  Split, 
  ArrowRight,
  Plane,
  Crosshair,
  FileImage,
  Flame,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Target,
  Map
} from 'lucide-react';
import { 
  predictSequentialPhases, 
  PHASE_CONFIG, 
  toErangelGrid, 
  toCompassBearing,
  MAP_EXTENT_METERS 
} from '../utils/engine';
import StageMapCanvas from './StageMapCanvas';

export default function ImageMapPredictor() {
  const [uploadedImageSrc, setUploadedImageSrc] = useState('/samples/match_sample_1.png');
  const [imageName, setImageName] = useState('match_sample_1.png');
  const [imageDimensions, setImageDimensions] = useState({ width: 1024, height: 1024 });

  // Map Background: '8k' (Ultra High-Res 8192x8192) | 'screenshot' (Uploaded Image)
  const [mapBackground, setMapBackground] = useState('8k');
  const [is8kLoaded, setIs8kLoaded] = useState(false);

  // Pan & Zoom viewport state
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Calibration state (in meters: 0 to 8000)
  const [flightStart, setFlightStart] = useState({ x: 1600, y: 1900 });
  const [flightEnd, setFlightEnd] = useState({ x: 6700, y: 6400 });
  const [phase1Center, setPhase1Center] = useState({ x: 4100, y: 3900 });
  const [phase1Radius, setPhase1Radius] = useState(2000);

  // View & Layer options
  const [viewMode, setViewMode] = useState('overlay'); // 'overlay' | 'stages' | 'split'
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [selectedStage, setSelectedStage] = useState(null); // null = all stages
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showShiftArrows, setShowShiftArrows] = useState(true);
  const [showFlightLine, setShowFlightLine] = useState(true);
  const [calibrationMode, setCalibrationMode] = useState(null); // null | 'setCircle' | 'setFlightStart' | 'setFlightEnd'

  const canvasRef = useRef(null);
  const imageObjRef = useRef(null);
  const erangel8kRef = useRef(null);
  const erangelPreviewRef = useRef(null);
  const fileInputRef = useRef(null);

  // Preload Erangel 8K map and fast preview
  useEffect(() => {
    // 1. Fast preview map (6.7 MB)
    const preview = new Image();
    preview.src = '/erangel_map.png';
    preview.onload = () => {
      erangelPreviewRef.current = preview;
      renderCanvas();
    };

    // 2. Full Ultra 8K map (8192x8192)
    const full8k = new Image();
    full8k.src = '/erangel_map_8k.png';
    full8k.onload = () => {
      erangel8kRef.current = full8k;
      setIs8kLoaded(true);
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
      setImageDimensions({ width: img.naturalWidth || 1024, height: img.naturalHeight || 1024 });
      renderCanvas();
    };
  }, [uploadedImageSrc]);

  // Compute multi-stage predictions
  const prediction = predictSequentialPhases({
    flightStart,
    flightEnd,
    phase1Center,
    phase1Radius,
    enforceTerrain: true
  });
  const { phases, flightPath, latencyMs } = prediction;

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

  // Quick sample loader
  const handleLoadSample = (sampleSrc, name) => {
    setImageName(name);
    setUploadedImageSrc(sampleSrc);
  };

  // Focus on a specific stage (centers and zooms into that safe zone circle)
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

  // Convert clicked screen pixel into real map meters (0-8000), accounting for zoom & pan
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

  // Pan & Zoom Event Handlers
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

  // Render the prediction overlaid on either 8K Erangel map or input image
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    // 1. Apply Pan & Zoom Viewport Transform
    const midX = width / 2;
    const midY = height / 2;
    ctx.translate(midX + transform.offsetX, midY + transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-midX, -midY);

    // 2. Draw Base Map (8K Ultra Map or Uploaded Screenshot)
    const activeBaseImg = (mapBackground === '8k')
      ? (erangel8kRef.current || erangelPreviewRef.current || imageObjRef.current)
      : imageObjRef.current;

    if (activeBaseImg) {
      ctx.drawImage(activeBaseImg, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    }

    // Helper: meters (0-8000) to canvas pixels
    const mToPx = (m) => (m / MAP_EXTENT_METERS) * width;
    const strokeScale = 1 / Math.sqrt(Math.max(1, transform.scale));

    ctx.save();
    ctx.globalAlpha = overlayOpacity;

    // 3. Draw Probability Shift Heatmap
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

    // 4. Draw Flight Path
    if (showFlightLine) {
      const f1x = mToPx(flightStart.x);
      const f1y = mToPx(flightStart.y);
      const f2x = mToPx(flightEnd.x);
      const f2y = mToPx(flightEnd.y);

      // Trajectory dashed line
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(1.5, 3 * strokeScale);
      ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);
      ctx.beginPath();
      ctx.moveTo(f1x, f1y);
      ctx.lineTo(f2x, f2y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flight direction arrow
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

      // Start circle marker
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(1.2, 2.5 * strokeScale);
      ctx.beginPath();
      ctx.arc(f1x, f1y, Math.max(3.5, 7 * strokeScale), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const fontSize = Math.max(8, Math.round(11 * strokeScale));
      ctx.font = `700 ${fontSize}px JetBrains Mono, monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText('✈ FLIGHT START', f1x + 10 * strokeScale, f1y - 8 * strokeScale);
      ctx.shadowBlur = 0;
    }

    // 5. Draw Predicted Shift Vectors (Arrows)
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

        // Shift vector arrowhead
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

    // 6. Draw All 5 Sequential Safe Zone Circles
    phaseList.forEach((p) => {
      const isVisible = selectedStage === null || selectedStage === p.phase;
      if (!isVisible) return;

      const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb' };
      const cx = mToPx(p.x);
      const cy = mToPx(p.y);
      const cr = mToPx(p.r);

      // Circle Fill
      ctx.fillStyle = cfg.bg || 'rgba(37, 99, 235, 0.08)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      // Circle Stroke
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = Math.max(1.4, ((selectedStage === p.phase) ? 3.5 : 2.5) * strokeScale);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();

      // Center Crosshair
      const chSize = Math.max(3.5, 7 * strokeScale);
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
      ctx.beginPath();
      ctx.moveTo(cx - chSize, cy);
      ctx.lineTo(cx + chSize, cy);
      ctx.moveTo(cx, cy - chSize);
      ctx.lineTo(cx, cy + chSize);
      ctx.stroke();

      // Stage Badge Tag
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

    ctx.restore(); // restore globalAlpha
    ctx.restore(); // restore viewport transform
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
    flightEnd,
    is8kLoaded
  ]);

  // Re-render canvas whenever relevant parameters change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Download composited image
  const handleDownloadResult = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ZonePrediction_${imageName.replace(/\.[^/.]+$/, "")}_AllStages.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="image-predictor-container">
      {/* Top Banner / Ingestion Bar */}
      <div className="ingestion-deck tactical-card">
        <div className="deck-left">
          <div className="ingestion-header">
            <FileImage size={18} className="deck-icon" />
            <div>
              <div className="deck-title">Upload Match Map</div>
              <div className="deck-subtitle">
                Upload your map screenshot to see all 5 predicted circle stages
              </div>
            </div>
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
            <Upload size={15} />
            <span>Upload Map Image</span>
          </button>

          <div className="sample-btn-group">
            <span className="sample-label">Or Samples:</span>
            <button
              className="sample-btn"
              onClick={() => handleLoadSample('/samples/match_sample_1.png', 'match_sample_1.png')}
            >
              Match Sample
            </button>
            <button
              className="sample-btn"
              onClick={() => handleLoadSample('/samples/match_sample_2.png', 'erangel_official.png')}
            >
              Official Erangel
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace: Canvas on Left, Calibration Controls on Right */}
      <div className="predictor-workspace-grid">
        {/* Left: Composited Map Image with Zone Predictions */}
        <div className="image-canvas-card tactical-card">
          <div className="canvas-header-bar">
            <div className="image-meta mono">
              <span>ACTIVE MAP: <b>{imageName}</b></span>
            </div>

            <div className="view-mode-tabs">
              <button
                className={`tab-btn ${viewMode === 'overlay' ? 'active' : ''}`}
                onClick={() => setViewMode('overlay')}
              >
                <Eye size={13} />
                <span>Full Overlay</span>
              </button>
              <button
                className={`tab-btn ${viewMode === 'stages' ? 'active' : ''}`}
                onClick={() => setViewMode('stages')}
              >
                <Layers size={13} />
                <span>Stage-Wise Maps</span>
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
                <span>Download PNG</span>
              </button>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="canvas-container">
            {viewMode === 'stages' ? (
              /* Stage-Wise Multiple Maps Grid */
              <div className="stages-multi-grid">
                <div className="multi-grid-intro">
                  <div className="intro-text">
                    <b>Stages 1 to 5 Progression</b>
                    <span>Individual maps showing each circle shift and safe zone.</span>
                  </div>
                  <button
                    className="batch-download-btn mono"
                    onClick={handleDownloadResult}
                  >
                    <Download size={13} />
                    <span>Download All Stages PNG</span>
                  </button>
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
                  <div className="panel-badge">RAW INPUT IMAGE</div>
                  <img src={uploadedImageSrc} alt="Input Map" className="split-img" />
                </div>
                <div className="split-panel">
                  <div className="panel-badge">PREDICTED ALL 5 STAGES (8K MAP)</div>
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
                {/* 8K Zoom & Map Controls Bar */}
                <div className="canvas-zoom-toolbar">
                  <div className="toolbar-left">
                    <div className="map-source-switch">
                      <button
                        className={`map-switch-btn ${mapBackground === '8k' ? 'active' : ''}`}
                        onClick={() => setMapBackground('8k')}
                        title="Show prediction on Ultra 8K Erangel map"
                      >
                        <Map size={13} />
                        <span>8K Ultra Map</span>
                        <span className="hd-tag">8K</span>
                      </button>
                      <button
                        className={`map-switch-btn ${mapBackground === 'screenshot' ? 'active' : ''}`}
                        onClick={() => setMapBackground('screenshot')}
                        title="Show prediction overlaid on your uploaded screenshot"
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
                      title="Zoom directly into Stage 5 Final Circle"
                    >
                      <Target size={13} />
                      <span>Focus Final Zone (Stage 5)</span>
                    </button>
                  </div>

                  <div className="toolbar-right">
                    <span className="zoom-level-badge mono">
                      🔍 {Math.round(transform.scale * 100)}%
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
                      title="Reset Zoom to Fit"
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
                        {calibrationMode === 'setCircle' && 'Click on the map to set Stage 1 Center'}
                        {calibrationMode === 'setFlightStart' && 'Click flight trajectory START point on the map'}
                        {calibrationMode === 'setFlightEnd' && 'Now click flight trajectory END point on the map'}
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

          {/* Quick Stage Filter Scrubber */}
          <div className="stage-filter-bar">
            <span className="filter-title">Inspect Stage:</span>
            <button
              className={`stage-pill ${selectedStage === null ? 'active' : ''}`}
              onClick={() => setSelectedStage(null)}
            >
              All 5 Stages
            </button>
            {[1, 2, 3, 4, 5].map((stg) => (
              <button
                key={stg}
                className={`stage-pill ${selectedStage === stg ? 'active' : ''}`}
                style={{ '--stg-color': PHASE_CONFIG[stg].color }}
                onClick={() => setSelectedStage(stg)}
              >
                Stage {stg} ({PHASE_CONFIG[stg].name})
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

        {/* Right: Calibration & Parameter Deck */}
        <div className="calibration-deck tactical-card">
          <div className="deck-title-bar">
            <div className="deck-title-text">
              <Sliders size={15} className="deck-title-icon" />
              <span>Adjust Zones & Flight</span>
            </div>
          </div>

          <div className="deck-body">
            {/* Quick Calibration Buttons */}
            <div className="calibration-tools-group">
              <div className="tools-title">🎯 Quick Pinpoint on Map</div>
              <div className="tools-grid">
                <button
                  className={`tool-action-btn ${calibrationMode === 'setCircle' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode(calibrationMode === 'setCircle' ? null : 'setCircle')}
                >
                  <Crosshair size={14} />
                  <span>Set Stage 1 Center</span>
                </button>
                <button
                  className={`tool-action-btn ${calibrationMode === 'setFlightStart' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode(calibrationMode === 'setFlightStart' ? null : 'setFlightStart')}
                >
                  <Plane size={14} />
                  <span>Set Flight Path</span>
                </button>
              </div>
            </div>

            {/* Phase 1 Parameters */}
            <div className="param-group">
              <div className="group-label">
                <span>⭕ Stage 1 Circle</span>
                <span className="mono">Grid {phases[1]?.grid}</span>
              </div>
              <div className="two-col-inputs">
                <div className="input-box">
                  <label>Center X (m)</label>
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
                  <label>Center Y (m)</label>
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

              <div className="slider-box">
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
                <span>✈️ Match Flight Path</span>
                <span className="mono">
                  {Math.round(flightPath.angle)}° ({toCompassBearing(flightPath.angle)})
                </span>
              </div>
              <div className="two-col-inputs">
                <div className="input-box">
                  <label>Flight Start X</label>
                  <input
                    type="number"
                    value={flightStart.x}
                    onChange={(e) => setFlightStart({ ...flightStart, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>Flight Start Y</label>
                  <input
                    type="number"
                    value={flightStart.y}
                    onChange={(e) => setFlightStart({ ...flightStart, y: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>Flight End X</label>
                  <input
                    type="number"
                    value={flightEnd.x}
                    onChange={(e) => setFlightEnd({ ...flightEnd, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>Flight End Y</label>
                  <input
                    type="number"
                    value={flightEnd.y}
                    onChange={(e) => setFlightEnd({ ...flightEnd, y: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            {/* Layer Toggles */}
            <div className="param-group">
              <div className="group-label">Display Options</div>
              <div className="toggle-list">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                  />
                  <span>Show Zone Shift Heatmap</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showShiftArrows}
                    onChange={(e) => setShowShiftArrows(e.target.checked)}
                  />
                  <span>Show Shift Direction Arrows</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showFlightLine}
                    onChange={(e) => setShowFlightLine(e.target.checked)}
                  />
                  <span>Show Flight Path</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Telemetry Cards for All Predicted Stages */}
      <div className="all-stages-summary tactical-card">
        <div className="summary-header">
          <div className="summary-title">
            <CheckCircle2 size={15} className="summary-icon" />
            <span>Predicted Stages (1 to 5)</span>
          </div>
        </div>

        <div className="stages-cards-row">
          {[1, 2, 3, 4, 5].map((stg) => {
            const p = phases[stg];
            const cfg = PHASE_CONFIG[stg];
            if (!p) return null;

            return (
              <div
                key={stg}
                className="stage-summary-card"
                style={{ '--card-border': cfg.color }}
              >
                <div className="card-top">
                  <span className="stage-tag" style={{ color: cfg.color }}>
                    Stage {stg}
                  </span>
                  <span className="grid-tag mono">Grid {p.grid}</span>
                </div>

                <div className="card-body mono">
                  <div className="data-line">
                    <span className="data-label">Radius:</span>
                    <span className="data-val">{p.r}m</span>
                  </div>
                  <div className="data-line">
                    <span className="data-label">Shift:</span>
                    <span className="data-val">
                      {stg === 1 ? 'Base Circle' : `${Math.round(p.shiftDist)}m (${p.compass})`}
                    </span>
                  </div>
                  <div className="data-line">
                    <span className="data-label">Center:</span>
                    <span className="data-val">({Math.round(p.x)}m, {Math.round(p.y)}m)</span>
                  </div>
                </div>

                <div className="card-footer">
                  <span className="contain-status">
                    {stg === 1 ? 'Drop Zone' : `Stage ${stg} Safe Zone`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .image-predictor-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .ingestion-deck {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 22px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .ingestion-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .deck-icon {
          color: #2563eb;
        }

        .deck-title {
          font-weight: 800;
          font-size: 15px;
          color: var(--text-primary);
        }

        .deck-subtitle {
          font-size: 12px;
          color: var(--text-muted);
        }

        .deck-right {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .upload-btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #2563eb;
          color: #ffffff;
          font-weight: 700;
          font-size: 13px;
          border-radius: var(--radius-sm);
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
        }

        .upload-btn-primary:hover {
          background: #1d4ed8;
        }

        .sample-btn-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .sample-label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .sample-btn {
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 600;
          background: var(--bg-surface-subtle);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .sample-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .predictor-workspace-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(360px, 1fr);
          gap: 20px;
          align-items: start;
        }

        .image-canvas-card {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .canvas-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
          flex-wrap: wrap;
          gap: 10px;
        }

        .image-meta {
          font-size: 12px;
          color: var(--text-primary);
        }

        .meta-dim {
          color: var(--text-muted);
          margin-left: 6px;
        }

        .view-mode-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tab-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: var(--bg-surface);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 600;
        }

        .tab-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .tab-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        .download-btn {
          background: var(--color-success-bg);
          color: var(--color-success);
          border-color: rgba(5, 150, 105, 0.3);
        }

        .download-btn:hover {
          background: #059669;
          color: #ffffff;
        }

        .canvas-container {
          background: #0f172a;
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 480px;
          overflow: hidden;
        }

        .stages-multi-grid {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background: var(--bg-surface-subtle);
        }

        .multi-grid-intro {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          flex-wrap: wrap;
          gap: 10px;
        }

        .intro-text {
          display: flex;
          flex-direction: column;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .intro-text b {
          font-size: 12px;
          color: var(--text-primary);
        }

        .batch-download-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: #2563eb;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          border-radius: var(--radius-sm);
        }

        .batch-download-btn:hover {
          background: #1d4ed8;
        }

        .stage-maps-masonry {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 14px;
        }

        .single-canvas-wrapper {
          position: relative;
          width: 100%;
          display: flex;
          flex-direction: column;
        }

        .canvas-zoom-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
          flex-wrap: wrap;
          gap: 10px;
        }

        .map-source-switch {
          display: flex;
          align-items: center;
          background: var(--bg-surface);
          padding: 2px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          gap: 2px;
        }

        .map-switch-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          background: transparent;
          transition: all 0.15s ease;
        }

        .map-switch-btn:hover {
          color: var(--text-primary);
        }

        .map-switch-btn.active {
          background: #2563eb;
          color: #ffffff;
        }

        .hd-tag {
          font-size: 9px;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 3px;
          background: #d97706;
          color: #ffffff;
        }

        .focus-stage5-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 13px;
          background: #7c3aed;
          color: #ffffff;
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 700;
          transition: all 0.15s ease;
          box-shadow: 0 1px 4px rgba(124, 58, 237, 0.25);
        }

        .focus-stage5-btn:hover {
          background: #6d28d9;
          transform: translateY(-1px);
        }

        .toolbar-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .zoom-level-badge {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-secondary);
          padding: 2px 6px;
        }

        .zoom-tool-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .zoom-tool-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .canvas-viewport-box {
          position: relative;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #0f172a;
          overflow: hidden;
        }

        .main-image-canvas {
          max-width: 100%;
          height: auto;
          display: block;
          user-select: none;
        }

        .cursor-grab {
          cursor: grab;
        }

        .cursor-grabbing {
          cursor: grabbing;
        }

        .calibrating-cursor {
          cursor: crosshair;
        }

        .calibration-prompt-pill {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.92);
          color: #ffffff;
          border: 1px solid #3b82f6;
          padding: 8px 16px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          z-index: 10;
        }

        .cancel-pill-btn {
          padding: 2px 8px;
          background: #334155;
          color: #ffffff;
          border-radius: var(--radius-sm);
          font-size: 10px;
        }

        .split-view-wrapper {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 12px;
          width: 100%;
        }

        .split-panel {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #1e293b;
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .panel-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0,0,0,0.7);
          color: #ffffff;
          font-size: 9px;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 4px;
          z-index: 5;
        }

        .split-img, .split-canvas {
          max-width: 100%;
          height: auto;
          display: block;
        }

        .stage-filter-bar {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          background: var(--bg-surface-subtle);
          border-top: 1px solid var(--border-subtle);
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .stage-pill {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 700;
          background: var(--bg-surface);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .stage-pill:hover {
          background: var(--bg-hover);
        }

        .stage-pill.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        .opacity-slider-group {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .opacity-slider-group input {
          width: 80px;
        }

        .calibration-deck {
          display: flex;
          flex-direction: column;
        }

        .deck-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
        }

        .deck-title-text {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 13px;
          color: var(--text-primary);
        }

        .deck-title-icon {
          color: #2563eb;
        }

        .deck-body {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .calibration-tools-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .tools-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .tools-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .tool-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          background: var(--bg-surface-subtle);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 600;
        }

        .tool-action-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .tool-action-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        .param-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .param-group:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .group-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .two-col-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .input-box {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .input-box label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .slider-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .slider-label {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .toggle-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-primary);
          cursor: pointer;
        }

        .toggle-row input {
          accent-color: #2563eb;
        }

        .all-stages-summary {
          display: flex;
          flex-direction: column;
        }

        .summary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
          flex-wrap: wrap;
          gap: 8px;
        }

        .summary-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 13px;
          color: var(--text-primary);
        }

        .summary-icon {
          color: #059669;
        }

        .stages-cards-row {
          padding: 16px 18px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .stage-summary-card {
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-subtle);
          border-left: 4px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .stage-tag {
          font-weight: 800;
          font-size: 13px;
        }

        .grid-tag {
          font-size: 10px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
        }

        .card-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .data-line {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }

        .data-label {
          color: var(--text-muted);
        }

        .data-val {
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-footer {
          margin-top: 4px;
          font-size: 10px;
          font-weight: 600;
          color: var(--color-success);
        }

        @media (max-width: 1200px) {
          .predictor-workspace-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
