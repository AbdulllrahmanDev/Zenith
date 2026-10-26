export const DWELL_MS_DEFAULT = 400;
export const DWELL_MS_MIN = 0;
export const DWELL_MS_MAX = 2000;
export const DWELL_MS_STEP = 50;

export function clampDwellMs(value: unknown): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return DWELL_MS_DEFAULT;
  return Math.min(DWELL_MS_MAX, Math.max(DWELL_MS_MIN, Math.round(numeric)));
}

export const DIRECTION_SENSITIVITIES = ['low', 'medium', 'high'] as const;
export type DirectionSensitivity = (typeof DIRECTION_SENSITIVITIES)[number];
export const DIRECTION_SENSITIVITY_DEFAULT: DirectionSensitivity = 'medium';

const DIRECTION_COMMIT_PX: Record<DirectionSensitivity, number> = {
  high: 18,
  medium: 96,
  low: 200,
};

export function clampDirectionSensitivity(value: unknown): DirectionSensitivity {
  if (value === 1 || value === '1' || value === 'low') return 'low';
  if (value === 2 || value === '2' || value === 'medium') return 'medium';
  if (value === 3 || value === '3' || value === 'high') return 'high';
  return DIRECTION_SENSITIVITIES.includes(value as DirectionSensitivity)
    ? (value as DirectionSensitivity)
    : DIRECTION_SENSITIVITY_DEFAULT;
}

export function directionCommitPx(value: unknown): number {
  return DIRECTION_COMMIT_PX[clampDirectionSensitivity(value)];
}
