/**
 * Image Calibration & Computer Vision Utilities for BGMI / PUBG Esports Match Screenshots
 * 
 * Provides:
 * 1. Pixel <-> 8000m game grid coordinate mappings
 * 2. Automated Safe Zone White Circle & Flight Path Vector detection via Canvas pixel analysis
 * 3. Telemetry & Terrain Safety Audit (Euclidean containment, water avoidance, XGBoost error bounds)
 */

import { isErangelLand, MAP_EXTENT_METERS, toErangelGrid, toCompassBearing, getErangelLandmark } from './engine';

// Historical XGBoost Model Evaluation Benchmarks (from 5-Fold Grouped Tournament Validation)
export const PHASE_ERROR_MARGINS = {
  1: { maeDist: 0, maeAngle: 0, p90Dist: 0, status: 'GROUND TRUTH' },
  2: { maeDist: 197, maeAngle: 68.1, p90Dist: 833, status: 'HIGH VARIANCE SHIFT' },
  3: { maeDist: 88, maeAngle: 88.6, p90Dist: 530, status: 'CONVERGING MID-GAME' },
  4: { maeDist: 68, maeAngle: 78.5, p90Dist: 379, status: 'TIGHT COMPOUND' },
  5: { maeDist: 38, maeAngle: 78.9, p90Dist: 194, status: 'FINAL ENDGAME PIN' }
};

/**
 * Transforms screen client coordinates to 8000m map grid coordinates taking pan/zoom into account
 */
export function screenToMeters(clientX, clientY, canvas, transform) {
  if (!canvas) return { x: 4000, y: 4000 };
  const rect = canvas.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const clickY = clientY - rect.top;

  const midX = canvas.width / 2;
  const midY = canvas.height / 2;
  const unscaledX = (clickX - transform.offsetX - midX) / transform.scale + midX;
  const unscaledY = (clickY - transform.offsetY - midY) / transform.scale + midY;

  const meterX = Math.round(Math.max(0, Math.min(MAP_EXTENT_METERS, (unscaledX / canvas.width) * MAP_EXTENT_METERS)));
  const meterY = Math.round(Math.max(0, Math.min(MAP_EXTENT_METERS, (unscaledY / canvas.height) * MAP_EXTENT_METERS)));

  return { x: meterX, y: meterY };
}

/**
 * Transforms 8000m map coordinates to canvas pixel space
 */
export function metersToCanvas(meterX, meterY, canvasWidth, canvasHeight) {
  return {
    x: (meterX / MAP_EXTENT_METERS) * canvasWidth,
    y: (meterY / MAP_EXTENT_METERS) * canvasHeight
  };
}

/**
 * Converts meters to pixel distance
 */
export function metersToPixels(meters, canvasWidth) {
  return (meters / MAP_EXTENT_METERS) * canvasWidth;
}

/**
 * Automated Computer Vision Scanner for BGMI/PUBG Map Screenshots:
 * Analyzes image pixel data using offscreen canvas to detect:
 * 1. Safe Zone White Circle (high luminance, low saturation circular arc)
 * 2. Flight Trajectory Vector (yellow/orange trajectory line or dotted line)
 * 
 * @param {HTMLImageElement} img - Uploaded map image
 * @returns {Object} Detected coordinates or fallback estimates with confidence metrics
 */
