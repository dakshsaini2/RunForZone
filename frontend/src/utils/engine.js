/**
 * RunForZone - Client-Side Multi-Stage Zone Prediction & Tactical Engine
 * Mathematically mirrors the Python ZonePredictorEngine:
 *   - FR-01: Flight vector & Phase 1 ingestion
 *   - FR-02: Polar offset calculation & ML regression emulation
 *   - FR-03: Euclidean circle containment clamping (C_{n+1} ⊆ C_n)
 *   - FR-04: Terrain land topology clearance & water reprojection
 *   - FR-05: 2D Gaussian rotation probability density
 */

export const MAP_EXTENT_METERS = 8000; // 8km x 8km Erangel
export const MAP_CENTER_METERS = 4000;

export const DEFAULT_PHASE_RADII_METERS = {
  1: 2000, // Phase 1: 2000m radius (4km diameter)
  2: 1100, // Phase 2: 1100m radius
  3: 700,  // Phase 3: 700m radius
  4: 400,  // Phase 4: 400m radius
  5: 200   // Phase 5: 200m radius (final tactical endgame)
};

export const PHASE_CONFIG = {
  1: { name: 'Phase 1', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)', border: '#2563eb', label: 'Initial Drop Zone' },
  2: { name: 'Phase 2', color: '#059669', bg: 'rgba(5, 150, 105, 0.08)', border: '#059669', label: 'Primary Rotation' },
  3: { name: 'Phase 3', color: '#d97706', bg: 'rgba(217, 119, 6, 0.08)', border: '#d97706', label: 'Mid-Game Choke' },
  4: { name: 'Phase 4', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)', border: '#dc2626', label: 'Late Collapse' },
  5: { name: 'Phase 5', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)', border: '#7c3aed', label: 'Endgame Final' }
};

export const PRESET_SCENARIOS = [
  {
    id: 'pochinki',
    name: 'Pochinki Central Hard-Shift',
    description: 'Central flight path across mainland with a violent south-western shift towards the church hills.',
    flight: { x1: 1500, y1: 1800, x2: 6600, y2: 6200 },
    phase1: { x: 4100, y: 3900, r: 2000 }
  },
  {
    id: 'sosnovka',
    name: 'Sosnovka Military Island Bridge Choke',
    description: 'Southern flight line forcing teams to cross the iconic Novorepnoye and Military bridge chokepoints.',
    flight: { x1: 1200, y1: 5200, x2: 7000, y2: 7200 },
    phase1: { x: 4400, y: 6200, r: 2000 }
  },
  {
    id: 'georgopol',
    name: 'Georgopol River & North Hill Ridge',
    description: 'North-western coastal drop testing water city ridges and northern hospital compounds.',
    flight: { x1: 1000, y1: 1400, x2: 6800, y2: 3400 },
    phase1: { x: 2800, y: 2600, r: 2000 }
  },
  {
    id: 'yasnaya',
    name: 'Yasnaya Polyana Open Fields',
    description: 'Eastern flight route with open farm fields endgame testing vehicular rotations and smoke discipline.',
    flight: { x1: 3000, y1: 800, x2: 6400, y2: 6800 },
    phase1: { x: 5500, y: 3200, r: 2000 }
  },
  {
    id: 'mylta',
    name: 'Mylta Power Coastline Shift',
    description: 'South-east coastal circle with landward pull away from the ocean bay.',
    flight: { x1: 2200, y1: 3000, x2: 7200, y2: 5800 },
    phase1: { x: 6200, y: 4900, r: 2000 }
  }
];

/**
 * Calculates perpendicular distance and side of point relative to flight vector
 */
export function computePointToFlightDistance(px, py, fx1, fy1, fx2, fy2) {
  const lineDx = fx2 - fx1;
  const lineDy = fy2 - fy1;
  const lineLen = Math.hypot(lineDx, lineDy);
  if (lineLen < 1e-6) return { dist: 0, side: 1 };

  const cross = (px - fx1) * lineDy - (py - fy1) * lineDx;
  const dist = Math.abs(cross) / lineLen;
  const side = cross >= 0 ? 1 : -1;
  return { dist, side };
}

/**
 * Strict Euclidean containment clamping:
 * Ensures C_{n+1} fits entirely inside C_n.
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
 * Erangel Major Water Boundaries (Coastal Oceans & Sosnovka Channel)
 * Validates whether a coordinate is on valid tactical land.
 */
