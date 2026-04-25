export interface ResolvedSurfaceTone {
  normalizedTone: string | undefined;
  chipBg: string;
  chipColor: string;
}

function isAsciiAlphaNumeric(charCode: number): boolean {
  return (
    (charCode >= 48 && charCode <= 57) || (charCode >= 97 && charCode <= 122)
  );
}

export function normalizeSurfaceTone(
  surfaceTone: string | undefined,
): string | undefined {
  if (surfaceTone === undefined) return undefined;

  const lower = surfaceTone.trim().toLowerCase();
  let normalized = '';
  let pendingSeparator = false;

  for (let index = 0; index < lower.length; index += 1) {
    const char = lower[index]!;

    if (isAsciiAlphaNumeric(char.charCodeAt(0))) {
      if (pendingSeparator && normalized.length > 0) {
        normalized += '-';
      }
      normalized += char;
      pendingSeparator = false;
    } else if (normalized.length > 0) {
      pendingSeparator = true;
    }
  }

  return normalized ? normalized : undefined;
}

export function resolveSurfaceTone(
  surfaceTone: string | undefined,
): ResolvedSurfaceTone {
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
