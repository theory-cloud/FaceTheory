export interface ResolvedSurfaceTone {
  normalizedTone: string | undefined;
  chipBg: string;
  chipColor: string;
}

export function normalizeSurfaceTone(surfaceTone: string | undefined): string | undefined {
  if (surfaceTone === undefined) return undefined;

  const normalized = surfaceTone
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized ? normalized : undefined;
}

export function resolveSurfaceTone(surfaceTone: string | undefined): ResolvedSurfaceTone {
  const normalizedTone = normalizeSurfaceTone(surfaceTone);

  return normalizedTone !== undefined
    ? {
        normalizedTone,
        chipBg: `var(--stitch-color-${normalizedTone}-container, var(--stitch-color-surface-container-high, #e2e7ff))`,
        chipColor: `var(--stitch-color-on-${normalizedTone}-container, var(--stitch-color-on-surface, #131b2e))`,
      }
    : {
        normalizedTone: undefined,
        chipBg: 'var(--stitch-color-surface-container-high, #e2e7ff)',
        chipColor: 'var(--stitch-color-on-surface, #131b2e)',
      };
}