export function isErangelLand(x, y) {
  // Outer ocean bounds
  if (x < 600 || x > 7400 || y < 600 || y > 7400) return false;

  // South-west ocean corner
  if (x < 1800 && y > 6400) return false;

  // South-east ocean corner
  if (x > 6200 && y > 6400) return false;

  // Sosnovka Channel (Water channel separating mainland and Military Island)
  // Channel runs roughly y: 5200 to 5700 between x: 2600 to 6000, except at bridges (x≈3400, x≈5000)
  if (y >= 5250 && y <= 5650 && x >= 2300 && x <= 6200) {
    const nearBridge1 = Math.abs(x - 3450) < 180;
    const nearBridge2 = Math.abs(x - 5050) < 180;
    if (!nearBridge1 && !nearBridge2) return false;
  }

  // Northern ocean bay
  if (y < 900 && (x < 2400 || x > 5600)) return false;

  return true;
}

/**
 * Re-projects coordinate to nearest valid land if placed in ocean/deep water
 */
export function reprojectToLand(x, y) {
  if (isErangelLand(x, y)) {
    return { x, y, reprojected: false };
  }

  // Search in expanding spiral/rings for nearest land point
  const step = 50;
  for (let r = 50; r <= 800; r += step) {
    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      const testX = x + r * Math.cos(rad);
      const testY = y + r * Math.sin(rad);
      if (isErangelLand(testX, testY)) {
        return { x: testX, y: testY, reprojected: true };
      }
    }
  }

  // Fallback towards map center
  const toCenterX = MAP_CENTER_METERS - x;
  const toCenterY = MAP_CENTER_METERS - y;
  const dist = Math.hypot(toCenterX, toCenterY);
  return {
    x: x + (toCenterX / dist) * 200,
    y: y + (toCenterY / dist) * 200,
    reprojected: true
  };
}

/**
 * Erangel Grid Coordinate Reference (e.g., E4, C2)
 * Erangel is divided into 8x8 1km squares:
 * Columns: A through H (X: 0 to 8000m)
 * Rows: 1 through 8 (Y: 0 to 8000m)
 */
export function toErangelGrid(x, y) {
  const colIndex = Math.min(7, Math.max(0, Math.floor(x / 1000)));
  const rowIndex = Math.min(7, Math.max(0, Math.floor(y / 1000)));
  const colLetter = String.fromCharCode(65 + colIndex); // 'A' + index
  const rowNumber = rowIndex + 1;
  return `${colLetter}${rowNumber}`;
}

/**
 * Converts angle in degrees to 8-point compass bearing string
 */
