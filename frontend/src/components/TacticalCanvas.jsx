import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Move, 
  MapPin, 
  Layers, 
  Compass,
  Eye,
  EyeOff,
  Target
} from 'lucide-react';
import { 
  MAP_EXTENT_METERS, 
  PHASE_CONFIG, 
  toErangelGrid, 
  isErangelLand 
} from '../utils/engine';

export default function TacticalCanvas({
  phases,
  flightPath,
  activePhase,
  showHeatmap,
  showGrid,
  showFlightCorridor,
  showShiftVectors,
  onUpdatePhase1Center,
  onUpdateFlightPath,
  canvasRef
}) {
  const containerRef = useRef(null);
  const internalCanvasRef = useRef(null);
  const mapImageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Pan & Zoom viewport state
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Interactive handle dragging (e.g. dragging P1 center or flight start/end)
  const [activeHandle, setActiveHandle] = useState(null); // 'p1' | 'flightStart' | 'flightEnd' | null
  const [hoverCoord, setHoverCoord] = useState(null);
  const [interactionMode, setInteractionMode] = useState('navigate'); // 'navigate' | 'placeP1'

  // Preload Erangel 8K map and fast preview
  useEffect(() => {
    // 1. Fast preview map (6.7MB)
    const fastImg = new Image();
    fastImg.src = '/erangel_map.png';
    fastImg.onload = () => {
      mapImageRef.current = fastImg;
      setImageLoaded(true);
    };

    // 2. Full Ultra 8K map (8192x8192)
    const img8k = new Image();
    img8k.src = '/erangel_map_8k.png';
    img8k.onload = () => {
      mapImageRef.current = img8k;
      setImageLoaded(true);
    };
  }, []);

  // Sync external ref if passed
  useEffect(() => {
    if (canvasRef) {
      canvasRef.current = internalCanvasRef.current;
    }
  }, [canvasRef]);

  // Transform helpers: meters (0-8000) <-> Canvas pixels
  const getCanvasSize = () => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return { width: 800, height: 800 };
    return { width: canvas.width, height: canvas.height };
  };

  const metersToCanvas = useCallback((mx, my) => {
    const { width, height } = getCanvasSize();
    const baseSize = Math.min(width, height);
    const padding = 36; // border axis margin
    const drawSize = baseSize - padding * 2;

    const px = padding + (mx / MAP_EXTENT_METERS) * drawSize;
    const py = padding + (my / MAP_EXTENT_METERS) * drawSize;

    // Apply viewport zoom & pan
    const cx = width / 2;
    const cy = height / 2;
    const transformedX = (px - cx) * transform.scale + cx + transform.offsetX;
    const transformedY = (py - cy) * transform.scale + cy + transform.offsetY;

    return { x: transformedX, y: transformedY, radiusScale: (drawSize / MAP_EXTENT_METERS) * transform.scale };
  }, [transform]);

  const canvasToMeters = useCallback((cx, cy) => {
    const { width, height } = getCanvasSize();
    const baseSize = Math.min(width, height);
    const padding = 36;
    const drawSize = baseSize - padding * 2;

    const midX = width / 2;
    const midY = height / 2;
    const unscaledX = (cx - transform.offsetX - midX) / transform.scale + midX;
    const unscaledY = (cy - transform.offsetY - midY) / transform.scale + midY;

    const mx = Math.max(0, Math.min(MAP_EXTENT_METERS, ((unscaledX - padding) / drawSize) * MAP_EXTENT_METERS));
    const my = Math.max(0, Math.min(MAP_EXTENT_METERS, ((unscaledY - padding) / drawSize) * MAP_EXTENT_METERS));

    return { x: mx, y: my };
  }, [transform]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const baseSize = Math.min(width, height);
    const padding = 36;
    const drawSize = baseSize - padding * 2;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    ctx.save();

    // Setup viewport transform
    const midX = width / 2;
    const midY = height / 2;
    ctx.translate(midX + transform.offsetX, midY + transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-midX, -midY);

    // 1. Draw Map Base (Image or Tactical Topo Fallback)
    const mapX = padding;
    const mapY = padding;

    if (imageLoaded && mapImageRef.current) {
      ctx.drawImage(mapImageRef.current, mapX, mapY, drawSize, drawSize);
    } else {
      // Clean Tactical Topography background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(mapX, mapY, drawSize, drawSize);

      // Water body hints
      ctx.fillStyle = '#0f172a';
      // Southern Ocean
      ctx.fillRect(mapX, mapY + drawSize * 0.78, drawSize, drawSize * 0.22);
      // River channel
      ctx.fillRect(mapX + drawSize * 0.3, mapY + drawSize * 0.65, drawSize * 0.45, drawSize * 0.05);

      // Mainland terrain block
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(mapX + drawSize * 0.12, mapY + drawSize * 0.12, drawSize * 0.76, drawSize * 0.52, 24);
      ctx.fill();

      // Sosnovka island block
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(mapX + drawSize * 0.28, mapY + drawSize * 0.72, drawSize * 0.44, drawSize * 0.2, 16);
      ctx.fill();
    }

    // Map border
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mapX, mapY, drawSize, drawSize);

    // 2. Draw Military Grid (A1 - H8)
    if (showGrid) {
      const numCells = 8;
      const cellSize = drawSize / numCells;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (let i = 1; i < numCells; i++) {
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(mapX + i * cellSize, mapY);
        ctx.lineTo(mapX + i * cellSize, mapY + drawSize);
        ctx.stroke();

        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(mapX, mapY + i * cellSize);
        ctx.lineTo(mapX + drawSize, mapY + i * cellSize);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 3. Draw 2D Gaussian Probability Heatmap
    if (showHeatmap && phases[1]) {
      const p1 = phases[1];
      const p1Canvas = metersToCanvas(p1.x, p1.y);
      const p1Radius = p1.r * p1Canvas.radiusScale;

      // Draw soft probability density blobs around predicted shift centroids
      const targetPhase = phases[2] || phases[1];
      const targetCanvas = metersToCanvas(targetPhase.x, targetPhase.y);

      const grad = ctx.createRadialGradient(
        targetCanvas.x, targetCanvas.y, 10,
        p1Canvas.x, p1Canvas.y, p1Radius * 0.95
      );
      grad.addColorStop(0, 'rgba(220, 38, 38, 0.42)');   // High probability core (Crimson)
      grad.addColorStop(0.35, 'rgba(217, 119, 6, 0.28)'); // Medium probability (Amber)
      grad.addColorStop(0.75, 'rgba(37, 99, 235, 0.14)'); // Low probability (Cobalt)
      grad.addColorStop(1, 'rgba(37, 99, 235, 0)');

      ctx.save();
      // Clip to Phase 1 circle boundary
      ctx.beginPath();
      ctx.arc(p1Canvas.x, p1Canvas.y, p1Radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = grad;
      ctx.fillRect(mapX, mapY, drawSize, drawSize);
      ctx.restore();
    }

    // 4. Draw Flight Path Vector & Drop Corridor
    if (flightPath && flightPath.start && flightPath.end) {
      const f1 = metersToCanvas(flightPath.start.x, flightPath.start.y);
      const f2 = metersToCanvas(flightPath.end.x, flightPath.end.y);

      // Drop corridor buffer (1000m reach)
      if (showFlightCorridor) {
        const angle = Math.atan2(f2.y - f1.y, f2.x - f1.x);
        const perpX = Math.cos(angle + Math.PI / 2);
        const perpY = Math.sin(angle + Math.PI / 2);
        const bufferPx = (1000 / MAP_EXTENT_METERS) * drawSize * transform.scale;

        ctx.strokeStyle = 'rgba(217, 119, 6, 0.18)';
        ctx.fillStyle = 'rgba(217, 119, 6, 0.05)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);

        ctx.beginPath();
        ctx.moveTo(f1.x + perpX * bufferPx, f1.y + perpY * bufferPx);
        ctx.lineTo(f2.x + perpX * bufferPx, f2.y + perpY * bufferPx);
        ctx.lineTo(f2.x - perpX * bufferPx, f2.y - perpY * bufferPx);
        ctx.lineTo(f1.x - perpX * bufferPx, f1.y - perpY * bufferPx);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Flight Path Line
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(f1.x, f1.y);
      ctx.lineTo(f2.x, f2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Airplane vector arrow
      const headlen = 16;
      const angle = Math.atan2(f2.y - f1.y, f2.x - f1.x);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(f2.x, f2.y);
      ctx.lineTo(f2.x - headlen * Math.cos(angle - Math.PI / 7), f2.y - headlen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(f2.x - (headlen * 0.6) * Math.cos(angle), f2.y - (headlen * 0.6) * Math.sin(angle));
      ctx.lineTo(f2.x - headlen * Math.cos(angle + Math.PI / 7), f2.y - headlen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();

      // Start & End handle markers
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;

      // Start Handle
      ctx.beginPath();
      ctx.arc(f1.x, f1.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Start Label
      ctx.font = '600 11px JetBrains Mono, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText('✈ DROP ORIGIN', f1.x + 10, f1.y - 10);
      ctx.shadowBlur = 0;
    }

    // 5. Draw Phase Concentric Circles (1 through 5)
    const phaseList = Object.values(phases).sort((a, b) => a.phase - b.phase);

    // First draw fill backgrounds
    phaseList.forEach((p) => {
      const isTarget = activePhase ? p.phase === activePhase : true;
      const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb' };
      const c = metersToCanvas(p.x, p.y);
      const r = p.r * c.radiusScale;

      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? (cfg.bg || 'rgba(37, 99, 235, 0.08)') : 'rgba(15, 23, 42, 0.02)';
      ctx.fill();
    });

    // Draw Shift Vectors (Center-to-Center displacement arrows)
    if (showShiftVectors && phaseList.length > 1) {
      for (let i = 0; i < phaseList.length - 1; i++) {
        const pCurrent = phaseList[i];
        const pNext = phaseList[i + 1];
        const c1 = metersToCanvas(pCurrent.x, pCurrent.y);
        const c2 = metersToCanvas(pNext.x, pNext.y);

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow head at destination
        const arrowAngle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
        const hSize = 8;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(c2.x, c2.y);
        ctx.lineTo(c2.x - hSize * Math.cos(arrowAngle - Math.PI / 6), c2.y - hSize * Math.sin(arrowAngle - Math.PI / 6));
        ctx.lineTo(c2.x - hSize * Math.cos(arrowAngle + Math.PI / 6), c2.y - hSize * Math.sin(arrowAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw Circle Outlines and Center Crosshairs
    phaseList.forEach((p) => {
      const isFocused = activePhase === null || activePhase === p.phase;
      const cfg = PHASE_CONFIG[p.phase] || { color: '#2563eb' };
      const c = metersToCanvas(p.x, p.y);
      const r = p.r * c.radiusScale;

      // Circle stroke
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = isFocused ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Center crosshair
      const chSize = 7;
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - chSize, c.y);
      ctx.lineTo(c.x + chSize, c.y);
      ctx.moveTo(c.x, c.y - chSize);
      ctx.lineTo(c.x, c.y + chSize);
      ctx.stroke();

      // Labeled Stage Badge
      const badgeText = `Stage ${p.phase} • ${p.r}m`;
      ctx.font = '700 11px JetBrains Mono, monospace';
      const textWidth = ctx.measureText(badgeText).width;

      const badgeX = c.x + 8;
      const badgeY = c.y - r - 6;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(badgeX - 4, badgeY - 14, textWidth + 8, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, badgeX, badgeY);
    });

    // Phase 1 Draggable Handle Indicator
    if (phases[1]) {
      const p1Canvas = metersToCanvas(phases[1].x, phases[1].y);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p1Canvas.x, p1Canvas.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    // 6. Draw Fixed Alphanumeric Axis Rulers (Outside transform)
    const numCells = 8;
    const cellSize = drawSize / numCells;
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.fillStyle = 'var(--text-muted)' || '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top horizontal axis: A through H
    for (let i = 0; i < numCells; i++) {
      const letter = String.fromCharCode(65 + i);
      const colX = padding + (i + 0.5) * cellSize;
      ctx.fillText(letter, colX, padding / 2);
    }

    // Left vertical axis: 1 through 8
    for (let j = 0; j < numCells; j++) {
      const rowNum = j + 1;
      const rowY = padding + (j + 0.5) * cellSize;
      ctx.fillText(rowNum.toString(), padding / 2, rowY);
    }
  }, [
    imageLoaded,
    transform,
    phases,
    flightPath,
    activePhase,
    showHeatmap,
    showGrid,
    showFlightCorridor,
    showShiftVectors,
    metersToCanvas
  ]);

  // Mouse Interaction Handlers: Pan, Zoom, Drag Handles
  const handleMouseDown = (e) => {
    const rect = internalCanvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const metersPos = canvasToMeters(clickX, clickY);

    // Check if clicked near P1 center (handle radius ~ 25px)
    if (phases[1]) {
      const p1C = metersToCanvas(phases[1].x, phases[1].y);
      if (Math.hypot(clickX - p1C.x, clickY - p1C.y) < 22) {
        setActiveHandle('p1');
        return;
      }
    }

    // Check if clicked near Flight Start handle
    if (flightPath && flightPath.start) {
      const f1C = metersToCanvas(flightPath.start.x, flightPath.start.y);
      if (Math.hypot(clickX - f1C.x, clickY - f1C.y) < 22) {
        setActiveHandle('flightStart');
        return;
      }
    }

    // Check if clicked near Flight End handle
    if (flightPath && flightPath.end) {
      const f2C = metersToCanvas(flightPath.end.x, flightPath.end.y);
      if (Math.hypot(clickX - f2C.x, clickY - f2C.y) < 22) {
        setActiveHandle('flightEnd');
        return;
      }
    }

    if (interactionMode === 'placeP1') {
      onUpdatePhase1Center(Math.round(metersPos.x), Math.round(metersPos.y));
      setInteractionMode('navigate');
      return;
    }

    // Default: Pan dragging
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
  };

  const handleMouseMove = (e) => {
    const rect = internalCanvasRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const mPos = canvasToMeters(currentX, currentY);
    const gridRef = toErangelGrid(mPos.x, mPos.y);
    const isLand = isErangelLand(mPos.x, mPos.y);

    setHoverCoord({
      x: Math.round(mPos.x),
      y: Math.round(mPos.y),
      grid: gridRef,
      isLand
    });

    if (activeHandle === 'p1') {
      onUpdatePhase1Center(Math.round(mPos.x), Math.round(mPos.y));
    } else if (activeHandle === 'flightStart') {
      onUpdateFlightPath({
        start: { x: Math.round(mPos.x), y: Math.round(mPos.y) },
        end: flightPath.end
      });
    } else if (activeHandle === 'flightEnd') {
      onUpdateFlightPath({
        start: flightPath.start,
        end: { x: Math.round(mPos.x), y: Math.round(mPos.y) }
      });
    } else if (isDragging) {
      setTransform((prev) => ({
        ...prev,
        offsetX: e.clientX - dragStart.x,
        offsetY: e.clientY - dragStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setActiveHandle(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const canvas = internalCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    setTransform((prev) => {
      const newScale = Math.min(18.0, Math.max(0.7, prev.scale * zoomFactor));
      const scaleRatio = newScale / prev.scale;
      const newOffsetX = mouseX - (mouseX - prev.offsetX) * scaleRatio;
      const newOffsetY = mouseY - (mouseY - prev.offsetY) * scaleRatio;
      return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
    });
  };

  const focusStage = (stageNum = 5) => {
    const target = phases[stageNum];
    const canvas = internalCanvasRef.current;
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

  return (
    <div className="canvas-wrapper" ref={containerRef}>
      {/* Canvas Top Status Bar */}
      <div className="canvas-top-bar">
        <div className="canvas-badge-group">
          <span className="badge badge-neutral mono">
            GRID: {hoverCoord ? hoverCoord.grid : '--'}
          </span>
          <span className="badge badge-neutral mono">
            X: {hoverCoord ? `${hoverCoord.x}m` : '--'} | Y: {hoverCoord ? `${hoverCoord.y}m` : '--'}
          </span>
          <span className={`badge ${hoverCoord && !hoverCoord.isLand ? 'badge-warning' : 'badge-success'}`}>
            {hoverCoord && !hoverCoord.isLand ? 'WATER' : 'LAND'}
          </span>
          <span className="badge badge-neutral mono" style={{ color: '#d97706' }}>
            8K MAP
          </span>
        </div>

        <div className="canvas-controls-group">
          <button
            className="tool-btn"
            style={{ background: '#7c3aed', color: '#ffffff', borderColor: '#7c3aed' }}
            title="Zoom directly into Stage 5 Final Circle"
            onClick={() => focusStage(5)}
          >
            <Target size={13} />
            <span>Focus Stage 5</span>
          </button>

          <button
            className={`tool-btn ${interactionMode === 'placeP1' ? 'active' : ''}`}
            title="Click anywhere to reposition Stage 1 Center"
            onClick={() => setInteractionMode(interactionMode === 'placeP1' ? 'navigate' : 'placeP1')}
          >
            <MapPin size={13} />
            <span>Place Stage 1</span>
          </button>

          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '0 4px' }}>
            {Math.round(transform.scale * 100)}%
          </span>

          <button
            className="tool-btn"
            title="Zoom In"
            onClick={() => setTransform((p) => ({ ...p, scale: Math.min(18, p.scale * 1.25) }))}
          >
            <ZoomIn size={14} />
          </button>

          <button
            className="tool-btn"
            title="Zoom Out"
            onClick={() => setTransform((p) => ({ ...p, scale: Math.max(0.7, p.scale / 1.25) }))}
          >
            <ZoomOut size={14} />
          </button>

          <button
            className="tool-btn"
            title="Reset Pan & Zoom"
            onClick={resetView}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Main HTML5 Canvas */}
      <div className="canvas-viewport">
        <canvas
          ref={internalCanvasRef}
          width={860}
          height={860}
          className={`tactical-canvas ${activeHandle ? 'cursor-grabbing' : interactionMode === 'placeP1' ? 'cursor-crosshair' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>

      {/* Canvas Bottom Legend */}
      <div className="canvas-bottom-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#d97706' }} />
          <span>Flight Path</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#2563eb' }} />
          <span>Stage 1 (2000m)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#059669' }} />
          <span>Stage 2 (1100m)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#d97706' }} />
          <span>Stage 3 (700m)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#dc2626' }} />
          <span>Stage 4 (400m)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#7c3aed' }} />
          <span>Stage 5 (200m)</span>
        </div>
      </div>

      <style>{`
        .canvas-wrapper {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-sm);
        }

        .canvas-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          background: var(--bg-surface-subtle);
          border-bottom: 1px solid var(--border-subtle);
          gap: 12px;
          flex-wrap: wrap;
        }

        .canvas-badge-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .canvas-controls-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tool-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 9px;
          background: var(--bg-surface);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 600;
        }

        .tool-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .tool-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        .canvas-viewport {
          position: relative;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #0f172a;
          overflow: hidden;
        }

        .tactical-canvas {
          display: block;
          max-width: 100%;
          height: auto;
          user-select: none;
        }

        .cursor-grab {
          cursor: grab;
        }

        .cursor-grabbing {
          cursor: grabbing;
        }

        .cursor-crosshair {
          cursor: crosshair;
        }

        .canvas-bottom-legend {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 8px 16px;
          background: var(--bg-surface-subtle);
          border-top: 1px solid var(--border-subtle);
          flex-wrap: wrap;
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .legend-color {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
