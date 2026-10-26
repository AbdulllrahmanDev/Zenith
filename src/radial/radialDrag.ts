export interface Coordinates {
  x: number;
  y: number;
}

export const HUB_DRAG_SLOP_PX = 4;

export function clampWheelCenter(
  point: Coordinates,
  viewport: { width: number; height: number },
  ringReach: number,
): Coordinates {
  return {
    x: clampAxis(point.x, viewport.width, ringReach),
    y: clampAxis(point.y, viewport.height, ringReach),
  };
}

function clampAxis(value: number, extent: number, reach: number): number {
  if (!Number.isFinite(value)) return Math.round(extent / 2);
  const margin = Math.min(Math.max(reach, 0), extent / 2);
  const min = margin;
  const max = extent - margin;
  if (!(max > min)) return Math.round(extent / 2);
  return Math.round(Math.min(Math.max(value, min), max));
}

export function remapClientPoint(
  point: Coordinates,
  fromOrigin: Coordinates | null,
  toOrigin: Coordinates | null,
): Coordinates {
  if (!fromOrigin || !toOrigin) return point;
  return {
    x: Math.round(point.x + (fromOrigin.x - toOrigin.x)),
    y: Math.round(point.y + (fromOrigin.y - toOrigin.y)),
  };
}
