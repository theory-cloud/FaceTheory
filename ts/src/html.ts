import type { FaceAttributes } from './types.js';

export function escapeHTML(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeJson(value: unknown): string {
  return escapeJsonForHtml(JSON.stringify(value));
}

export function escapeJsonForHtml(serialized: string): string {
  return serialized
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export interface HTMLDocumentParts {
  lang?: string;
  htmlAttrs?: FaceAttributes;
  bodyAttrs?: FaceAttributes;
  head?: string;
  body: string;
}

export function renderAttributes(attrs: FaceAttributes | undefined): string {
  if (!attrs) return '';

  const keys = Object.keys(attrs).sort();
  let out = '';
  for (const key of keys) {
    const value = attrs[key];
    if (value === undefined || value === null || value === false) continue;

    const name = escapeHTML(key);
    if (value === true) {
      out += ` ${name}`;
      continue;
    }

    out += ` ${name}="${escapeHTML(String(value))}"`;
  }

  return out;
}

const DOCUMENT_SHELL_ATTRIBUTE_NAME = /^[A-Za-z0-9_:.-]+$/;

/**
 * Rejects document-shell attribute names that could break out of the emitted
 * start tag or install an inline event handler. Values are escaped by
 * `renderAttributes`; names are rejected outright because the emitted byte
 * sequence is not a valid single attribute name.
 */
function assertSafeDocumentShellAttributeName(name: string): void {
  const trimmed = name.trim();
  if (
    /^on[a-z]/i.test(trimmed) ||
    !DOCUMENT_SHELL_ATTRIBUTE_NAME.test(trimmed)
  ) {
    throw new Error(
      `FaceTheory document shell attribute name is unsafe: ${JSON.stringify(name)}`,
    );
  }
}

function renderDocumentShellAttributes(
  attrs: FaceAttributes | undefined,
): string {
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      assertSafeDocumentShellAttributeName(key);
    }
  }
  return renderAttributes(attrs);
}

function htmlAttributesForDocument(parts: {
  lang?: string;
  htmlAttrs?: FaceAttributes;
}): FaceAttributes {
  const htmlAttrs: FaceAttributes = { ...(parts.htmlAttrs ?? {}) };
  if (parts.lang !== undefined && parts.lang !== null && parts.lang !== '') {
    htmlAttrs.lang = parts.lang;
  } else if (
    htmlAttrs.lang === undefined ||
    htmlAttrs.lang === null ||
    htmlAttrs.lang === ''
  ) {
    htmlAttrs.lang = 'en';
  }
  return htmlAttrs;
}

export function renderHTMLDocument(parts: HTMLDocumentParts): string {
  const head = parts.head ?? '';
  const htmlAttrs = renderDocumentShellAttributes(
    htmlAttributesForDocument(parts),
  );
  const bodyAttrs = renderDocumentShellAttributes(parts.bodyAttrs);
  return `<!doctype html><html${htmlAttrs}><head>${head}</head><body${bodyAttrs}>${parts.body}</body></html>`;
}

export interface HTMLDocumentStreamParts {
  lang?: string;
  htmlAttrs?: FaceAttributes;
  bodyAttrs?: FaceAttributes;
  head?: string;
  body: AsyncIterable<Uint8Array>;
  onStreamError?: (err: unknown) => void;
}

import { utf8 } from './bytes.js';

export async function* streamHTMLDocument(
  parts: HTMLDocumentStreamParts,
): AsyncIterable<Uint8Array> {
  const head = parts.head ?? '';
  const htmlAttrs = renderDocumentShellAttributes(
    htmlAttributesForDocument(parts),
  );
  const bodyAttrs = renderDocumentShellAttributes(parts.bodyAttrs);

  yield utf8(
    `<!doctype html><html${htmlAttrs}><head>${head}</head><body${bodyAttrs}>`,
  );
  try {
    for await (const chunk of parts.body) {
      yield chunk;
    }
  } catch (err) {
    // Avoid breaking the full HTML document shape on streaming errors.
    // Do not include error details in HTML (may contain sensitive information).
    try {
      parts.onStreamError?.(err);
    } catch {
      // Telemetry hooks must not alter emitted streaming bytes.
    }
    console.error('FaceTheory: streaming body error', err);
    yield utf8('<template data-facetheory-stream-error="true"></template>');
  }
  yield utf8(`</body></html>`);
}
