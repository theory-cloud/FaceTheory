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

const SCRIPT_PAIR_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;

interface HtmlStartTag {
  attrs: string;
  tagName: string;
}

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
  for (const startTag of scanHtmlStartTags(html)) {
    const tagName = startTag.tagName.toLowerCase();
    if (tagName !== 'script') continue;

    if (!hasHtmlAttribute(startTag.attrs, 'src')) {
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
  for (const startTag of scanHtmlStartTags(html)) {
    if (startTag.tagName.toLowerCase() === 'style') {
      throw new Error('FaceTheory strict CSP rejects inline style tags in document');
    }
  }
}

function validateNoUnsafeAttributes(
  html: string,
  policy: FaceCspPolicy | undefined,
): void {
  for (const startTag of scanHtmlStartTags(html)) {
    const attrs = startTag.attrs;
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

function* scanHtmlStartTags(html: string): Generator<HtmlStartTag> {
  let cursor = 0;
  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart === -1) return;

    const nameStart = tagStart + 1;
    const firstNameChar = html.charCodeAt(nameStart);
    if (!isAsciiAlpha(firstNameChar)) {
      cursor = nameStart;
      continue;
    }

    let nameEnd = nameStart + 1;
    while (nameEnd < html.length && isHtmlTagNameChar(html.charCodeAt(nameEnd))) {
      nameEnd += 1;
    }

    const tagEnd = html.indexOf('>', nameEnd);
    if (tagEnd === -1) return;

    yield {
      attrs: html.slice(nameEnd, tagEnd),
      tagName: html.slice(nameStart, nameEnd),
    };
    cursor = tagEnd + 1;
  }
}

function hasHtmlAttribute(attrs: string, name: string): boolean {
  const expectedName = name.toLowerCase();
  for (const attributeName of scanHtmlAttributeNames(attrs)) {
    if (attributeName.toLowerCase() === expectedName) return true;
  }
  return false;
}

function findInlineEventAttribute(attrs: string): string | null {
  for (const attributeName of scanHtmlAttributeNames(attrs)) {
    if (/^on[a-z][\w:-]*$/i.test(attributeName)) return attributeName;
  }
  return null;
}

function* scanHtmlAttributeNames(attrs: string): Generator<string> {
  let cursor = 0;
  while (cursor < attrs.length) {
    cursor = skipHtmlAttributeDelimiters(attrs, cursor);
    if (cursor >= attrs.length) return;

    const nameStart = cursor;
    while (cursor < attrs.length && !isHtmlAttributeNameDelimiter(attrs.charCodeAt(cursor))) {
      cursor += 1;
    }

    const attributeName = attrs.slice(nameStart, cursor);
    if (attributeName) yield attributeName;

    cursor = skipHtmlWhitespace(attrs, cursor);
    if (attrs[cursor] !== '=') continue;

    cursor = skipHtmlWhitespace(attrs, cursor + 1);
    if (attrs[cursor] === '"' || attrs[cursor] === "'") {
      const quote = attrs[cursor] ?? '';
      cursor += 1;
      while (cursor < attrs.length && attrs[cursor] !== quote) cursor += 1;
      if (cursor < attrs.length) cursor += 1;
      continue;
    }

    while (cursor < attrs.length && !isHtmlWhitespace(attrs.charCodeAt(cursor))) {
      cursor += 1;
    }
  }
}

function skipHtmlAttributeDelimiters(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length) {
    const next = skipHtmlWhitespace(value, cursor);
    // Browser parsers treat an unexpected solidus before an attribute name as
    // a parse error, then continue in the before-attribute-name state. Mirror
    // that boundary so `<button/onclick=...>` is scanned as an onclick attr
    // without making `/` unsafe inside unquoted attribute values.
    if (value[next] !== '/') return next;
    cursor = next + 1;
  }
  return cursor;
}

function skipHtmlWhitespace(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length && isHtmlWhitespace(value.charCodeAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function isAsciiAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isHtmlTagNameChar(code: number): boolean {
  return (
    isAsciiAlpha(code) ||
    (code >= 48 && code <= 57) ||
    code === 45 ||
    code === 58
  );
}

function isHtmlAttributeNameDelimiter(code: number): boolean {
  return isHtmlWhitespace(code) || code === 47 || code === 61 || code === 62;
}

function isHtmlWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}
