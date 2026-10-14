/**
 * RunForZone - Competitive Safe Zone Prediction & Tactical Engine
 * Calibrated for PUBG & BGMI competitive tournament circle mechanics:
 *   - Strict Euclidean circle containment (C_{n+1} ⊆ C_n)
 *   - Real Erangel landmass topology & water avoidance
 *   - Orthogonal flight corridor repulsion & land gradient pull
 *   - Realistic rotation shifts (Phases 1-5)
 */

import { TERRAIN_MASK_B64, MASK_GRID_SIZE } from './terrain_mask_b64.js';

export const MAP_EXTENT_METERS = 8000; // 8km x 8km Erangel
export const MAP_CENTER_METERS = 4000;

// Official BGMI / PUBG Competitive Phase Radii (Meters)
export const DEFAULT_PHASE_RADII_METERS = {
  1: 2000, // Phase 1: 2000m radius (4.0km diameter)
  2: 1100, // Phase 2: 1100m radius (2.2km diameter)
  3: 650,  // Phase 3: 650m radius (1.3km diameter)
  4: 350,  // Phase 4: 350m radius (700m diameter)
  5: 180   // Phase 5: 180m radius (360m final circle)
};

export const PHASE_CONFIG = {
  1: { name: 'Drop Zone', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)', border: '#2563eb', label: 'Phase 1' },
  2: { name: 'Primary Shift', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', border: '#059669', label: 'Phase 2' },
  3: { name: 'Mid Zone', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)', border: '#d97706', label: 'Phase 3' },
  4: { name: 'Late Zone', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.1)', border: '#dc2626', label: 'Phase 4' },
  5: { name: 'Final Circle', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)', border: '#7c3aed', label: 'Phase 5' }
};

// Unpack base64 binary terrain mask into memory
let terrainMaskGrid = null;
function getTerrainMask() {
  if (terrainMaskGrid) return terrainMaskGrid;
  try {
    const binaryStr = atob(TERRAIN_MASK_B64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const totalPixels = MASK_GRID_SIZE * MASK_GRID_SIZE;
    const grid = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = 7 - (i % 8);
      grid[i] = (bytes[byteIdx] >> bitIdx) & 1;
    }
    terrainMaskGrid = grid;
    return terrainMaskGrid;
  } catch (err) {
    console.warn('[Engine] Terrain mask load error:', err);
    return null;
  }
}

/**
 * Checks if coordinate falls on land vs deep ocean/canal water
 */
export function isErangelLand(mx, my) {
  if (mx < 500 || mx > 7500 || my < 500 || my > 7500) return false;
  const mask = getTerrainMask();
  if (!mask) return true;

  const gx = Math.min(MASK_GRID_SIZE - 1, Math.max(0, Math.floor((mx / MAP_EXTENT_METERS) * MASK_GRID_SIZE)));
  const gy = Math.min(MASK_GRID_SIZE - 1, Math.max(0, Math.floor((my / MAP_EXTENT_METERS) * MASK_GRID_SIZE)));
  return mask[gy * MASK_GRID_SIZE + gx] === 1;
}

/**
 * Re-projects invalid water coordinates to nearest walkable land
 */
export function reprojectToNearestLand(mx, my) {
  if (isErangelLand(mx, my)) {
    return { x: mx, y: my, reprojected: false };
  }

  const mask = getTerrainMask();
  if (!mask) return { x: mx, y: my, reprojected: false };

  const startGx = Math.floor((mx / MAP_EXTENT_METERS) * MASK_GRID_SIZE);
  const startGy = Math.floor((my / MAP_EXTENT_METERS) * MASK_GRID_SIZE);

  for (let r = 1; r < 25; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const testGx = startGx + dx;
        const testGy = startGy + dy;
        if (testGx >= 0 && testGx < MASK_GRID_SIZE && testGy >= 0 && testGy < MASK_GRID_SIZE) {
          if (mask[testGy * MASK_GRID_SIZE + testGx] === 1) {
            const reprojX = ((testGx + 0.5) / MASK_GRID_SIZE) * MAP_EXTENT_METERS;
            const reprojY = ((testGy + 0.5) / MASK_GRID_SIZE) * MAP_EXTENT_METERS;
            return { x: Math.round(reprojX), y: Math.round(reprojY), reprojected: true };
          }
        }
      }
    }
  }

  return { x: mx * 0.9 + 400, y: my * 0.9 + 400, reprojected: true };
}

