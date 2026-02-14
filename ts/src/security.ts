import { randomBytes } from 'node:crypto';

/**
 * Generates a CSP nonce suitable for `script-src 'nonce-...'` and `style-src 'nonce-...'`.
 *
 * Notes:
 * - Use per-request nonces only for per-request HTML (SSR). Do not bake per-request nonces into cached HTML (SSG/ISR),
 *   unless your CSP header can be made to match the cached nonce value.
 */
export function createCspNonce(bytes = 16): string {
  const size = Math.max(1, Math.trunc(Number(bytes)));
  return randomBytes(size).toString('base64');
}

