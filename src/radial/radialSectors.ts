/**
 * The wheel's plane, cut into equal shares — the geometry BOTH the aim and the drawing read.
 * Conventions:
 *  - Degrees, screen coordinates: x right, y DOWN. Increasing degrees run clockwise.
 *  - Item i is centred on i * (360 / count) - 90, so item 0 sits at twelve o'clock.
 */

/** Half-open [start, end) in degrees: the share of the plane item `index` owns. */
export function sectorBoundsDeg(index: number, count: number): { startDeg: number; endDeg: number } {
  const sliceAngle = 360 / count;
  const centreDeg = index * sliceAngle - 90;
  return { startDeg: centreDeg - sliceAngle / 2, endDeg: centreDeg + sliceAngle / 2 };
}

/** The direction item `index` is aimed at — the bisector its highlight runs along. */
export function sectorCentreDeg(index: number, count: number): number {
  return index * (360 / count) - 90;
}

/**
 * Which item a displacement from the centre points at. `count` must be > 0.
 * Direction and area both call it, and pointer mode calls it too.
 */
export function sectorIndexForDelta(deltaX: number, deltaY: number, count: number): number | null {
  if (count <= 0) return null;
  const sliceAngle = 360 / count;
  let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  const index = Math.floor(((angle + sliceAngle / 2) % 360) / sliceAngle);
  return index >= 0 && index < count ? index : null;
}

/**
 * One wedge, as an SVG path, in a box of side `radiusOuter * 2` whose centre is the wheel's.
 */
export function annularSectorPath(
  radiusInner: number,
  radiusOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const point = (deg: number, radius: number) => {
    const rad = deg * (Math.PI / 180);
    return `${(radiusOuter + radius * Math.cos(rad)).toFixed(2)} ${(radiusOuter + radius * Math.sin(rad)).toFixed(2)}`;
  };

  if (endDeg - startDeg >= 359.999) {
    return [
      `M ${point(0, radiusOuter)}`,
      `A ${radiusOuter} ${radiusOuter} 0 1 1 ${point(180, radiusOuter)}`,
      `A ${radiusOuter} ${radiusOuter} 0 1 1 ${point(360, radiusOuter)}`,
      `M ${point(0, radiusInner)}`,
      `A ${radiusInner} ${radiusInner} 0 1 0 ${point(180, radiusInner)}`,
      `A ${radiusInner} ${radiusInner} 0 1 0 ${point(360, radiusInner)}`,
      'Z',
    ].join(' ');
  }

  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${point(startDeg, radiusInner)}`,
    `L ${point(startDeg, radiusOuter)}`,
    `A ${radiusOuter} ${radiusOuter} 0 ${largeArc} 1 ${point(endDeg, radiusOuter)}`,
    `L ${point(endDeg, radiusInner)}`,
    `A ${radiusInner} ${radiusInner} 0 ${largeArc} 0 ${point(startDeg, radiusInner)}`,
    'Z',
  ].join(' ');
}

/** A point on the wheel's plane, for the seams drawn between wedges. */
export function polarPoint(
  centre: number,
  radius: number,
  deg: number,
): { x: number; y: number } {
  const rad = deg * (Math.PI / 180);
  return { x: centre + radius * Math.cos(rad), y: centre + radius * Math.sin(rad) };
}

const FALLOFF_SAMPLES = [
  0, 0.06, 0.12, 0.19, 0.25, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.69, 0.75, 0.82, 0.88, 0.94, 1,
];

export function sectorPlateauStop(innerStop: number, falloffStop: number): number {
  return Math.min(0.98, Math.max(innerStop + 0.01, falloffStop));
}

export function sectorGradientStops(
  innerStop: number,
  falloffStop: number,
  nearAlpha: number,
  farAlpha: number,
): { offset: number; opacity: number }[] {
  const plateau = sectorPlateauStop(innerStop, falloffStop);
  return [
    { offset: innerStop, opacity: nearAlpha },
    ...FALLOFF_SAMPLES.map((t) => ({
      offset: plateau + t * (1 - plateau),
      opacity: farAlpha * (1 - t) * (1 - t),
    })),
  ];
}

function beamCurve(t: number, lean: number): number {
  return lean + (1 - lean) * (1 - t) * (1 - t);
}

const SECTOR_BEAM_RUN = 0.5;

function leanWithRoom(lean: number, plateau: number): number {
  return 1 - (1 - lean) * Math.min(1, (1 - plateau) / SECTOR_BEAM_RUN);
}

export function sectorBeamLean(count: number): number {
  return Math.sin(Math.PI / Math.max(count, 2));
}

export function sectorBeamStops(
  innerStop: number,
  falloffStop: number,
  nearAlpha: number,
  farAlpha: number,
  lean: number,
): { offset: number; opacity: number }[] {
  const plateau = sectorPlateauStop(innerStop, falloffStop);
  const reached = leanWithRoom(lean, plateau);
  return [
    { offset: 0, opacity: nearAlpha },
    ...FALLOFF_SAMPLES.map((t) => ({
      offset: plateau + t * (1 - plateau),
      opacity: farAlpha * beamCurve(t, reached),
    })),
  ];
}

export function sectorReachStops(
  innerStop: number,
  falloffStop: number,
  lean: number,
): { offset: number; opacity: number }[] {
  const plateau = sectorPlateauStop(innerStop, falloffStop);
  const reached = leanWithRoom(lean, plateau);
  return [
    { offset: innerStop, opacity: 1 },
    ...FALLOFF_SAMPLES.map((t) => ({
      offset: plateau + t * (1 - plateau),
      opacity: ((1 - t) * (1 - t)) / beamCurve(t, reached),
    })),
  ];
}

const SECTOR_ALPHA_COUNT = 8;

export function sectorBeamAlphas(
  alphas: readonly [number, number],
  count: number,
): [number, number] {
  const temper = Math.min(1, Math.sqrt(Math.max(count, 2) / SECTOR_ALPHA_COUNT));
  return [alphas[0] * temper, alphas[1] * temper];
}

const SECTOR_SOLO_FALLOFF_POWER = 1.5;
const SECTOR_SOLO_SAMPLES = 36;

export function sectorSoloFadeMask(centreDeg: number): string {
  const stops = Array.from({ length: SECTOR_SOLO_SAMPLES + 1 }, (_, index) => {
    const turn = index / SECTOR_SOLO_SAMPLES;
    const weight = ((1 + Math.cos(turn * 2 * Math.PI)) / 2) ** SECTOR_SOLO_FALLOFF_POWER;
    return `rgba(0, 0, 0, ${weight.toFixed(4)}) ${(turn * 360).toFixed(1)}deg`;
  });
  return `conic-gradient(from ${centreDeg + 90}deg at 50% 50%, ${stops.join(', ')})`;
}

export const SECTOR_FILL_ALPHA = [0.46, 0.38] as const;
export const SECTOR_EDGE_ALPHA = [0.68, 0.55] as const;
export const SECTOR_SEAM_ALPHA = [0.16, 0.11] as const;
export const SECTOR_SEAM_REACH = 0.55;
export const SECTOR_SEAM_FALLOFF_SCALE = 1.1;
