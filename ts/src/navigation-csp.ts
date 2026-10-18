import {
  isInlineEventAttributeName,
  scanHtmlAttributes,
  scanHtmlStartTags,
  type HtmlAttribute,
} from './html-tokenizer.js';
import type { FaceAttributes } from './types.js';

/**
 * Inline capability summary for a destination `Content-Security-Policy` response
 * header: whether the policy permits inline script elements and executable
 * `javascript:`/`data:` URLs, inline event handler attributes, and inline
 * styles.
 */
export interface FaceCspInlinePolicy {
  inlineScriptsAllowed: boolean;
  inlineEventHandlersAllowed: boolean;
  inlineStylesAllowed: boolean;
}

const EXECUTABLE_URL_ATTRIBUTES = new Set([
  'action',
  'background',
  'data',
  'formaction',
  'href',
  'poster',
  'src',
  'xlink:href',
]);

/**
 * Derives the inline capability summary from a `Content-Security-Policy` header
 * value. Multiple comma-separated policies combine restrictively. Returns `null`
 * when no header is present, because an absent policy restricts nothing.
 */
export function cspInlinePolicyFromHeader(
  value: string | null | undefined,
): FaceCspInlinePolicy | null {
  const header = String(value ?? '').trim();
  if (!header) return null;

  let inlineScriptsAllowed = true;
  let inlineEventHandlersAllowed = true;
  let inlineStylesAllowed = true;

  for (const rawPolicy of header.split(',')) {
    const directives = parseNavigationCspDirectives(rawPolicy);
    if (!directiveChainAllowsInline(directives, ['script-src', 'default-src'])) {
      inlineScriptsAllowed = false;
    }
    if (
      !directiveChainAllowsInline(directives, [
        'script-src-attr',
        'script-src',
        'default-src',
      ])
    ) {
      inlineEventHandlersAllowed = false;
    }
    if (
      !directiveChainAllowsInline(directives, [
        'style-src-attr',
        'style-src',
        'default-src',
      ])
    ) {
      inlineStylesAllowed = false;
    }
  }

  return { inlineScriptsAllowed, inlineEventHandlersAllowed, inlineStylesAllowed };
}

/**
 * The slice of a navigation snapshot that is injected into the active document.
 * `applyFaceNavigationSnapshot` assigns `viewHtml` (or `bodyHtml` when the shell
 * has no view) through `innerHTML`, copies `headHtml` into `<head>`, and sets the
 * document/body attributes directly, so these are the strings and attributes a
 * destination policy has to clear.
 */
export interface FaceCspSnapshotContent {
  htmlAttrs: FaceAttributes;
  bodyAttrs: FaceAttributes;
  headHtml: string;
  bodyHtml: string;
  viewHtml: string | null;
}

/**
 * Refuses fetched same-origin HTML that carries active content the destination
 * CSP would have blocked. SPA navigation injects a snapshot into the active
 * document, and fetch cannot install the destination response's CSP headers, so
 * inline event handlers, executable URLs, `iframe srcdoc` documents, and
 * destination-disallowed inline styles would run under the shell's weaker policy.
 * A destination that complies with its own policy passes unchanged.
 *
 * The scan runs on markup that a document parser has already serialized. Fetched
 * bytes are not safe input here: attribute values keep their character
 * references until parsing, so `href="javascript&#58;..."` would pass a raw
 * scan and still become an executable URL once the parsed value is injected.
 * Callers that screen fetched bytes must parse them first and use
 * `validateFaceNavigationCspSnapshot` instead.
 */
export function validateFaceNavigationCspDocument(
  html: string,
  policy: FaceCspInlinePolicy,
): void {
  if (
    policy.inlineScriptsAllowed &&
    policy.inlineEventHandlersAllowed &&
    policy.inlineStylesAllowed
  ) {
    return;
  }

  for (const startTag of scanHtmlStartTags(String(html ?? ''))) {
    validateFaceNavigationCspStartTag(
      startTag.tagName.toLowerCase(),
      Array.from(scanHtmlAttributes(startTag.attrs)),
      policy,
    );
  }
}

/**
 * Screens the parsed snapshot content that `applyFaceNavigationSnapshot` will
 * inject. Attribute values have already been decoded by the destination parse, so
 * character-reference encodings of `javascript:`/`data:` URLs cannot survive this
 * screen, and the document/body attributes that are applied with `setAttribute`
 * are screened alongside the serialized markup.
 */
export function validateFaceNavigationCspSnapshot(
  content: FaceCspSnapshotContent,
  policy: FaceCspInlinePolicy,
): void {
  if (
    policy.inlineScriptsAllowed &&
    policy.inlineEventHandlersAllowed &&
    policy.inlineStylesAllowed
  ) {
    return;
  }

  validateFaceNavigationCspStartTag(
    'html',
    readSnapshotAttributes(content.htmlAttrs),
    policy,
  );
  validateFaceNavigationCspStartTag(
    'body',
    readSnapshotAttributes(content.bodyAttrs),
    policy,
  );
  validateFaceNavigationCspDocument(content.headHtml, policy);
  validateFaceNavigationCspDocument(content.bodyHtml, policy);
  if (content.viewHtml !== null) {
    validateFaceNavigationCspDocument(content.viewHtml, policy);
  }
}