/**
 * Computes land presence gradient vector at given center
 * Points towards land and away from water bodies
 */
function getLandGradientVector(cx, cy, probeRadius) {
  let gx = 0;
  let gy = 0;
  let landSamples = 0;
  const numAngles = 16;
  const angleStep = (Math.PI * 2) / numAngles;

  for (let i = 0; i < numAngles; i++) {
    const rad = i * angleStep;
    const testX = cx + probeRadius * Math.cos(rad);
    const testY = cy + probeRadius * Math.sin(rad);
    if (isErangelLand(testX, testY)) {
      gx += Math.cos(rad);
      gy += Math.sin(rad);
      landSamples++;
    }
  }

  const mag = Math.hypot(gx, gy);
  if (mag < 1e-4) {
    return { x: 0, y: 0, landRatio: landSamples / numAngles };
  }
  return { x: gx / mag, y: gy / mag, landRatio: landSamples / numAngles };
}

/**
 * Calculates perpendicular distance and side of point relative to flight vector
 */
export function computePointToFlightDistance(px, py, fx1, fy1, fx2, fy2) {
  const dx = fx2 - fx1;
  const dy = fy2 - fy1;
  const lineLen = Math.hypot(dx, dy);
  if (lineLen < 1e-6) return { dist: Math.hypot(px - fx1, py - fy1), side: 1.0 };

  const perpDist = Math.abs(dy * px - dx * py + fx2 * fy1 - fy2 * fx1) / lineLen;
  const cross = (fx2 - fx1) * (py - fy1) - (fy2 - fy1) * (px - fx1);
  const sideSign = cross >= 0 ? 1.0 : -1.0;
  return { dist: perpDist, side: sideSign };
}

/**
 * Strict Euclidean containment clamping:
 * Ensures C_{n+1} fits 100% inside C_n.
 * Mathematical condition: Distance(Center_{n+1}, Center_n) <= (Radius_n - Radius_{n+1})
 */
export function clampContainment(currX, currY, currR, targetX, targetY, nextR) {
  const dx = targetX - currX;
  const dy = targetY - currY;
  const dist = Math.hypot(dx, dy);
  const maxAllowedDist = Math.max(1, currR - nextR);

  if (dist > maxAllowedDist) {
    const scale = (maxAllowedDist * 0.985) / dist;
    return {
      x: currX + dx * scale,
      y: currY + dy * scale,
      clamped: true
    };
  }

  return { x: targetX, y: targetY, clamped: false };
}

/**
 * Erangel 8x8 1km Grid Coordinate Reference (e.g., E4, D7)
 */
export function toErangelGrid(x, y) {
  const colIndex = Math.min(7, Math.max(0, Math.floor(x / 1000)));
  const rowIndex = Math.min(7, Math.max(0, Math.floor(y / 1000)));
  const colLetter = String.fromCharCode(65 + colIndex);
  const rowNumber = rowIndex + 1;
  return `${colLetter}${rowNumber}`;
}

/**
 * Converts angle in degrees to 16-point compass bearing string
 */