export function toCompassBearing(deg) {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = ['E', 'ENE', 'NE', 'NNE', 'N', 'NNW', 'NW', 'WNW', 'W', 'WSW', 'SW', 'SSW', 'S', 'SSE', 'SE', 'ESE'];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

/**
 * Runs sequential multi-stage prediction pipeline (Phases 1-5)
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
  const flightDx = fx2 - fx1;
  const flightDy = fy2 - fy1;
  const flightAngle = (Math.atan2(flightDy, flightDx) * 180) / Math.PI;

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
      grid: toErangelGrid(phase1Center.x, phase1Center.y),
      isReprojected: false,
      areaKm2: ((Math.PI * Math.pow(phase1Radius, 2)) / 1e6).toFixed(2)
    }
  };

  let prevDx = 0;
  let prevDy = 0;
  let prevDist = 0;
  let prevAngle = flightAngle;

  for (let n = 1; n < 5; n++) {
    const current = phases[n];
    const currX = current.x;
    const currY = current.y;
    const currR = current.r;
    const nextR = DEFAULT_PHASE_RADII_METERS[n + 1] || currR * 0.55;
    const maxShift = Math.max(1, currR - nextR);

    const { dist: distToFlight, side: flightSide } = computePointToFlightDistance(currX, currY, fx1, fy1, fx2, fy2);

    // Tactical shift dynamics based on phase:
    // Earlier phases have broader shift variation, later phases tighten towards high ground/terrain anchors
    const phaseShiftRatio = n === 1 ? 0.72 : n === 2 ? 0.65 : n === 3 ? 0.58 : 0.52;
    const predictedDist = maxShift * phaseShiftRatio;

    // Shift directional angle influenced by flight path vector, previous pull, and map center gravity
    const mapCenterDx = MAP_CENTER_METERS - currX;
    const mapCenterDy = MAP_CENTER_METERS - currY;
    const centerPullAngle = (Math.atan2(mapCenterDy, mapCenterDx) * 180) / Math.PI;

    // Tactical tendency: circle tends to pull perpendicular to flight line or towards map center
    const baseAngle = prevAngle + (flightSide * 42.0) + (centerPullAngle * 0.15);
    const predictedAngle = ((baseAngle % 360) + 360) % 360;
    const predictedAngleRad = (predictedAngle * Math.PI) / 180;

    const rawDx = predictedDist * Math.cos(predictedAngleRad);
    const rawDy = predictedDist * Math.sin(predictedAngleRad);

    const rawNextX = currX + rawDx;
    const rawNextY = currY + rawDy;

    // Step 1: Strict Euclidean containment clamp
    const clamped = clampContainment(currX, currY, currR, rawNextX, rawNextY, nextR);

    // Step 2: Terrain land reprojection if water
    let finalX = clamped.x;
    let finalY = clamped.y;
    let wasReprojected = false;

    if (enforceTerrain) {
      const terrainCheck = reprojectToLand(finalX, finalY);
      if (terrainCheck.reprojected) {
        // Re-clamp after reprojection to guarantee 100% containment
        const reClamped = clampContainment(currX, currY, currR, terrainCheck.x, terrainCheck.y, nextR);
        finalX = reClamped.x;
        finalY = reClamped.y;
        wasReprojected = true;
      }
    }

    const actualDx = finalX - currX;
    const actualDy = finalY - currY;
    const actualShiftDist = Math.hypot(actualDx, actualDy);
    const actualShiftAngle = ((Math.atan2(actualDy, actualDx) * 180) / Math.PI + 360) % 360;

    phases[n + 1] = {
      phase: n + 1,
      x: finalX,
      y: finalY,
      r: nextR,
      deltaX: actualDx,
      deltaY: actualDy,
      shiftDist: actualShiftDist,
      shiftAngle: actualShiftAngle,
      compass: toCompassBearing(actualShiftAngle),
      grid: toErangelGrid(finalX, finalY),
      isReprojected: wasReprojected,
      areaKm2: ((Math.PI * Math.pow(nextR, 2)) / 1e6).toFixed(2)
    };

    prevDx = actualDx;
    prevDy = actualDy;
    prevDist = actualShiftDist;
    prevAngle = actualShiftAngle;
  }

  const latencyMs = Math.max(0.8, performance.now() - startTime);

  return {
    phases,
    flightPath: {
      start: { x: fx1, y: fy1 },
      end: { x: fx2, y: fy2 },
      angle: ((flightAngle % 360) + 360) % 360,
      lengthMeters: Math.hypot(flightDx, flightDy)
    },
    latencyMs: Number(latencyMs.toFixed(2))
  };
}

/**
 * Generates synthetic rotation recommendation briefing for In-Game Leaders (IGLs)
 */
export function generateTacticalBriefing(phases, flightPath) {
  const p1 = phases[1];
  const p2 = phases[2];
  const p5 = phases[5];

  const shiftToP2 = p2.shiftDist;
  const isHardShift = shiftToP2 > (p1.r - p2.r) * 0.7;

  let urgency = 'MODERATE';
  let urgencyColor = '#d97706';
  if (isHardShift) {
    urgency = 'CRITICAL EARLY ROTATION';
    urgencyColor = '#dc2626';
  } else if (shiftToP2 < 300) {
    urgency = 'SLOW / STABLE COMPOUND PLAY';
    urgencyColor = '#059669';
  }

  // Key compound landmarks around Phase 5
  let primaryAnchor = 'Mainland Ridge / Natural Defilade';
  if (p5.y > 5500) primaryAnchor = 'Sosnovka Military Base / Novorepnoye Hills';
  else if (p5.x < 3000 && p5.y < 3500) primaryAnchor = 'Georgopol South Hills & Hospital Ridge';
  else if (p5.x > 5000 && p5.y < 4000) primaryAnchor = 'Yasnaya Polyana Apartments & Eastern Farms';
  else if (p5.x > 3200 && p5.x < 4800 && p5.y > 3200 && p5.y < 4600) primaryAnchor = 'Pochinki Water City & Church Hill';
  else if (p5.x > 3000 && p5.x < 4500 && p5.y < 2800) primaryAnchor = 'Rozhok Hill & School Compound';

  return {
    urgency,
    urgencyColor,
    isHardShift,
    primaryAnchor,
    endgameGrid: p5.grid,
    flightBearing: `${Math.round(flightPath.angle)}° (${toCompassBearing(flightPath.angle)})`,
    recommendations: [
      isHardShift
        ? 'Zone pulled hard away from center. Secure vehicles within first 90 seconds and establish early deep line.'
        : 'Centric shift detected. Prioritize middle compound scouting and deny ridge approaches.',
      `Final Phase 5 projected at Grid [${p5.grid}] near ${primaryAnchor}.`,
      'Maintain 360° vehicle barricade; avoid open lowlands during Phase 3 to 4 collapse.'
    ]
  };
}
