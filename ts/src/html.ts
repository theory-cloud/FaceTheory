export function escapeHTML(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export interface HTMLDocumentParts {
  lang?: string;
  head?: string;
  body: string;
}

export function renderHTMLDocument(parts: HTMLDocumentParts): string {
  const lang = parts.lang ?? 'en';
  const head = parts.head ?? '';
  return `<!doctype html><html lang="${escapeHTML(lang)}"><head>${head}</head><body>${parts.body}</body></html>`;
}

export interface HTMLDocumentStreamParts {
  lang?: string;
  head?: string;
  body: AsyncIterable<Uint8Array>;
}

import { utf8 } from './bytes.js';

export async function* streamHTMLDocument(
  parts: HTMLDocumentStreamParts,
): AsyncIterable<Uint8Array> {
  const lang = parts.lang ?? 'en';
  const head = parts.head ?? '';

  yield utf8(
    `<!doctype html><html lang="${escapeHTML(lang)}"><head>${head}</head><body>`,
  );
  for await (const chunk of parts.body) {
    yield chunk;
  }
  yield utf8(`</body></html>`);
}
