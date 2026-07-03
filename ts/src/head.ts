import { escapeHTML, renderAttributes, safeJson } from './html.js';
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

export type HeadTitleTemplate = string | ((title: string) => string);

export interface TitleTagOptions {
  /**
   * Template applied to the title before emission. String templates must contain
   * `%s`; function templates receive the already-normalized title text.
   */
  template?: HeadTitleTemplate;
}

export type HeadMetaContent = string | number | boolean;

export type HeadMetaExtraAttributes = Omit<
  FaceAttributes,
  'charset' | 'content' | 'http-equiv' | 'name' | 'property'
>;

export type HeadLinkExtraAttributes = Omit<FaceAttributes, 'href' | 'rel'>;

export interface OpenGraphOptions {
  title?: HeadMetaContent;
  type?: HeadMetaContent;
  url?: HeadMetaContent;
  image?: HeadMetaContent;
  description?: HeadMetaContent;
  siteName?: HeadMetaContent;
  locale?: HeadMetaContent;
  determiner?: HeadMetaContent;
  additional?: Record<string, HeadMetaContent | null | undefined>;
  attrs?: HeadMetaExtraAttributes;
}

export interface TwitterCardOptions {
  card: HeadMetaContent;
  site?: HeadMetaContent;
  creator?: HeadMetaContent;
  title?: HeadMetaContent;
  description?: HeadMetaContent;
  image?: HeadMetaContent;
  imageAlt?: HeadMetaContent;
  additional?: Record<string, HeadMetaContent | null | undefined>;
  attrs?: HeadMetaExtraAttributes;
}

export interface JsonLdOptions {
  /**
   * Optional request CSP nonce. `renderFaceHead(..., { cspNonce })` also applies
   * the nonce automatically, so most callers should pass the request nonce at
   * render time rather than storing it in reusable head tag arrays.
   */
  nonce?: string | null;
  id?: string;
  attrs?: Omit<FaceAttributes, 'nonce' | 'type'>;
}

const JSON_LD_SCRIPT_TYPE = 'application/ld+json';
const JSON_LD_DATA_ATTRIBUTE = 'data-facetheory-jsonld';

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

