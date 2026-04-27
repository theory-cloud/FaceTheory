const SAFE_HREF_BASE = 'https://facetheory.invalid';

/**
 * Normalizes clickable metadata hrefs to the schemes browsers can navigate to
 * without executing script. Relative URLs resolve against an inert HTTPS base;
 * `javascript:`, `data:`, and malformed values are omitted.
 */
export function safeMetadataHref(
  href: string | null | undefined,
): string | undefined {
  const value = String(href ?? '').trim();
  if (!value) return undefined;

  try {
    const parsed = new URL(value, SAFE_HREF_BASE);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
