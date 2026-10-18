import {
  findInlineEventAttribute,
  hasHtmlAttribute,
  scanHtmlAttributes,
  scanHtmlStartTags,
} from './html-tokenizer.js';

/**
 * Inline capability summary for a destination `Content-Security-Policy` response
 * header: whether the policy permits inline scripts (including inline event
 * handlers and `javascript:` URLs) and inline styles.
 */
export interface FaceCspInlinePolicy {
  inlineScriptsAllowed: boolean;
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
  let inlineStylesAllowed = true;

  for (const rawPolicy of header.split(',')) {
    const directives = parseNavigationCspDirectives(rawPolicy);
    if (
      !directiveAllowsUnsafeInline(
        directives.get('script-src') ?? directives.get('default-src'),
      )
    ) {
      inlineScriptsAllowed = false;
    }
    if (
      !directiveAllowsUnsafeInline(
        directives.get('style-src-attr') ??
          directives.get('style-src') ??
          directives.get('default-src'),
      )
    ) {
      inlineStylesAllowed = false;
    }
  }

  return { inlineScriptsAllowed, inlineStylesAllowed };
}

/**
 * Refuses fetched same-origin HTML that carries active content the destination
 * CSP would have blocked. SPA navigation injects a snapshot into the active
 * document, and fetch cannot install the destination response's CSP headers, so
 * inline event handlers, executable URLs, `iframe srcdoc` documents, and
 * destination-disallowed inline styles would run under the shell's weaker policy.
 * A destination that complies with its own policy passes unchanged.
 */
export function validateFaceNavigationCspDocument(
  html: string,
  policy: FaceCspInlinePolicy,
): void {
  if (policy.inlineScriptsAllowed && policy.inlineStylesAllowed) return;

  const documentHtml = String(html ?? '');
  for (const startTag of scanHtmlStartTags(documentHtml)) {
    const tagName = startTag.tagName.toLowerCase();
    const attrs = startTag.attrs;

    if (!policy.inlineStylesAllowed) {
      if (tagName === 'style') {
        throw new Error(
          'FaceTheory SPA navigation refused to inject an inline style element that the destination Content-Security-Policy blocks',
        );
      }
      if (hasHtmlAttribute(attrs, 'style')) {
        throw new Error(
          'FaceTheory SPA navigation refused to inject an inline style attribute that the destination Content-Security-Policy blocks',
        );
      }
    }

    if (!policy.inlineScriptsAllowed) {
      const eventName = findInlineEventAttribute(attrs);
      if (eventName) {
        throw new Error(
          `FaceTheory SPA navigation refused to inject inline event handler attribute "${eventName}" that the destination Content-Security-Policy blocks`,
        );
      }
      if (tagName === 'iframe' && hasHtmlAttribute(attrs, 'srcdoc')) {
        throw new Error(
          'FaceTheory SPA navigation refused to inject an iframe srcdoc document that the destination Content-Security-Policy would isolate',
        );
      }
      for (const attribute of scanHtmlAttributes(attrs)) {
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

function directiveAllowsUnsafeInline(
  sources: readonly string[] | undefined,
): boolean {
  if (!sources || sources.length === 0) return true;
  const normalized = sources.map((source) =>
    source.replace(/^'+|'+$/g, '').toLowerCase(),
  );
  if (!normalized.includes('unsafe-inline')) return false;
  // CSP3 ignores 'unsafe-inline' when the directive also carries a nonce or hash.
  return !normalized.some(
    (source) =>
      source.startsWith('nonce-') || /^sha(256|384|512)-/.test(source),
  );
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