function normalizeOptionalNonce(nonce: string | null | undefined): string | null {
  if (nonce === undefined || nonce === null) return null;
  const trimmed = String(nonce).trim();
  if (!trimmed) return null;
  if (/[\s;'\r\n]/.test(trimmed)) {
    throw new Error('FaceTheory strict CSP nonce contains unsafe characters');
  }
  return trimmed;
}

function normalizeScriptType(value: unknown): string {
  const [mediaType = ''] = String(value ?? '').split(';', 1);
  return mediaType.trim().toLowerCase();
}

function isJsonLdScriptTag(tag: FaceHeadTag): boolean {
  return (
    tag.type === 'script' &&
    normalizeScriptType(tag.attrs.type) === JSON_LD_SCRIPT_TYPE
  );
}

function scriptBodyForRender(
  tag: Extract<FaceHeadTag, { type: 'script' }>,
): string | undefined {
  if (tag.body !== undefined) return tag.body;
  if (!isJsonLdScriptTag(tag)) return undefined;
  const jsonLdBody = tag.attrs[JSON_LD_DATA_ATTRIBUTE];
  return typeof jsonLdBody === 'string' ? jsonLdBody : undefined;
}

function scriptAttrsForRender(
  tag: Extract<FaceHeadTag, { type: 'script' }>,
): FaceAttributes {
  if (!isJsonLdScriptTag(tag)) return tag.attrs;
  const attrs = { ...tag.attrs };
  delete attrs[JSON_LD_DATA_ATTRIBUTE];
  return attrs;
}

function isNonceCarriedJsonLdScriptTag(
  tag: FaceHeadTag,
  expectedNonce: string | null,
): boolean {
  if (!expectedNonce || tag.type !== 'script' || !isJsonLdScriptTag(tag)) {
    return false;
  }
  if (scriptBodyForRender(tag) === undefined) return false;
  const nonce = tag.attrs.nonce;
  return typeof nonce === 'string' && nonce === expectedNonce;
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
    cspNonce?: string | null;
  } = {},
): void {
  if (!policy) return;

  const allowedOrigin = normalizeAllowedOrigin(options.allowedOrigin);
  const allowedEscapedRawHtml = options.allowedEscapedRawHtml ?? null;
  const expectedNonce = normalizeOptionalNonce(options.cspNonce);

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
        if (
          isCspDisabled(policy, 'inlineScripts') &&
          scriptBodyForRender(tag) !== undefined &&
          !isNonceCarriedJsonLdScriptTag(tag, expectedNonce)
        ) {
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

function normalizeTitleText(value: string): string {
  return String(value ?? '').trim();
}

function applyTitleTemplate(title: string, template: HeadTitleTemplate | undefined): string {
  const normalizedTitle = normalizeTitleText(title);
  if (template === undefined) return normalizedTitle;

  if (typeof template === 'function') {
    return String(template(normalizedTitle));
  }

  const templateText = String(template);
  if (!templateText.includes('%s')) {
    throw new Error('FaceTheory title template must include a %s placeholder');
  }
  return templateText.replaceAll('%s', () => normalizedTitle);
}

function normalizeMetaContent(value: HeadMetaContent): string {
  return String(value);
}

function appendMetaTag(
  tags: FaceHeadTag[],
  key: 'name' | 'property',
  value: string,
  content: HeadMetaContent,
  attrs: HeadMetaExtraAttributes | undefined,
): void {
  tags.push({
    type: 'meta',
    attrs: {
      ...(attrs ?? {}),
      [key]: value,
      content: normalizeMetaContent(content),
    },
  });
}

function appendMetaValues(
  tags: FaceHeadTag[],
  key: 'name' | 'property',
  prefix: string,
  name: string,
  value: HeadMetaContent | null | undefined,
  attrs: HeadMetaExtraAttributes | undefined,
): void {
  if (value === undefined || value === null) return;
  const property = `${prefix}:${name}`;
  appendMetaTag(tags, key, property, value, attrs);
}

function appendAdditionalMetaValues(
  tags: FaceHeadTag[],
  key: 'name' | 'property',
  prefix: string,
  additional:
    | Record<string, HeadMetaContent | null | undefined>
    | undefined,
  attrs: HeadMetaExtraAttributes | undefined,
): void {
  if (!additional) return;
  for (const name of Object.keys(additional).sort()) {
    appendMetaValues(tags, key, prefix, name, additional[name], attrs);
  }
}

export function titleTag(title: string, options: TitleTagOptions = {}): FaceHeadTag {
  return { type: 'title', text: applyTitleTemplate(title, options.template) };
}

export function metaTag(
  name: string,
  content: HeadMetaContent,
  attrs: HeadMetaExtraAttributes = {},
): FaceHeadTag {
  return {
    type: 'meta',
    attrs: {
      ...attrs,
      name,
      content: normalizeMetaContent(content),
    },
  };
}

export function openGraph(options: OpenGraphOptions): FaceHeadTag[] {
  const tags: FaceHeadTag[] = [];
  const attrs = options.attrs;
  appendMetaValues(tags, 'property', 'og', 'title', options.title, attrs);
  appendMetaValues(tags, 'property', 'og', 'type', options.type, attrs);
  appendMetaValues(tags, 'property', 'og', 'url', options.url, attrs);
  appendMetaValues(tags, 'property', 'og', 'image', options.image, attrs);
  appendMetaValues(
    tags,
    'property',
    'og',
    'description',
    options.description,
    attrs,
  );
  appendMetaValues(tags, 'property', 'og', 'site_name', options.siteName, attrs);
  appendMetaValues(tags, 'property', 'og', 'locale', options.locale, attrs);
  appendMetaValues(tags, 'property', 'og', 'determiner', options.determiner, attrs);
  appendAdditionalMetaValues(tags, 'property', 'og', options.additional, attrs);
  return tags;
}

export function twitterCard(options: TwitterCardOptions): FaceHeadTag[] {
  const tags: FaceHeadTag[] = [];
  const attrs = options.attrs;
  appendMetaValues(tags, 'name', 'twitter', 'card', options.card, attrs);
  appendMetaValues(tags, 'name', 'twitter', 'site', options.site, attrs);
  appendMetaValues(tags, 'name', 'twitter', 'creator', options.creator, attrs);
  appendMetaValues(tags, 'name', 'twitter', 'title', options.title, attrs);
  appendMetaValues(
    tags,
    'name',
    'twitter',
    'description',
    options.description,
    attrs,
  );
  appendMetaValues(tags, 'name', 'twitter', 'image', options.image, attrs);
  appendMetaValues(tags, 'name', 'twitter', 'image:alt', options.imageAlt, attrs);
  appendAdditionalMetaValues(tags, 'name', 'twitter', options.additional, attrs);
  return tags;
}

export function canonical(
  href: string,
  attrs: HeadLinkExtraAttributes = {},
): FaceHeadTag {
  return {
    type: 'link',
    attrs: {
      ...attrs,
      rel: 'canonical',
      href: requireSafeHttpUrl(href, 'canonical href'),
    },
  };
}

export function jsonLd(data: unknown, options: JsonLdOptions = {}): FaceHeadTag {
  const attrs: FaceAttributes = {
    ...(options.attrs ?? {}),
    type: JSON_LD_SCRIPT_TYPE,
  };
  if (options.id) attrs.id = options.id;
  const nonce = normalizeOptionalNonce(options.nonce);
  if (nonce) attrs.nonce = nonce;

  return {
    type: 'script',
    attrs: {
      ...attrs,
      [JSON_LD_DATA_ATTRIBUTE]: safeJson(data),
    },
  };
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
      const body = scriptBodyForRender(tag);
      const renderedBody = body === undefined ? '' : escapeScriptText(body);
      return `<script${renderAttributes(scriptAttrsForRender(tag))}>${renderedBody}</script>`;
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
    cspNonce?: string | null;
  } = { allowedEscapedRawHtml: escapedLegacyHeadHtml };
  if (options.allowedOrigin !== undefined) {
    validationOptions.allowedOrigin = options.allowedOrigin;
  }
  validationOptions.cspNonce = options.cspNonce ?? null;
  const tagsWithNonce = options.cspNonce
    ? tags.map((tag) => applyCspNonce(tag, options.cspNonce ?? null))
    : tags;
  validateStrictHeadTags(tagsWithNonce, out.csp, validationOptions);

  return normalizeHeadTags(tagsWithNonce, { cspNonce: options.cspNonce ?? null })
    .map(renderHeadTag)
    .join('');
}