function validateFaceNavigationCspStartTag(
  tagName: string,
  attributes: readonly HtmlAttribute[],
  policy: FaceCspInlinePolicy,
): void {
  if (!policy.inlineStylesAllowed) {
    if (tagName === 'style') {
      throw new Error(
        'FaceTheory SPA navigation refused to inject an inline style element that the destination Content-Security-Policy blocks',
      );
    }
    if (hasInlineStyleAttribute(attributes)) {
      throw new Error(
        'FaceTheory SPA navigation refused to inject an inline style attribute that the destination Content-Security-Policy blocks',
      );
    }
  }

  if (!policy.inlineEventHandlersAllowed) {
    const eventName = findInlineEventHandlerAttribute(attributes);
    if (eventName) {
      throw new Error(
        `FaceTheory SPA navigation refused to inject inline event handler attribute "${eventName}" that the destination Content-Security-Policy blocks`,
      );
    }
  }

  if (!policy.inlineScriptsAllowed) {
    if (tagName === 'iframe' && hasHtmlAttributeName(attributes, 'srcdoc')) {
      throw new Error(
        'FaceTheory SPA navigation refused to inject an iframe srcdoc document that the destination Content-Security-Policy would isolate',
      );
    }
    for (const attribute of attributes) {
      if (!EXECUTABLE_URL_ATTRIBUTES.has(attribute.name.toLowerCase())) {
        continue;
      }
      if (
        isExecutableUrlAttributeValue(
          tagName,
          attribute.name.toLowerCase(),
          attribute.value,
        )
      ) {
        throw new Error(
          `FaceTheory SPA navigation refused to inject executable URL attribute "${attribute.name}" that the destination Content-Security-Policy blocks`,
        );
      }
    }
  }
}

function readSnapshotAttributes(attrs: FaceAttributes): HtmlAttribute[] {
  const out: HtmlAttribute[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    // `syncAttributes` drops these, so they are never injected.
    if (value === undefined || value === null || value === false) continue;
    out.push({ name, value: value === true ? '' : String(value) });
  }
  return out;
}

function hasInlineStyleAttribute(attributes: readonly HtmlAttribute[]): boolean {
  return hasHtmlAttributeName(attributes, 'style');
}

function hasHtmlAttributeName(
  attributes: readonly HtmlAttribute[],
  name: string,
): boolean {
  return attributes.some((attribute) => attribute.name.toLowerCase() === name);
}

function findInlineEventHandlerAttribute(
  attributes: readonly HtmlAttribute[],
): string | null {
  for (const attribute of attributes) {
    if (isInlineEventAttributeName(attribute.name)) return attribute.name;
  }
  return null;
}

function parseNavigationCspDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const rawDirective of policy.split(';')) {
    const tokens = rawDirective
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const name = tokens.shift();
    if (!name || directives.has(name)) continue;
    directives.set(name, tokens);
  }
  return directives;
}

function directiveChainAllowsInline(
  directives: Map<string, string[]>,
  names: readonly string[],
): boolean {
  for (const name of names) {
    const sources = directives.get(name);
    if (sources !== undefined) return sourceListAllowsInline(sources);
  }
  return true;
}

function sourceListAllowsInline(sources: readonly string[]): boolean {
  let allowsUnsafeInline = false;
  let restrictsInline = false;

  for (const source of sources) {
    const keyword = readCspKeyword(source);
    if (keyword === null) continue;
    if (keyword === 'unsafe-inline') {
      allowsUnsafeInline = true;
      continue;
    }
    // CSP3 ignores 'unsafe-inline' when the directive also carries a nonce, a
    // hash, or 'strict-dynamic'.
    if (
      keyword === 'strict-dynamic' ||
      keyword.startsWith('nonce-') ||
      /^sha(256|384|512)-/.test(keyword)
    ) {
      restrictsInline = true;
    }
  }

  // A present directive with no matching source blocks inline content.
  return allowsUnsafeInline && !restrictsInline;
}

/**
 * Reads a single-quoted CSP keyword-source. Bare tokens are never keywords:
 * `unsafe-inline` without quotes, a double-quoted `"unsafe-inline"`, and host
 * sources such as `unsafe-inline.example.com` all stay non-matching, exactly as
 * a browser parses them.
 */
function readCspKeyword(source: string): string | null {
  if (source.length < 3) return null;
  if (!source.startsWith("'") || !source.endsWith("'")) return null;
  const keyword = source.slice(1, -1);
  if (keyword.length === 0 || keyword.includes("'")) return null;
  return keyword.toLowerCase();
}

function isExecutableUrlAttributeValue(
  tagName: string,
  attributeName: string,
  value: string | null | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  const normalized = value.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) {
    return true;
  }
  if (!normalized.startsWith('data:')) return false;
  if (!isScriptCapableDataUrl(normalized)) return false;

  // Script-capable data: documents execute only where the element navigates or
  // embeds a document. Image and media contexts treat the same bytes as an
  // image, so `data:image/svg+xml` in an <img> stays a legitimate asset.
  if (
    attributeName === 'href' ||
    attributeName === 'xlink:href' ||
    attributeName === 'action' ||
    attributeName === 'formaction'
  ) {
    return true;
  }
  return (
    DOCUMENT_EMBEDDING_TAG_NAMES.has(tagName) &&
    (attributeName === 'src' || attributeName === 'data')
  );
}

const DOCUMENT_EMBEDDING_TAG_NAMES = new Set([
  'embed',
  'frame',
  'iframe',
  'object',
  'script',
]);

function isScriptCapableDataUrl(value: string): boolean {
  const mediaType = value.slice('data:'.length).split(/[;,]/, 1)[0]?.trim() ?? '';
  return (
    mediaType === 'text/html' ||
    mediaType === 'application/xhtml+xml' ||
    mediaType === 'image/svg+xml' ||
    mediaType === 'text/javascript' ||
    mediaType === 'application/javascript' ||
    mediaType === 'application/ecmascript' ||
    mediaType === 'text/ecmascript'
  );
}