export function autoDetectSafeZoneAndFlight(img) {
  if (!img || !img.width || !img.height) {
    return {
      success: false,
      circle: { x: 4100, y: 3900, r: 2000, confidence: 0 },
      flight: { start: { x: 1500, y: 1800 }, end: { x: 6600, y: 6200 }, confidence: 0 },
      notes: 'Image not loaded'
    };
  }

  try {
    // 1. Create downsampled offscreen canvas for fast analysis (512 x 512)
    const procSize = 512;
    const offscreen = document.createElement('canvas');
    offscreen.width = procSize;
    offscreen.height = procSize;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2D context');

    ctx.drawImage(img, 0, 0, procSize, procSize);
    const imgData = ctx.getImageData(0, 0, procSize, procSize);
    const data = imgData.data;

    // 2. Identify candidate white circle pixels
    // Safe zone border in PUBG/BGMI is bright pure white (R,G,B > 215, low saturation |R-G| < 20, |G-B| < 20)
    const whitePoints = [];
    // Flight trajectory in PUBG/BGMI is bright yellow/orange (R > 185, G > 135, B < 100)
    const flightPoints = [];

    for (let y = 10; y < procSize - 10; y += 2) {
      for (let x = 10; x < procSize - 10; x += 2) {
        const idx = (y * procSize + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // White circle detection
        if (r > 215 && g > 215 && b > 215 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22) {
          whitePoints.push({ x, y });
        }

        // Flight line detection (amber / yellow / orange trajectory)
        if (r > 185 && g > 135 && b < 100 && (r - b) > 85) {
          flightPoints.push({ x, y });
        }
      }
    }

    // 3. Circle Fitting via RANSAC on white points
    let bestCircle = null;
    let maxInliers = 0;

    if (whitePoints.length >= 25) {
      const minRadiusPx = procSize * 0.15; // 1200m min
      const maxRadiusPx = procSize * 0.35; // 2800m max
      const iterations = Math.min(120, Math.floor(whitePoints.length / 2));

      for (let iter = 0; iter < iterations; iter++) {
        // Sample 3 random points
        const p1 = whitePoints[Math.floor(Math.random() * whitePoints.length)];
        const p2 = whitePoints[Math.floor(Math.random() * whitePoints.length)];
        const p3 = whitePoints[Math.floor(Math.random() * whitePoints.length)];

        // Compute circumcircle
        const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
        if (Math.abs(d) < 1e-4) continue;

        const ux = ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) + (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) + (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) / d;
        const uy = ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) + (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) + (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) / d;
        const r = Math.hypot(p1.x - ux, p1.y - uy);

        // Discard non-Phase 1 sized circles or centers outside map bounds
        if (r < minRadiusPx || r > maxRadiusPx || ux < procSize * 0.15 || ux > procSize * 0.85 || uy < procSize * 0.15 || uy > procSize * 0.85) {
          continue;
        }

        // Count inliers within tolerance (4.5px band)
        let inliers = 0;
        const sampleStep = Math.max(1, Math.floor(whitePoints.length / 100));
        for (let i = 0; i < whitePoints.length; i += sampleStep) {
          const pt = whitePoints[i];
          const dist = Math.abs(Math.hypot(pt.x - ux, pt.y - uy) - r);
          if (dist < 4.5) {
            inliers++;
          }
        }

        if (inliers > maxInliers) {
          maxInliers = inliers;
          bestCircle = { cx: ux, cy: uy, r };
        }
      }
    }

    // 4. Flight Vector Fitting via Linear Regression on Flight points
    let detectedFlight = null;
    if (flightPoints.length >= 15) {
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      const n = flightPoints.length;
      for (let i = 0; i < n; i++) {
        sumX += flightPoints[i].x;
        sumY += flightPoints[i].y;
        sumXY += flightPoints[i].x * flightPoints[i].y;
        sumX2 += flightPoints[i].x * flightPoints[i].x;
      }

      const meanX = sumX / n;
      const meanY = sumY / n;
      const slope = (n * sumXY - sumX * sumY) / Math.max(1e-4, n * sumX2 - sumX * sumX);
      const intercept = meanY - slope * meanX;

      // Find min and max X along flight trajectory
      let minX = procSize, maxX = 0;
      flightPoints.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      });

      // Extend towards map borders
      const startPxX = Math.max(20, minX - 40);
      const startPxY = Math.max(20, Math.min(procSize - 20, slope * startPxX + intercept));
      const endPxX = Math.min(procSize - 20, maxX + 40);
      const endPxY = Math.max(20, Math.min(procSize - 20, slope * endPxX + intercept));

      detectedFlight = {
        start: {
          x: Math.round((startPxX / procSize) * MAP_EXTENT_METERS),
          y: Math.round((startPxY / procSize) * MAP_EXTENT_METERS)
        },
        end: {
          x: Math.round((endPxX / procSize) * MAP_EXTENT_METERS),
          y: Math.round((endPxY / procSize) * MAP_EXTENT_METERS)
        },
        confidence: Math.min(95, Math.round(50 + (flightPoints.length / 50) * 35))
      };
    }

    // 5. Build final result mapping from procSize (512) back to 8000m game grid
    let finalCircle = { x: 4100, y: 3900, r: 2000, confidence: 50 };
    if (bestCircle && maxInliers >= 15) {
      const meterX = Math.round((bestCircle.cx / procSize) * MAP_EXTENT_METERS);
      const meterY = Math.round((bestCircle.cy / procSize) * MAP_EXTENT_METERS);
      const meterR = Math.round((bestCircle.r / procSize) * MAP_EXTENT_METERS);
      const conf = Math.min(98, Math.round(60 + (maxInliers / 80) * 38));
      finalCircle = { x: meterX, y: meterY, r: meterR, confidence: conf };
    }

    const flightResult = detectedFlight || {
      start: { x: 1500, y: 1800 },
      end: { x: 6600, y: 6200 },
      confidence: 45
    };

    return {
      success: true,
      circle: finalCircle,
      flight: flightResult,
      whitePixelCount: whitePoints.length,
      flightPixelCount: flightPoints.length,
      notes: `Detected ${whitePoints.length} zone edge candidates & ${flightPoints.length} flight pixels.`
    };
  } catch (err) {
    console.warn('[ImageCalibration] CV Auto-detect error:', err);
    return {
      success: false,
      circle: { x: 4100, y: 3900, r: 2000, confidence: 0 },
      flight: { start: { x: 1500, y: 1800 }, end: { x: 6600, y: 6200 }, confidence: 0 },
      notes: err.message
    };
  }
}

