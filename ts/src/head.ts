import { escapeHTML, safeJson } from './html.js';
import type {
  FaceAttributes,
  FaceCspPolicy,
  FaceHeadTag,
  FaceHydration,
  FaceRenderResult,
} from './types.js';

export interface RenderFaceHeadOptions {
  cspNonce?: string | null;
  allowedOrigin?: string | URL;
}

export interface NormalizeHeadTagsOptions {
  cspNonce?: string | null;
}

function escapeScriptText(value: string): string {
  return value.replaceAll(/<\/script/gi, '<\\/script');
}

function escapeStyleText(value: string): string {
  return value.replaceAll(/<\/style/gi, '<\\/style');
}

function safeHttpUrl(value: string): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, 'https://facetheory.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? trimmed
      : null;
  } catch {
    return null;
  }
}

function requireSafeHttpUrl(value: string, label: string): string {
  const safe = safeHttpUrl(value);
  if (!safe) {
    throw new Error(`FaceTheory ${label} must be an http(s) or same-origin URL`);
  }
  return safe;
}

function isExternalHydration(
  hydration: FaceHydration,
): hydration is Extract<FaceHydration, { type: 'external' }> {
  return hydration.type === 'external';
}

function normalizeAllowedOrigin(origin: string | URL | undefined): string | null {
  if (origin === undefined) return null;
  return new URL(String(origin)).origin;
}

function isAbsoluteOrProtocolRelativeUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//');
}

const STRICT_CSP_SAME_ORIGIN_SENTINEL = 'https://facetheory.invalid';

