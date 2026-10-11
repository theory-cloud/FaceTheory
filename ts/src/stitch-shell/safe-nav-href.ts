const SAFE_NAV_HREF_BASE = 'https://facetheory.invalid';

/**
 * Internal mirror of the stitch-admin `safeMetadataHref` policy for shell
 * navigation: HTTP(S) and relative paths survive; `javascript:`, `data:`,
 * control-character-obfuscated schemes, and malformed values are omitted so the
 * adapter renders an inert label instead of a navigable anchor.
 */
export function safeNavHref(
  href: string | null | undefined,
): string | undefined {
  const value = String(href ?? '').trim();
  if (!value) return undefined;

  try {
    const parsed = new URL(value, SAFE_NAV_HREF_BASE);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