export function toCompassBearing(deg) {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = ['E', 'ENE', 'NE', 'NNE', 'N', 'NNW', 'NW', 'WNW', 'W', 'WSW', 'SW', 'SSW', 'S', 'SSE', 'SE', 'ESE'];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

/**
 * Erangel Tactical Landmarks
 */
export function getErangelLandmark(x, y) {
  if (x > 3200 && x < 4800 && y > 3200 && y < 4700) {
    return { name: 'Pochinki Church Ridge', grid: 'E4', terrain: 'High-Ground Crest • Defilade' };
  }
  if (y > 5500) {
    if (x < 4800) return { name: 'Sosnovka Military Base', grid: 'D7', terrain: 'Military Bunkers • Radar Towers' };
    return { name: 'Novorepnoye Port & Hills', grid: 'F7', terrain: 'Shipping Containers • Coastal Slopes' };
  }
  if (x < 3000 && y < 3500) {
    return { name: 'Georgopol Hospital Crest', grid: 'B3', terrain: 'North River Slopes • Hospital Compound' };
  }
  if (x > 5000 && y < 4200) {
    return { name: 'Yasnaya Polyana Farmland', grid: 'F4', terrain: 'Open Farm Compounds • Hay Bales' };
  }
  if (x > 3000 && x < 4600 && y < 2900) {
    return { name: 'Rozhok Hill & Water City', grid: 'D3', terrain: 'Elevated Ridge • Water Canal Defenses' };
  }
  if (x > 4600 && x < 5400 && y > 2700 && y < 3600) {
    return { name: 'School & Auditorium', grid: 'E3', terrain: 'Roof Control • Central Mainland Hub' };
  }
  if (x > 5800 && y > 4400 && y < 5800) {
    return { name: 'Mylta Power Substation', grid: 'G5', terrain: 'Industrial Steel • Coastal Bluff' };
  }
  if (x < 2400 && y > 5200) {
    return { name: 'Primorsk Coastal Bluffs', grid: 'B6', terrain: 'Sea Cliffs • Lighthouse Compound' };
  }
  if (x > 2200 && x < 3500 && y > 3800 && y < 4800) {
    return { name: 'Gatka Farmland & Trenches', grid: 'C4', terrain: 'Low Drainage Trenches • Open Fields' };
  }
  if (x > 4400 && x < 5600 && y > 4600 && y < 5500) {
    return { name: 'Farm Valley Defilades', grid: 'E5', terrain: 'Rolling Defilade • Bridge Approach' };
  }
  return { name: `Erangel Mainland [${toErangelGrid(x, y)}]`, grid: toErangelGrid(x, y), terrain: 'Natural Ridge Defilade' };
}

/**
 * Predicts sequential competitive safe zones (Phases 1 through 5)
 * Dynamically responds to flight vector angle, distance, land topology, and water boundaries
 */
export function predictSequentialPhases({
  flightStart,
  flightEnd,
  phase1Center,
  phase1Radius = DEFAULT_PHASE_RADII_METERS[1],
  enforceTerrain = true
}) {
  const startTime = performance.now();

  const fx1 = flightStart.x;
  const fy1 = flightStart.y;
  const fx2 = flightEnd.x;
  const fy2 = flightEnd.y;

  const fdx = fx2 - fx1;
  const fdy = fy2 - fy1;
  const flightAngle = ((Math.atan2(fdy, fdx) * 180 / Math.PI) % 360 + 360) % 360;

  const phases = {
    1: {
      phase: 1,
      x: phase1Center.x,
      y: phase1Center.y,
      r: phase1Radius,
      deltaX: 0,
      deltaY: 0,
      shiftDist: 0,
      shiftAngle: 0,
      compass: 'CENTER',
      grid: toErangelGrid(phase1Center.x, phase1Center.y),
      isReprojected: false,
      areaKm2: ((Math.PI * Math.pow(phase1Radius, 2)) / 1e6).toFixed(2),
      landmark: getErangelLandmark(phase1Center.x, phase1Center.y).name
    }
  };

  let prevShiftAngle = flightAngle;

  for (let n = 1; n < 5; n++) {
    const current = phases[n];
    const currX = current.x;
    const currY = current.y;
    const currR = current.r;
    const nextR = DEFAULT_PHASE_RADII_METERS[n + 1] || Math.round(currR * 0.55);
    const maxShift = Math.max(1, currR - nextR);

    // 1. Flight vector interaction
    const { dist: distToFlight, side: flightSide } = computePointToFlightDistance(
      currX, currY, fx1, fy1, fx2, fy2
    );

    // Perpendicular angle away from flight path (orthogonal push)
    const orthogonalAngle = flightAngle + flightSide * 90.0;
    const orthRad = (orthogonalAngle * Math.PI) / 180;
    const orthX = Math.cos(orthRad);
    const orthY = Math.sin(orthRad);

    // 2. Land gradient pull away from water
    const landGrad = getLandGradientVector(currX, currY, currR * 0.7);

    // 3. Central landmass gravity (prevents boundary escapes)
    const centerDx = MAP_CENTER_METERS - currX;
    const centerDy = MAP_CENTER_METERS - currY;
    const centerDist = Math.hypot(centerDx, centerDy);
    const centerDirX = centerDist > 0 ? centerDx / centerDist : 0;
    const centerDirY = centerDist > 0 ? centerDy / centerDist : 0;

    // 4. Combine forces based on phase:
    // Earlier phases have large macro shifts driven by flight path. Later phases tighten onto terrain.
    let weightFlight = n === 1 ? 0.60 : n === 2 ? 0.45 : 0.25;
    let weightLand = n === 1 ? 0.30 : n === 2 ? 0.40 : 0.55;
    let weightCenter = n === 1 ? 0.10 : n === 2 ? 0.15 : 0.20;

    // If near water edge, land pull dominates 100%
    if (landGrad.landRatio < 0.85) {
      weightLand = 0.75;
      weightFlight = 0.15;
      weightCenter = 0.10;
    }

    const netDirX = orthX * weightFlight + landGrad.x * weightLand + centerDirX * weightCenter;
    const netDirY = orthY * weightFlight + landGrad.y * weightLand + centerDirY * weightCenter;

    let targetAngleDeg = ((Math.atan2(netDirY, netDirX) * 180 / Math.PI) % 360 + 360) % 360;

    // 5. Realistic Shift Displacement (Competitive match ratios: 60% to 80% of maximum allowed shift)
    const shiftRatio = n === 1 ? 0.78 : n === 2 ? 0.72 : n === 3 ? 0.68 : 0.65;
    const targetShiftDist = maxShift * shiftRatio;

    const shiftRad = (targetAngleDeg * Math.PI) / 180;
    const rawNextX = currX + targetShiftDist * Math.cos(shiftRad);
    const rawNextY = currY + targetShiftDist * Math.sin(shiftRad);

    // Step 1: Strict Euclidean Containment Clamping
    const clamped = clampContainment(currX, currY, currR, rawNextX, rawNextY, nextR);

    // Step 2: Land check and reprojection
    let finalX = clamped.x;
    let finalY = clamped.y;
    let wasReprojected = false;

    if (enforceTerrain) {
      const landCheck = reprojectToNearestLand(finalX, finalY);
      if (landCheck.reprojected) {
        const reClamped = clampContainment(currX, currY, currR, landCheck.x, landCheck.y, nextR);
        finalX = reClamped.x;
        finalY = reClamped.y;
        wasReprojected = true;
      }
    }

    const actualDx = finalX - currX;
    const actualDy = finalY - currY;
    const actualShiftDist = Math.hypot(actualDx, actualDy);
    const actualShiftAngle = ((Math.atan2(actualDy, actualDx) * 180 / Math.PI) % 360 + 360) % 360;

    phases[n + 1] = {
      phase: n + 1,
      x: Math.round(finalX),
      y: Math.round(finalY),
      r: nextR,
      deltaX: Math.round(actualDx),
      deltaY: Math.round(actualDy),
      shiftDist: Math.round(actualShiftDist),
      shiftAngle: Math.round(actualShiftAngle),
      compass: toCompassBearing(actualShiftAngle),
      grid: toErangelGrid(finalX, finalY),
      isReprojected: wasReprojected,
      areaKm2: ((Math.PI * Math.pow(nextR, 2)) / 1e6).toFixed(2),
      landmark: getErangelLandmark(finalX, finalY).name
    };

    prevShiftAngle = actualShiftAngle;
  }

  const latencyMs = Math.max(0.4, performance.now() - startTime);

  return {
    phases,
    flightPath: {
      start: { x: flightStart.x, y: flightStart.y },
      end: { x: flightEnd.x, y: flightEnd.y },
      angle: flightAngle,
      lengthMeters: Math.hypot(fdx, fdy)
    },
    latencyMs: Number(latencyMs.toFixed(2))
  };
}

/**
 * Generates Actionable Rotation Advisory for Players and Coaches
 */
export function generateTacticalBriefing(phases, flightPath) {
  const p1 = phases[1] || { x: 4100, y: 3900, r: 2000, grid: 'E4' };
  const p2 = phases[2] || { x: 3400, y: 3500, r: 1100, shiftDist: 700, compass: 'NW', grid: 'E4' };
  const p5 = phases[5] || { x: 3100, y: 3300, r: 180, shiftDist: 110, compass: 'NW', grid: 'D3' };

  const maxPossibleP2Shift = p1.r - p2.r; // 900m
  const p2ShiftRatio = (p2.shiftDist || 0) / maxPossibleP2Shift;
  const isHardShift = p2ShiftRatio > 0.55;

  let shiftType = isHardShift ? 'Hard Shift' : 'Moderate Shift';
  let shiftDescription = `${p2.shiftDist}m pull towards ${p2.compass}`;

  let urgency = 'MODERATE ROTATION';
  let urgencyColor = '#d97706';
  let urgencyBadge = 'STANDARD';
  let vehicleStatus = 'Recommended';
  let moveWindow = '120 seconds';

  if (isHardShift) {
    urgency = 'CRITICAL ROTATION';
    urgencyColor = '#dc2626';
    urgencyBadge = 'URGENT';
    vehicleStatus = 'MANDATORY';
    moveWindow = 'Immediate (<90s)';
  } else if (p2ShiftRatio < 0.35) {
    urgency = 'STABLE COMPOUND HOLD';
    urgencyColor = '#059669';
    urgencyBadge = 'STABLE';
    vehicleStatus = 'Defilade walk';
    moveWindow = 'Scout early';
  }

  const p5Landmark = getErangelLandmark(p5.x, p5.y);
  let chokeAlert = null;
  const crossesSosnovka = (p1.y < 5200 && p5.y > 5500) || (p1.y > 5500 && p5.y < 5200);
  if (crossesSosnovka) {
    chokeAlert = {
      level: 'MILITARY BRIDGE CHOKE',
      message: 'Sosnovka Military Channel crossing required. Expect bridge ambushes or water choke.',
      color: '#dc2626'
    };
  } else if (p5.x > 3200 && p5.x < 4600 && p5.y < 3000) {
    chokeAlert = {
      level: 'RIVER RIDGE CHOKE',
      message: 'Rozhok water canal bottleneck along northern ridges.',
      color: '#d97706'
    };
  }

  const recommendations = [
    isHardShift
      ? `Primary Phase 2 hard pull (${p2.shiftDist}m ${p2.compass}). Outer teams must rotate immediately to secure deep compound lines.`
      : `Moderate concentric zone (${p2.shiftDist}m ${p2.compass}). Prioritize center compound scouting and hold ridge defilades.`,
    `Predicted final circle at [${p5Landmark.grid}] near ${p5Landmark.name} (${p5Landmark.terrain}).`,
    `Set up 360° vehicle barricade; maintain high ground crest dominance over open lowlands.`
  ];

  if (chokeAlert) {
    recommendations.unshift(`⚠️ Chokepoint: ${chokeAlert.message}`);
  }

  return {
    urgency,
    urgencyColor,
    urgencyBadge,
    shiftType,
    shiftDescription,
    vehicleStatus,
    moveWindow,
    primaryAnchor: p5Landmark.name,
    endgameGrid: p5Landmark.grid,
    endgameTerrain: p5Landmark.terrain,
    chokeAlert,
    flightBearing: `${Math.round(flightPath.angle)}° (${toCompassBearing(flightPath.angle)})`,
    recommendations
  };
}
