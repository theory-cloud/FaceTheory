/**
 * Removes exactly one trailing DNS root dot from a URL hostname. A lone root
 * label or multiple trailing dots are not valid application hosts and are
 * rejected rather than collapsed into a different hostname.
 */
export function normalizeTrailingDnsRootDotHostname(url: URL): boolean {
  if (url.hostname === '.' || url.hostname.endsWith('..')) return false;
  if (url.hostname.endsWith('.')) {
    url.hostname = url.hostname.slice(0, -1);
  }
  return true;
}
