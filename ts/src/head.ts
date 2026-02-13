import { escapeHTML, safeJson } from './html.js';
import type { FaceAttributes, FaceHeadTag, FaceRenderResult } from './types.js';

export interface RenderFaceHeadOptions {
  cspNonce?: string | null;
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
  return tag.type === 'meta' && tag.attrs.charset !== undefined && tag.attrs.charset !== null;
}

function dedupeKey(tag: FaceHeadTag): string | null {
  switch (tag.type) {
    case 'title':
      return 'title';
    case 'meta': {
      const { attrs } = tag;
      if (attrs.charset !== undefined && attrs.charset !== null) return 'meta:charset';
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
      if (typeof dataEmotion === 'string') return `style:data-emotion:${dataEmotion}`;
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
  if (attrs.nonce !== undefined && attrs.nonce !== null && attrs.nonce !== '') return tag;

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
  if (out.head?.html) {
    tags.push({ type: 'raw', html: out.head.html });
  }

  if (out.hydration) {
    tags.push({
      type: 'script',
      attrs: { id: '__FACETHEORY_DATA__', type: 'application/json' },
      body: safeJson(out.hydration.data),
    });
    tags.push({
      type: 'script',
      attrs: { type: 'module', src: out.hydration.bootstrapModule },
    });
  }

  return normalizeHeadTags(tags, { cspNonce: options.cspNonce ?? null })
    .map(renderHeadTag)
    .join('');
}