function assertStrictSameOriginUrl(
  value: string,
  label: string,
  allowedOrigin: string | null,
): void {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error(`FaceTheory strict CSP ${label} URL must not be empty`);
  }

  let parsed: URL;
  try {
    // Resolve against the real allowed origin when present so WHATWG/browser
    // network-path forms such as `/\host` or control-stripped `//host` values
    // cannot bypass strict CSP through the raw relative-url classifier.
    parsed = new URL(trimmed, allowedOrigin ?? STRICT_CSP_SAME_ORIGIN_SENTINEL);
  } catch {
    throw new Error(`FaceTheory strict CSP ${label} URL is invalid: ${trimmed}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `FaceTheory strict CSP ${label} URL must be http(s) or same-origin: ${trimmed}`,
    );
  }

  if (!allowedOrigin) {
    if (
      !isAbsoluteOrProtocolRelativeUrl(trimmed) &&
      parsed.origin === STRICT_CSP_SAME_ORIGIN_SENTINEL
    ) {
      return;
    }

    throw new Error(
      `FaceTheory strict CSP ${label} URL must be same-origin or relative: ${trimmed}`,
    );
  }

  if (parsed.origin !== allowedOrigin) {
    throw new Error(
      `FaceTheory strict CSP ${label} URL resolved cross-origin: expected ${allowedOrigin}, received ${parsed.origin}`,
    );
  }
}

function isCspDisabled(
  policy: FaceCspPolicy | undefined,
  key: keyof FaceCspPolicy,
): boolean {
  return policy?.[key] === false;
}

function validateStrictAttributes(
  tag: FaceHeadTag,
  attrs: FaceAttributes | undefined,
  policy: FaceCspPolicy | undefined,
  allowedOrigin: string | null,
): void {
  if (!attrs) return;

  for (const [name, rawValue] of Object.entries(attrs)) {
    if (rawValue === undefined || rawValue === null || rawValue === false) continue;
    const lowerName = name.trim().toLowerCase();

    if (isCspDisabled(policy, 'inlineScripts') && /^on[a-z]/.test(lowerName)) {
      throw new Error(
        `FaceTheory strict CSP rejects inline event handler attribute "${name}" in head`,
      );
    }

    if (isCspDisabled(policy, 'inlineStyles') && lowerName === 'style') {
      throw new Error('FaceTheory strict CSP rejects inline style attributes in head');
    }

    if (
      isCspDisabled(policy, 'inlineScripts') &&
      tag.type === 'script' &&
      lowerName === 'src'
    ) {
      assertStrictSameOriginUrl(String(rawValue), 'script src', allowedOrigin);
    }

    if (
      (isCspDisabled(policy, 'inlineScripts') ||
        isCspDisabled(policy, 'inlineStyles')) &&
      tag.type === 'link' &&
      lowerName === 'href'
    ) {
      assertStrictSameOriginUrl(String(rawValue), 'link href', allowedOrigin);
    }
  }
}

function validateStrictHeadTags(
  tags: FaceHeadTag[],
  policy: FaceCspPolicy | undefined,
  options: {
    allowedOrigin?: string | URL;
    allowedEscapedRawHtml?: string | null;
  } = {},
): void {
  if (!policy) return;

  const allowedOrigin = normalizeAllowedOrigin(options.allowedOrigin);
  const allowedEscapedRawHtml = options.allowedEscapedRawHtml ?? null;

  for (const tag of tags) {
    switch (tag.type) {
      case 'raw':
        if (
          isCspDisabled(policy, 'rawHead') &&
          tag.html !== allowedEscapedRawHtml
        ) {
          throw new Error('FaceTheory strict CSP rejects raw head HTML');
        }
        break;
      case 'script':
        if (isCspDisabled(policy, 'inlineScripts') && tag.body !== undefined) {
          throw new Error('FaceTheory strict CSP rejects inline script tags');
        }
        validateStrictAttributes(tag, tag.attrs, policy, allowedOrigin);
        break;
      case 'style':
        if (isCspDisabled(policy, 'inlineStyles')) {
          throw new Error('FaceTheory strict CSP rejects inline style tags');
        }
        validateStrictAttributes(tag, tag.attrs, policy, allowedOrigin);
        break;
      case 'meta':
      case 'link':
        validateStrictAttributes(tag, tag.attrs, policy, allowedOrigin);
        break;
      case 'title':
        break;
    }
  }
}

function renderAttributes(attrs: FaceAttributes | undefined): string {
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

function isCharsetMeta(tag: FaceHeadTag): boolean {
  return (
    tag.type === 'meta' &&
    tag.attrs.charset !== undefined &&
    tag.attrs.charset !== null
  );
}

function dedupeKey(tag: FaceHeadTag): string | null {
  switch (tag.type) {
    case 'title':
      return 'title';
    case 'meta': {
      const { attrs } = tag;
      if (attrs.charset !== undefined && attrs.charset !== null)
        return 'meta:charset';
      const name = attrs.name;
      if (typeof name === 'string') return `meta:name:${name.toLowerCase()}`;
      const property = attrs.property;
      if (typeof property === 'string')
        return `meta:property:${property.toLowerCase()}`;
      const httpEquiv = attrs['http-equiv'];
      if (typeof httpEquiv === 'string')
        return `meta:http-equiv:${httpEquiv.toLowerCase()}`;
      return null;
    }
    case 'link': {
      const rel = tag.attrs.rel;
      const href = tag.attrs.href;
      if (typeof rel !== 'string' || typeof href !== 'string') return null;
      const as = tag.attrs.as;
      const asKey = typeof as === 'string' ? as.toLowerCase() : '';
      return `link:${rel.toLowerCase()}:${href}:${asKey}`;
    }
    case 'script': {
      const src = tag.attrs.src;
      if (typeof src === 'string') {
        const type = tag.attrs.type;
        const typeKey = typeof type === 'string' ? type.toLowerCase() : '';
        return `script:src:${src}:type:${typeKey}`;
      }
      const id = tag.attrs.id;
      if (typeof id === 'string') return `script:id:${id}`;
      return null;
    }
    case 'style': {
      const id = tag.attrs?.id;
      if (typeof id === 'string') return `style:id:${id}`;
      const dataEmotion = tag.attrs?.['data-emotion'];
      if (typeof dataEmotion === 'string')
        return `style:data-emotion:${dataEmotion}`;
      return null;
    }
    case 'raw':
      return null;
  }
}

function applyCspNonce(tag: FaceHeadTag, nonce: string | null): FaceHeadTag {
  if (!nonce) return tag;
  if (tag.type !== 'script' && tag.type !== 'style') return tag;

  const attrs = tag.type === 'script' ? tag.attrs : (tag.attrs ?? {});
  if (attrs.nonce !== undefined && attrs.nonce !== null && attrs.nonce !== '')
    return tag;

  const withNonce: FaceAttributes = { ...attrs, nonce };
  return tag.type === 'script'
    ? { ...tag, attrs: withNonce }
    : { ...tag, attrs: withNonce };
}

function dedupeHeadTags(tags: FaceHeadTag[]): FaceHeadTag[] {
  const seen = new Set<string>();
  const out: FaceHeadTag[] = [];

  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const tag = tags[i];
    if (!tag) continue;

    const key = dedupeKey(tag);
    if (!key) {
      out.push(tag);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }

  out.reverse();
  return out;
}

export function normalizeHeadTags(
  tags: FaceHeadTag[],
  options: NormalizeHeadTagsOptions = {},
): FaceHeadTag[] {
  const nonce = options.cspNonce ?? null;
  const withNonce = nonce ? tags.map((t) => applyCspNonce(t, nonce)) : tags;
  const deduped = dedupeHeadTags(withNonce);

  const charset: FaceHeadTag[] = [];
  const title: FaceHeadTag[] = [];
  const rest: FaceHeadTag[] = [];

  for (const tag of deduped) {
    if (isCharsetMeta(tag)) {
      charset.push(tag);
      continue;
    }
    if (tag.type === 'title') {
      title.push(tag);
      continue;
    }
    rest.push(tag);
  }

  return [...charset, ...title, ...rest];
}

export function renderHeadTag(tag: FaceHeadTag): string {
  switch (tag.type) {
    case 'raw':
      return tag.html;
    case 'title':
      return `<title>${escapeHTML(tag.text)}</title>`;
    case 'meta':
      return `<meta${renderAttributes(tag.attrs)}>`;
    case 'link':
      return `<link${renderAttributes(tag.attrs)}>`;
    case 'script': {
      const body = tag.body === undefined ? '' : escapeScriptText(tag.body);
      return `<script${renderAttributes(tag.attrs)}>${body}</script>`;
    }
    case 'style': {
      const body = escapeStyleText(tag.cssText);
      return `<style${renderAttributes(tag.attrs)}>${body}</style>`;
    }
  }
}

export function renderFaceHead(
  out: FaceRenderResult,
  options: RenderFaceHeadOptions = {},
): string {
  const tags: FaceHeadTag[] = [];
  const escapedLegacyHeadHtml = out.head?.html
    ? escapeHTML(out.head.html)
    : null;

  if (out.headTags) tags.push(...out.headTags);

  if (out.styleTags) {
    for (const styleTag of out.styleTags) {
      tags.push(
        styleTag.attrs
          ? { type: 'style', cssText: styleTag.cssText, attrs: styleTag.attrs }
          : { type: 'style', cssText: styleTag.cssText },
      );
    }
  }

  if (out.head?.title) {
    tags.push({ type: 'title', text: out.head.title });
  }
  if (escapedLegacyHeadHtml) {
    tags.push({ type: 'raw', html: escapedLegacyHeadHtml });
  }

  if (out.hydration) {
    if (isExternalHydration(out.hydration)) {
      const dataUrl = requireSafeHttpUrl(out.hydration.dataUrl, 'external hydration dataUrl');
      const bootstrapModule = requireSafeHttpUrl(
        out.hydration.bootstrapModule,
        'external hydration bootstrapModule',
      );
      tags.push({
        type: 'link',
        attrs: {
          id: '__FACETHEORY_DATA_URL__',
          rel: 'facetheory-hydration',
          href: dataUrl,
          type: 'application/json',
        },
      });
      tags.push({
        type: 'script',
        attrs: { type: 'module', src: bootstrapModule },
      });
    } else {
      tags.push({
        type: 'script',
        attrs: { id: '__FACETHEORY_DATA__', type: 'application/json' },
        body: safeJson(out.hydration.data),
      });
      const bootstrapModule = safeHttpUrl(out.hydration.bootstrapModule);
      if (bootstrapModule) {
        tags.push({
          type: 'script',
          attrs: { type: 'module', src: bootstrapModule },
        });
      }
    }
  }

  const validationOptions: {
    allowedOrigin?: string | URL;
    allowedEscapedRawHtml?: string | null;
  } = { allowedEscapedRawHtml: escapedLegacyHeadHtml };
  if (options.allowedOrigin !== undefined) {
    validationOptions.allowedOrigin = options.allowedOrigin;
  }
  validateStrictHeadTags(tags, out.csp, validationOptions);

  return normalizeHeadTags(tags, { cspNonce: options.cspNonce ?? null })
    .map(renderHeadTag)
    .join('');
}
