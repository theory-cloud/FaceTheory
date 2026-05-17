import { randomBytes } from 'node:crypto';

import type { FaceCspPolicy } from './types.js';

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

export interface StrictCspHeaderOptions {
  /**
   * Optional nonce for callers that intentionally allow FaceTheory-owned
   * nonced inline tags. The strict default omits this so the header remains a
   * no-inline baseline for external hydration contracts.
   */
  cspNonce?: string | null;
}

export interface StrictCspDocumentValidationOptions {
  policy?: FaceCspPolicy | undefined;
}

const STRICT_CSP_DIRECTIVES: Array<[name: string, values: string[]]> = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'"]],
  ['img-src', ["'self'", 'data:']],
  ['font-src', ["'self'"]],
  ['connect-src', ["'self'"]],
  ['form-action', ["'self'"]],
];

const START_TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*?)?>/g;
const SCRIPT_PAIR_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/**
 * Builds FaceTheory's canonical strict CSP header value.
 *
 * The default is same-origin and no-inline: it never emits
 * `'unsafe-inline'` or `'unsafe-eval'`. Header attachment stays explicit so
 * hosts can decide which Face responses should receive the policy.
 */
export function buildStrictCspHeader(
  options: StrictCspHeaderOptions = {},
): string {
  const nonce = normalizeCspNonce(options.cspNonce ?? null);

  return STRICT_CSP_DIRECTIVES.map(([name, baseValues]) => {
    const values = [...baseValues];
    if ((name === 'script-src' || name === 'style-src') && nonce) {
      values.push(`'nonce-${nonce}'`);
    }
    return `${name} ${values.join(' ')}`;
  }).join('; ');
}

/**
 * Returns whether a policy requires whole-document validation beyond the
 * structured head validation path.
 */
export function requiresStrictCspDocumentValidation(
  policy: FaceCspPolicy | undefined,
): boolean {
  return policy?.inlineScripts === false || policy?.inlineStyles === false;
}

/**
 * Validates a rendered HTML document against FaceTheory's strict no-inline
 * CSP policy surface. This is deliberately deterministic and fail-closed; it
 * catches raw body output that the structured head primitive cannot see.
 */
export function validateStrictCspDocument(
  html: string,
  options: StrictCspDocumentValidationOptions = {},
): void {
  const policy = options.policy;
  if (!requiresStrictCspDocumentValidation(policy)) return;

  const documentHtml = String(html ?? '');

  if (policy?.inlineScripts === false) {
    validateNoInlineScriptElements(documentHtml);
  }
  if (policy?.inlineStyles === false) {
    validateNoInlineStyleElements(documentHtml);
  }

  validateNoUnsafeAttributes(documentHtml, policy);
}

function normalizeCspNonce(nonce: string | null): string | null {
  if (nonce === null) return null;
  const trimmed = String(nonce).trim();
  if (!trimmed) return null;
  if (/[\s;'\r\n]/.test(trimmed)) {
    throw new Error('FaceTheory strict CSP nonce contains unsafe characters');
  }
  return trimmed;
}

function validateNoInlineScriptElements(html: string): void {
  START_TAG_RE.lastIndex = 0;
  let startMatch: RegExpExecArray | null;
  while ((startMatch = START_TAG_RE.exec(html)) !== null) {
    const tagName = String(startMatch[1] ?? '').toLowerCase();
    if (tagName !== 'script') continue;

    const attrs = String(startMatch[2] ?? '');
    if (!hasHtmlAttribute(attrs, 'src')) {
      throw new Error('FaceTheory strict CSP rejects inline script tags in document');
    }
  }

  SCRIPT_PAIR_RE.lastIndex = 0;
  let pairMatch: RegExpExecArray | null;
  while ((pairMatch = SCRIPT_PAIR_RE.exec(html)) !== null) {
    const body = String(pairMatch[2] ?? '');
    if (body.trim().length > 0) {
      throw new Error('FaceTheory strict CSP rejects inline script tags in document');
    }
  }
}

function validateNoInlineStyleElements(html: string): void {
  START_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = START_TAG_RE.exec(html)) !== null) {
    const tagName = String(match[1] ?? '').toLowerCase();
    if (tagName === 'style') {
      throw new Error('FaceTheory strict CSP rejects inline style tags in document');
    }
  }
}

function validateNoUnsafeAttributes(
  html: string,
  policy: FaceCspPolicy | undefined,
): void {
  START_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = START_TAG_RE.exec(html)) !== null) {
    const attrs = String(match[2] ?? '');
    if (!attrs) continue;

    if (policy?.inlineScripts === false) {
      const eventName = findInlineEventAttribute(attrs);
      if (eventName) {
        throw new Error(
          `FaceTheory strict CSP rejects inline event handler attribute "${eventName}" in document`,
        );
      }
    }

    if (policy?.inlineStyles === false && hasHtmlAttribute(attrs, 'style')) {
      throw new Error('FaceTheory strict CSP rejects inline style attributes in document');
    }
  }
}

function hasHtmlAttribute(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:\\s*=|\\s|$)`, 'i').test(attrs);
}

function findInlineEventAttribute(attrs: string): string | null {
  const match = /(?:^|\s)(on[a-z][\w:-]*)(?:\s*=|\s|$)/i.exec(attrs);
  return match?.[1] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