/**
 * Audits all predicted sequential phases for:
 * 1. Strict Euclidean containment (C_{n+1} inside C_n)
 * 2. Terrain Land / Water avoidance via Erangel terrain mask
 * 3. Land coverage percentage across circle area
 * 4. Model error bounds from XGBoost benchmarks
 * 
 * @param {Object} phases - Dictionary of phases 1 to 5
 * @returns {Array} List of detailed audit records for each phase
 */
export function auditPhasesSafety(phases) {
  if (!phases) return [];
  const list = Object.values(phases).sort((a, b) => a.phase - b.phase);

  return list.map((p, idx) => {
    const pNum = p.phase;
    const centerIsLand = isErangelLand(p.x, p.y);

    // Sample 16 radial points to estimate land coverage within safe circle
    let landSamples = 0;
    const totalSamples = 16;
    for (let i = 0; i < totalSamples; i++) {
      const angle = (i * 2 * Math.PI) / totalSamples;
      const sampleDist = p.r * 0.75;
      const sx = p.x + sampleDist * Math.cos(angle);
      const sy = p.y + sampleDist * Math.sin(angle);
      if (isErangelLand(sx, sy)) {
        landSamples++;
      }
    }
    const landRatio = Math.round((landSamples / totalSamples) * 100);

    // Euclidean Containment check relative to parent circle
    let containmentValid = true;
    let containmentMargin = 0;
    if (idx > 0) {
      const parent = list[idx - 1];
      const dist = Math.hypot(p.x - parent.x, p.y - parent.y);
      const maxAllowed = parent.r - p.r;
      containmentValid = dist <= maxAllowed + 5; // 5m epsilon tolerance
      containmentMargin = Math.round(maxAllowed - dist);
    }

    const landmarkInfo = getErangelLandmark(p.x, p.y);
    const benchmarks = PHASE_ERROR_MARGINS[pNum] || { maeDist: 50, maeAngle: 80, p90Dist: 250 };

    return {
      phase: pNum,
      grid: toErangelGrid(p.x, p.y),
      center: { x: p.x, y: p.y },
      radius: p.r,
      diameterKm: ((p.r * 2) / 1000).toFixed(2),
      areaKm2: ((Math.PI * Math.pow(p.r, 2)) / 1e6).toFixed(2),
      shiftDist: p.shiftDist || 0,
      shiftAngle: p.shiftAngle || 0,
      compass: p.compass || 'CENTER',
      deltaX: p.deltaX || 0,
      deltaY: p.deltaY || 0,
      centerIsLand,
      landCoveragePct: landRatio,
      terrainStatus: centerIsLand ? (landRatio > 70 ? 'OPTIMAL LAND' : 'COASTAL / PARTIAL WATER') : 'WATER REPROJECTED',
      isReprojected: !!p.isReprojected,
      containmentValid,
      containmentMargin,
      landmark: landmarkInfo.name,
      terrainDesc: landmarkInfo.terrain,
      maeDistMeters: benchmarks.maeDist,
      p90DistMeters: benchmarks.p90Dist,
      expectedConfidence: Math.max(70, Math.round(98 - (benchmarks.maeDist / 12)))
    };
  });
}
