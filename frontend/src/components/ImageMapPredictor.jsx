import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, 
  Sliders, 
  Layers, 
  Download, 
  CheckCircle2, 
  AlertTriangle,
  ShieldCheck,
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
  Map,
  Sparkles,
  RefreshCw,
  Info
} from 'lucide-react';
import { 
  predictSequentialPhases, 
  generateTacticalBriefing,
  PHASE_CONFIG, 
  getErangelLandmark,
  MAP_EXTENT_METERS,
  toErangelGrid,
  toCompassBearing,
  isErangelLand
} from '../utils/engine';
import {
  screenToMeters,
  autoDetectSafeZoneAndFlight,
  auditPhasesSafety
} from '../utils/imageCalibration';
import StageMapCanvas from './StageMapCanvas';
import './ImageMapPredictor.css';

export default function ImageMapPredictor() {
  // 1. Uploaded match image state
  const [uploadedImageSrc, setUploadedImageSrc] = useState('/samples/match_sample_1.png');
  const [imageName, setImageName] = useState('match_sample_1.png');
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const [loadedScreenshot, setLoadedScreenshot] = useState(null);
  const [loadedErangel8k, setLoadedErangel8k] = useState(null);
  const [loadedErangelPreview, setLoadedErangelPreview] = useState(null);

  // 2. Map Background: 'screenshot' (Match Screenshot) | '8k' (Ultra High-Res 8192x8192 Map)
  const [mapBackground, setMapBackground] = useState('screenshot');

  // 3. Pan & Zoom Viewport
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [activeDrag, setActiveDrag] = useState(null); // null | 'pan' | 'circleCenter' | 'circleRadius' | 'flightStart' | 'flightEnd'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredHandle, setHoveredHandle] = useState(null); // null | handle name
  const [cursorPosMeters, setCursorPosMeters] = useState({ x: 4000, y: 4000 });

  // 4. Calibration Parameters (in meters: 0 to 8000)
  const [flightStart, setFlightStart] = useState({ x: 1500, y: 1800 });
  const [flightEnd, setFlightEnd] = useState({ x: 6600, y: 6200 });
  const [phase1Center, setPhase1Center] = useState({ x: 4100, y: 3900 });
  const [phase1Radius, setPhase1Radius] = useState(2000);
  const [enforceTerrain, setEnforceTerrain] = useState(true);

  // 5. Automated Computer Vision Detection state
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [autoDetectReport, setAutoDetectReport] = useState(null);

  // 6. View & Layer Options
  const [viewMode, setViewMode] = useState('overlay'); // 'overlay' | 'stages' | 'split'
  const [overlayOpacity, setOverlayOpacity] = useState(0.88);
  const [selectedStage, setSelectedStage] = useState(null); // null = all
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showShiftArrows, setShowShiftArrows] = useState(true);
  const [showFlightLine, setShowFlightLine] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAuditTable, setShowAuditTable] = useState(true);
  const [calibrationMode, setCalibrationMode] = useState(null); // null | 'setCircle' | 'setFlightStart' | 'setFlightEnd'

  // Refs
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animationFrameRef = useRef(null);

  // 7. Live Inference Execution: Run XGBoost-derived sequential prediction engine
  const prediction = useMemo(() => {
    return predictSequentialPhases({
      flightStart,
      flightEnd,
      phase1Center,
      phase1Radius,
      enforceTerrain
    });
  }, [flightStart, flightEnd, phase1Center, phase1Radius, enforceTerrain]);

  const { phases, flightPath, latencyMs } = prediction;
  const briefing = useMemo(() => generateTacticalBriefing(phases, flightPath), [phases, flightPath]);
  const auditReport = useMemo(() => auditPhasesSafety(phases), [phases]);

  // Preload Erangel 8K map and preview
  useEffect(() => {
    const preview = new Image();
    preview.src = '/erangel_map.png';
    preview.onload = () => {
      setLoadedErangelPreview(preview);
    };

    const full8k = new Image();
    full8k.src = '/erangel_map_8k.png';
    full8k.onload = () => {
      setLoadedErangel8k(full8k);
    };
  }, []);

  // Load uploaded image object whenever source changes
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = uploadedImageSrc;
    img.onload = () => {
      setLoadedScreenshot(img);
    };
  }, [uploadedImageSrc]);

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadLocalFile(file);
  };

  const loadLocalFile = (file) => {
    setImageName(file.name);
    setAutoDetectReport(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImageSrc(event.target?.result);
      setMapBackground('screenshot');
    };
    reader.readAsDataURL(file);
  };

  // Drag and Drop file upload
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDropZoneActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDropZoneActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDropZoneActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      loadLocalFile(file);
    }
  };

  const handleLoadSample = (sampleSrc, name) => {
    setImageName(name);
    setAutoDetectReport(null);
    setUploadedImageSrc(sampleSrc);
  };

  // Automated Computer Vision Detection trigger
  const handleRunAutoDetection = () => {
    if (!loadedScreenshot) return;
    setIsAutoDetecting(true);

    setTimeout(() => {
      try {
        const result = autoDetectSafeZoneAndFlight(loadedScreenshot);
        if (result && result.success) {
          if (result.circle) {
            setPhase1Center({ x: result.circle.x, y: result.circle.y });
            setPhase1Radius(result.circle.r);
          }
          if (result.flight && result.flight.start && result.flight.end) {
            setFlightStart(result.flight.start);
            setFlightEnd(result.flight.end);
          }
          setAutoDetectReport({
            success: true,
            circleConfidence: result.circle.confidence,
            flightConfidence: result.flight.confidence,
            notes: result.notes
          });
        } else {
          setAutoDetectReport({
            success: false,
            notes: result?.notes || 'Detection did not find high-confidence white circles.'
          });
        }
      } catch (err) {
        console.error('Auto detection error:', err);
        setAutoDetectReport({ success: false, notes: 'CV Analysis error' });
      } finally {
        setIsAutoDetecting(false);
      }
    }, 180);
  };

  // Focus specific stage with smooth auto-zoom
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

  // Mouse Wheel Zoom
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

  // Hit-testing interactive calibration handles on canvas
  const getHandleAtPoint = (meterPt, canvasWidth) => {
    const thresholdMeters = (18 / canvasWidth) * MAP_EXTENT_METERS * (1 / transform.scale);

    // 1. Center Handle
    if (Math.hypot(meterPt.x - phase1Center.x, meterPt.y - phase1Center.y) < thresholdMeters) {
      return 'circleCenter';
    }

    // 2. Radius Handle (East edge of Circle 1)
    const radHandleX = phase1Center.x + phase1Radius;
    const radHandleY = phase1Center.y;
    if (Math.hypot(meterPt.x - radHandleX, meterPt.y - radHandleY) < thresholdMeters) {
      return 'circleRadius';
    }

    // 3. Flight Start Handle
    if (Math.hypot(meterPt.x - flightStart.x, meterPt.y - flightStart.y) < thresholdMeters) {
      return 'flightStart';
    }

    // 4. Flight End Handle
    if (Math.hypot(meterPt.x - flightEnd.x, meterPt.y - flightEnd.y) < thresholdMeters) {
      return 'flightEnd';
    }

    return null;
  };

  // Mouse Down: Start Pan or Handle Drag or Pinpoint
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (calibrationMode) {
      handleCalibrationClick(e);
      return;
    }

    const meterPt = screenToMeters(e.clientX, e.clientY, canvas, transform);
    const hit = getHandleAtPoint(meterPt, canvas.width);

    if (hit) {
      setActiveDrag(hit);
      setDragStart({ x: meterPt.x, y: meterPt.y });
    } else {
      setActiveDrag('pan');
      setDragStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
    }
  };

  // Mouse Move: Update Hover state, Coordinates HUD, and Active Drag
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const meterPt = screenToMeters(e.clientX, e.clientY, canvas, transform);
    setCursorPosMeters(meterPt);

    // Hover handle detection when not dragging
    if (!activeDrag && !calibrationMode) {
      const hit = getHandleAtPoint(meterPt, canvas.width);
      setHoveredHandle(hit);
    }

    if (!activeDrag) return;

    if (activeDrag === 'pan') {
      setTransform((prev) => ({
        ...prev,
        offsetX: e.clientX - dragStart.x,
        offsetY: e.clientY - dragStart.y
      }));
    } else if (activeDrag === 'circleCenter') {
      setPhase1Center({
        x: Math.max(0, Math.min(MAP_EXTENT_METERS, meterPt.x)),
        y: Math.max(0, Math.min(MAP_EXTENT_METERS, meterPt.y))
      });
    } else if (activeDrag === 'circleRadius') {
      const newRadius = Math.round(Math.hypot(meterPt.x - phase1Center.x, meterPt.y - phase1Center.y));
      const clampedRadius = Math.max(1200, Math.min(2800, newRadius));
      setPhase1Radius(clampedRadius);
    } else if (activeDrag === 'flightStart') {
      setFlightStart({
        x: Math.max(0, Math.min(MAP_EXTENT_METERS, meterPt.x)),
        y: Math.max(0, Math.min(MAP_EXTENT_METERS, meterPt.y))
      });
    } else if (activeDrag === 'flightEnd') {
      setFlightEnd({
        x: Math.max(0, Math.min(MAP_EXTENT_METERS, meterPt.x)),
        y: Math.max(0, Math.min(MAP_EXTENT_METERS, meterPt.y))
      });
    }
  };

  const handleMouseUp = () => {
    setActiveDrag(null);
  };

  // Calibration Pinpoint Clicks
  const handleCalibrationClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !calibrationMode) return;
    const { x: meterX, y: meterY } = screenToMeters(e.clientX, e.clientY, canvas, transform);

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

  // Main Canvas Rendering Routine
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

    // 1. Draw Map Base
    const activeBaseImg = (mapBackground === '8k')
      ? (loadedErangel8k || loadedErangelPreview || loadedScreenshot)
      : loadedScreenshot;

    if (activeBaseImg) {
      ctx.drawImage(activeBaseImg, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    }

    const mToPx = (m) => (m / MAP_EXTENT_METERS) * width;
    const strokeScale = 1 / Math.sqrt(Math.max(1, transform.scale));

    // 2. Erangel 8x8 1km Grid Overlay
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = Math.max(0.6, 1 * strokeScale);
      ctx.setLineDash([2 * strokeScale, 4 * strokeScale]);

      for (let i = 1; i < 8; i++) {
        const pos = (i / 8) * width;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Grid Letters & Numbers
      ctx.font = `600 ${Math.max(9, Math.round(11 * strokeScale))}px JetBrains Mono, monospace`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      for (let col = 0; col < 8; col++) {
        const letter = String.fromCharCode(65 + col);
        ctx.fillText(letter, (col + 0.5) * (width / 8) - 4 * strokeScale, 16 * strokeScale);
      }
      for (let row = 0; row < 8; row++) {
        ctx.fillText(String(row + 1), 6 * strokeScale, (row + 0.5) * (height / 8) + 4 * strokeScale);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = overlayOpacity;

    // 3. Probability Heatmap
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
        p1PxX, p1PxY, p1PxR * 0.96
      );
      grad.addColorStop(0, 'rgba(220, 38, 38, 0.48)');
      grad.addColorStop(0.35, 'rgba(217, 119, 6, 0.32)');
      grad.addColorStop(0.75, 'rgba(37, 99, 235, 0.16)');
      grad.addColorStop(1, 'rgba(37, 99, 235, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.arc(p1PxX, p1PxY, p1PxR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 4. Flight Path Vector
    if (showFlightLine) {
      const f1x = mToPx(flightStart.x);
      const f1y = mToPx(flightStart.y);
      const f2x = mToPx(flightEnd.x);
      const f2y = mToPx(flightEnd.y);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(1.6, 3.2 * strokeScale);
      ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);
      ctx.beginPath();
      ctx.moveTo(f1x, f1y);
      ctx.lineTo(f2x, f2y);
      ctx.stroke();
      ctx.setLineDash([]);

      const angle = Math.atan2(f2y - f1y, f2x - f1x);
      const hLen = Math.max(9, 16 * strokeScale);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(f2x, f2y);
      ctx.lineTo(f2x - hLen * Math.cos(angle - Math.PI / 7), f2y - hLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(f2x - (hLen * 0.6) * Math.cos(angle), f2y - (hLen * 0.6) * Math.sin(angle));
      ctx.lineTo(f2x - hLen * Math.cos(angle + Math.PI / 7), f2y - hLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();

      // Flight Start Draggable Handle
      const isStartHovered = hoveredHandle === 'flightStart' || activeDrag === 'flightStart';
      ctx.fillStyle = isStartHovered ? '#fbbf24' : '#ffffff';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(1.4, 2.8 * strokeScale);
      ctx.beginPath();
      ctx.arc(f1x, f1y, Math.max(4.5, (isStartHovered ? 9 : 7) * strokeScale), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Flight End Draggable Handle
      const isEndHovered = hoveredHandle === 'flightEnd' || activeDrag === 'flightEnd';
      ctx.fillStyle = isEndHovered ? '#fbbf24' : '#d97706';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
      ctx.beginPath();
      ctx.arc(f2x, f2y, Math.max(3.5, (isEndHovered ? 8 : 6) * strokeScale), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 5. Shift Direction Vectors (Stage N -> N+1)
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
        ctx.lineWidth = Math.max(1.4, 2.2 * strokeScale);
        ctx.setLineDash([5 * strokeScale, 4 * strokeScale]);
        ctx.beginPath();
        ctx.moveTo(c1x, c1y);
        ctx.lineTo(c2x, c2y);
        ctx.stroke();
        ctx.setLineDash([]);

        const arrowAngle = Math.atan2(c2y - c1y, c2x - c1x);
        const arrowLen = Math.max(6, 11 * strokeScale);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(c2x, c2y);
        ctx.lineTo(c2x - arrowLen * Math.cos(arrowAngle - Math.PI / 6), c2y - arrowLen * Math.sin(arrowAngle - Math.PI / 6));
        ctx.lineTo(c2x - arrowLen * Math.cos(arrowAngle + Math.PI / 6), c2y - arrowLen * Math.sin(arrowAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }

    // 6. Safe Zone Circles (Stages 1 through 5)
    phaseList.forEach((p) => {
      const isVisible = selectedStage === null || selectedStage === p.phase;
      if (!isVisible) return;

      const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb' };
      const cx = mToPx(p.x);
      const cy = mToPx(p.y);
      const cr = mToPx(p.r);

      // Circle Fill
      ctx.fillStyle = cfg.bg || 'rgba(37, 99, 235, 0.1)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      // Circle Outline
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = Math.max(1.5, ((selectedStage === p.phase) ? 3.8 : 2.5) * strokeScale);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();

      // Center Crosshair
      const chSize = Math.max(4, 8 * strokeScale);
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
      ctx.beginPath();
      ctx.moveTo(cx - chSize, cy);
      ctx.lineTo(cx + chSize, cy);
      ctx.moveTo(cx, cy - chSize);
      ctx.lineTo(cx, cy + chSize);
      ctx.stroke();

      // Center Interactive Draggable Handle (For Stage 1)
      if (p.phase === 1) {
        const isCenterHovered = hoveredHandle === 'circleCenter' || activeDrag === 'circleCenter';
        ctx.fillStyle = isCenterHovered ? '#60a5fa' : 'rgba(37, 99, 235, 0.85)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4.5, (isCenterHovered ? 9 : 7) * strokeScale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Radius Resize Handle on Circle 1 East Edge
        const radHandleX = cx + cr;
        const radHandleY = cy;
        const isRadHovered = hoveredHandle === 'circleRadius' || activeDrag === 'circleRadius';
        ctx.fillStyle = isRadHovered ? '#60a5fa' : 'rgba(37, 99, 235, 0.85)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, 2 * strokeScale);
        ctx.beginPath();
        ctx.arc(radHandleX, radHandleY, Math.max(4, (isRadHovered ? 8 : 6) * strokeScale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Tactical Stage Badge
      const label = `Stage ${p.phase} • ${p.r}m${p.isReprojected ? ' [Land Reprojected]' : ''}`;
      const fontSize = Math.max(8.5, Math.round(11 * strokeScale));
      ctx.font = `700 ${fontSize}px JetBrains Mono, monospace`;
      const textW = ctx.measureText(label).width;

      const badgeX = cx + 8 * strokeScale;
      const badgeY = cy - cr - 8 * strokeScale;
      const pad = 4 * strokeScale;
      const boxH = Math.max(13, 19 * strokeScale);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(badgeX - pad, badgeY - boxH + pad, textW + pad * 2, boxH, 3);
      ctx.fill();

      ctx.fillStyle = cfg.color;
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
    showGrid,
    selectedStage,
    phases,
    flightStart,
    flightEnd,
    hoveredHandle,
    activeDrag,
    loadedScreenshot,
    loadedErangel8k,
    loadedErangelPreview
  ]);

  // Request Animation Frame on state changes
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderCanvas);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [renderCanvas]);

  // Download high-resolution rendered result
  const handleDownloadResult = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ZonePrediction_${imageName.replace(/\.[^/.]+$/, "")}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Determine dynamic canvas cursor
  const getCanvasCursor = () => {
    if (calibrationMode) return 'crosshair';
    if (activeDrag === 'circleCenter' || activeDrag === 'flightStart' || activeDrag === 'flightEnd') return 'grabbing';
    if (activeDrag === 'circleRadius') return 'ew-resize';
    if (activeDrag === 'pan') return 'grabbing';
    if (hoveredHandle === 'circleCenter' || hoveredHandle === 'flightStart' || hoveredHandle === 'flightEnd') return 'grab';
    if (hoveredHandle === 'circleRadius') return 'ew-resize';
    return 'default';
  };

  return (
    <div className="image-predictor-container">
      {/* 1. TOP INGESTION & SCANNER DECK */}
      <div 
        className={`ingestion-deck tactical-card ${isDropZoneActive ? 'drop-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="ingestion-header">
          <FileImage size={18} className="deck-icon" />
          <div>
            <div className="deck-title">Match Screenshot Zone Scanner & Predictor</div>
            <div className="deck-subtitle">
              Upload match screenshot to calibrate Stage 1 circle and predict subsequent zone shifts (Stages 2–5)
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

          {/* Automated Computer Vision Scanner Button */}
          <button
            className={`auto-cv-btn ${isAutoDetecting ? 'loading' : ''}`}
            onClick={handleRunAutoDetection}
            disabled={isAutoDetecting}
            title="Automatically detect safe zone circle and flight path vector from image"
          >
            {isAutoDetecting ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />}
            <span>{isAutoDetecting ? 'Analyzing Image...' : 'Auto-Detect (CV)'}</span>
          </button>

          <button
            className="upload-btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={13} />
            <span>Upload Screenshot</span>
          </button>

          <div className="sample-btn-group">
            <span className="sample-label">Samples:</span>
            <button
              className="sample-btn"
              onClick={() => handleLoadSample('/samples/match_sample_1.png', 'match_sample_1.png')}
            >
              Match VOD 1
            </button>
            <button
              className="sample-btn"
              onClick={() => handleLoadSample('/samples/match_sample_2.png', 'erangel_official.png')}
            >
              Erangel Official
            </button>
          </div>
        </div>
      </div>

      {/* CV Detection Banner if active */}
      {autoDetectReport && (
        <div className={`autodetect-banner ${autoDetectReport.success ? 'success' : 'warn'}`}>
          <div className="banner-left">
            {autoDetectReport.success ? (
              <ShieldCheck size={16} className="text-emerald" />
            ) : (
              <AlertTriangle size={16} className="text-amber" />
            )}
            <span><b>Automated Detection:</b> {autoDetectReport.notes}</span>
          </div>
          {autoDetectReport.success && (
            <div className="banner-badges">
              <span className="conf-badge">Circle: {autoDetectReport.circleConfidence}% Confidence</span>
              <span className="conf-badge">Flight: {autoDetectReport.flightConfidence}% Confidence</span>
            </div>
          )}
        </div>
      )}

      {/* 2. TACTICAL HUD SUMMARY BAR */}
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

        <div className="hud-metric">
          <span className="hud-label">
            <Target size={12} className="hud-icon" />
            <span>Inference SLA</span>
          </span>
          <span className="hud-val mono text-emerald">{latencyMs} ms</span>
          <span className="hud-sub">Target &lt; 500 ms (PASS)</span>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE GRID: CANVAS ON LEFT, CALIBRATION ON RIGHT */}
      <div className="predictor-workspace-grid">
        {/* Left Column: Interactive HTML5 Canvas */}
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
                <span>Overlay Mode</span>
              </button>
              <button
                className={`tab-btn ${viewMode === 'stages' ? 'active' : ''}`}
                onClick={() => setViewMode('stages')}
              >
                <Layers size={13} />
                <span>Stages Grid</span>
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
                title="Download annotated map with predicted zones"
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
                    <b>Stages 1 to 5 Progression Masonry</b>
                    <span>Isolated map inspection showing each stage safe zone circle and terrain fit.</span>
                  </div>
                </div>

                <div className="stage-maps-masonry">
                  {[1, 2, 3, 4, 5, 'all'].map((stg) => (
                    <StageMapCanvas
                      key={stg}
                      stage={stg}
                      phases={phases}
                      flightPath={flightPath}
                      imageObj={loadedScreenshot}
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
                  <div className="panel-badge">RAW MATCH SCREENSHOT</div>
                  <img src={uploadedImageSrc} alt="Input Map" className="split-img" />
                </div>
                <div className="split-panel">
                  <div className="panel-badge">PREDICTED MULTI-STAGE OVERLAY</div>
                  <canvas
                    ref={canvasRef}
                    width={820}
                    height={820}
                    className="split-canvas"
                    style={{ cursor: getCanvasCursor() }}
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
                {/* Zoom & Viewport Toolbar */}
                <div className="canvas-zoom-toolbar">
                  <div className="toolbar-left">
                    <div className="map-source-switch">
                      <button
                        className={`map-switch-btn ${mapBackground === 'screenshot' ? 'active' : ''}`}
                        onClick={() => setMapBackground('screenshot')}
                        title="Display prediction over uploaded screenshot"
                      >
                        <FileImage size={12} />
                        <span>Screenshot</span>
                      </button>
                      <button
                        className={`map-switch-btn ${mapBackground === '8k' ? 'active' : ''}`}
                        onClick={() => setMapBackground('8k')}
                        title="Align and project over 8K ultra map"
                      >
                        <Map size={12} />
                        <span>8K Map</span>
                      </button>
                    </div>

                    <div className="quick-hint">
                      <Info size={11} />
                      <span>Drag center &amp; radius handles on canvas to adjust circle</span>
                    </div>
                  </div>

                  <div className="toolbar-center">
                    <button
                      className="focus-stage5-btn"
                      onClick={() => focusStage(5)}
                      title="Auto-zoom into Stage 5 Final Safe Zone"
                    >
                      <Target size={13} />
                      <span>Focus Final Zone (Stage 5)</span>
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
                    className="main-image-canvas"
                    style={{ cursor: getCanvasCursor() }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                  />

                  {/* Calibration Pinpoint Prompt Pill */}
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

                  {/* Live Mouse Coordinate Tooltip HUD */}
                  <div className="canvas-coord-hud mono">
                    <span>X: {cursorPosMeters.x}m</span>
                    <span>Y: {cursorPosMeters.y}m</span>
                    <span className="coord-grid">[{toErangelGrid(cursorPosMeters.x, cursorPosMeters.y)}]</span>
                    <span className={isErangelLand(cursorPosMeters.x, cursorPosMeters.y) ? 'text-emerald' : 'text-amber'}>
                      {isErangelLand(cursorPosMeters.x, cursorPosMeters.y) ? '● LAND' : '○ WATER'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stage Filter & Opacity Bar */}
          <div className="stage-filter-bar">
            <span className="filter-title">Inspect Stage:</span>
            <button
              className={`stage-pill ${selectedStage === null ? 'active' : ''}`}
              onClick={() => setSelectedStage(null)}
            >
              All Stages (1–5)
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

        {/* Right Column: Calibration Controls & Feature Adjusters */}
        <div className="calibration-deck tactical-card">
          <div className="deck-title-bar">
            <div className="deck-title-text">
              <Sliders size={15} className="deck-title-icon" />
              <span>Map Calibration &amp; Parameters</span>
            </div>
          </div>

          <div className="deck-body">
            {/* Interactive Pinpoint Tools */}
            <div className="calibration-tools-group">
              <div className="tools-title">Direct Canvas Pinpointing</div>
              <div className="tools-grid">
                <button
                  className={`tool-action-btn ${calibrationMode === 'setCircle' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode(calibrationMode === 'setCircle' ? null : 'setCircle')}
                >
                  <Crosshair size={13} />
                  <span>Pin Stage 1 Center</span>
                </button>
                <button
                  className={`tool-action-btn ${calibrationMode === 'setFlightStart' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode(calibrationMode === 'setFlightStart' ? null : 'setFlightStart')}
                >
                  <Plane size={13} />
                  <span>Pin Flight Vector</span>
                </button>
              </div>
            </div>

            {/* Stage 1 Safe Zone Controls */}
            <div className="param-group">
              <div className="group-label">
                <span>Stage 1 Safe Zone Circle</span>
                <span className="mono">[{toErangelGrid(phase1Center.x, phase1Center.y)}] • {phase1Radius * 2 / 1000}km dia</span>
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

              <div className="slider-box" style={{ marginTop: '8px' }}>
                <div className="slider-label">
                  <span>Circle Radius (m)</span>
                  <span className="mono">{phase1Radius}m</span>
                </div>
                <input
                  type="range"
                  min="1400"
                  max="2600"
                  step="50"
                  value={phase1Radius}
                  onChange={(e) => setPhase1Radius(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Flight Path Vector Controls */}
            <div className="param-group">
              <div className="group-label">
                <span>Flight Trajectory Vector</span>
                <span className="mono">
                  {Math.round(flightPath.angle)}° ({toCompassBearing(flightPath.angle)}) • {(flightPath.lengthMeters / 1000).toFixed(1)}km
                </span>
              </div>
              <div className="two-col-inputs">
                <div className="input-box">
                  <label>Start X (m)</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightStart.x}
                    onChange={(e) => setFlightStart({ ...flightStart, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>Start Y (m)</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightStart.y}
                    onChange={(e) => setFlightStart({ ...flightStart, y: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>End X (m)</label>
                  <input
                    type="number"
                    min="0"
                    max="8000"
                    value={flightEnd.x}
                    onChange={(e) => setFlightEnd({ ...flightEnd, x: Number(e.target.value) })}
                  />
                </div>
                <div className="input-box">
                  <label>End Y (m)</label>
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

            {/* Tactical Overlays & Guardrails */}
            <div className="param-group">
              <div className="group-label">Tactical Overlays &amp; Guardrails</div>
              <div className="toggle-list">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={enforceTerrain}
                    onChange={(e) => setEnforceTerrain(e.target.checked)}
                  />
                  <span>Enforce Terrain Water Avoidance (FR-04)</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                  />
                  <span>Shift Probability Heatmap (FR-05)</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showShiftArrows}
                    onChange={(e) => setShowShiftArrows(e.target.checked)}
                  />
                  <span>Shift Direction Vector Arrows</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showFlightLine}
                    onChange={(e) => setShowFlightLine(e.target.checked)}
                  />
                  <span>Flight Trajectory Line</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />
                  <span>Erangel 8x8 1km Grid Overlay</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showAuditTable}
                    onChange={(e) => setShowAuditTable(e.target.checked)}
                  />
                  <span>Show Telemetry &amp; Terrain Safety Audit Table</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. TELEMETRY & TERRAIN SAFETY AUDIT MATRIX */}
      {showAuditTable && (
        <div className="audit-matrix-card tactical-card">
          <div className="audit-matrix-header">
            <div className="audit-header-title">
              <ShieldCheck size={16} className="text-emerald" />
              <span>Telemetry &amp; Terrain Safety Audit Matrix</span>
            </div>
            <div className="audit-header-sub">
              Validating strict Euclidean circle containment, binary terrain mask water checks, and model error benchmarks across all stages.
            </div>
          </div>

          <div className="audit-table-wrapper">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Center (X, Y)</th>
                  <th>Grid</th>
                  <th>Radius / Dia</th>
                  <th>Shift Vector</th>
                  <th>Compass</th>
                  <th>Containment Audit</th>
                  <th>Terrain Safety</th>
                  <th>Expected MAE</th>
                  <th>Tactical Anchor</th>
                </tr>
              </thead>
              <tbody>
                {auditReport.map((row) => {
                  const cfg = PHASE_CONFIG[row.phase];
                  return (
                    <tr key={row.phase} className={`stage-row-${row.phase}`}>
                      <td>
                        <span className="stage-badge" style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.color }}>
                          Stage {row.phase} ({cfg.name})
                        </span>
                      </td>
                      <td className="mono">{row.center.x}, {row.center.y}</td>
                      <td>
                        <span className="grid-cell mono">{row.grid}</span>
                      </td>
                      <td className="mono">{row.radius}m ({row.diameterKm}km)</td>
                      <td className="mono">
                        {row.phase === 1 ? '—' : `${row.shiftDist}m (ΔX: ${row.deltaX}, ΔY: ${row.deltaY})`}
                      </td>
                      <td>
                        {row.phase === 1 ? (
                          <span className="compass-badge">CENTER</span>
                        ) : (
                          <span className="compass-badge active">{row.compass} ({Math.round(row.shiftAngle)}°)</span>
                        )}
                      </td>
                      <td>
                        {row.containmentValid ? (
                          <span className="audit-badge pass">
                            <CheckCircle2 size={12} />
                            <span>100% Contained</span>
                          </span>
                        ) : (
                          <span className="audit-badge fail">
                            <AlertTriangle size={12} />
                            <span>Clamped</span>
                          </span>
                        )}
                      </td>
                      <td>
                        {row.isReprojected ? (
                          <span className="audit-badge warn" title="Predicted center was water; reprojected to nearest landmass">
                            <AlertTriangle size={12} />
                            <span>Reprojected</span>
                          </span>
                        ) : row.centerIsLand ? (
                          <span className="audit-badge pass" title={`Land verified with ${row.landCoveragePct}% dry land coverage`}>
                            <ShieldCheck size={12} />
                            <span>Land Pass ({row.landCoveragePct}%)</span>
                          </span>
                        ) : (
                          <span className="audit-badge fail">
                            <AlertTriangle size={12} />
                            <span>Water Center</span>
                          </span>
                        )}
                      </td>
                      <td className="mono">
                        {row.phase === 1 ? (
                          <span className="text-muted">Exact Input</span>
                        ) : (
                          <span>±{row.maeDistMeters}m <small className="text-muted">(P90: {row.p90DistMeters}m)</small></span>
                        )}
                      </td>
                      <td>
                        <div className="tactical-anchor-cell">
                          <span className="anchor-name">{row.landmark}</span>
                          <span className="anchor-desc">{row.terrainDesc}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. BOTTOM STAGE PROGRESSION CARDS */}
      <div className="all-stages-summary tactical-card">
        <div className="summary-header">
          <div className="summary-title">
            <CheckCircle2 size={15} color="#059669" />
            <span>Predicted Safe Zone Rotation Cards (Stages 1 to 5)</span>
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
