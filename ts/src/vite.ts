import type { FaceExternalHydration, FaceHeadTag, FaceHydration } from './types.js';

export interface ViteManifestChunk {
  file: string;
  css?: ReadonlyArray<string>;
  assets?: ReadonlyArray<string>;
  imports?: ReadonlyArray<string>;
  dynamicImports?: ReadonlyArray<string>;
  isEntry?: boolean;
  src?: string;
}

export type ViteManifest = Record<string, ViteManifestChunk>;

export interface ViteAssetsOptions {
  base?: string;
  crossorigin?: boolean;
  includeAssets?: boolean;
  dynamicImports?: DynamicImportPolicy;
}

export interface ViteDevAssetsOptions {
  base?: string;
  hmrClient?: boolean;
}

export interface ViteExternalHydrationOptions extends ViteAssetsOptions {
  dataUrl: string;
  allowedOrigin?: string | URL;
}

export type DynamicImportPolicy = 'ignore';

function joinBase(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

function collectImports(manifest: ViteManifest, entry: string): string[] {
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);

    const chunk = manifest[key];
    if (!chunk) return;

    const imports = chunk.imports ?? [];
    for (const childKey of imports) {
      visit(childKey);
    }

    ordered.push(key);
  };

  visit(entry);
  ordered.pop();

  return ordered;
}

function collectImportKeysWithEntry(manifest: ViteManifest, entry: string): string[] {
  return [...collectImports(manifest, entry), entry];
}

function collectCss(manifest: ViteManifest, entry: string): string[] {
  const keys = collectImportKeysWithEntry(manifest, entry);
  const seen = new Set<string>();
  const css: string[] = [];

  for (const key of keys) {
    const chunk = manifest[key];
    if (!chunk?.css) continue;
    for (const file of chunk.css) {
      if (seen.has(file)) continue;
      seen.add(file);
      css.push(file);
    }
  }

  return css;
}

function collectImportFiles(manifest: ViteManifest, entry: string): string[] {
  const keys = collectImports(manifest, entry);
  const seen = new Set<string>();
  const files: string[] = [];

  for (const key of keys) {
    const chunk = manifest[key];
    if (!chunk?.file) continue;
    if (seen.has(chunk.file)) continue;
    seen.add(chunk.file);
    files.push(chunk.file);
  }

  return files;
}

function collectAssets(manifest: ViteManifest, entry: string): string[] {
  const keys = collectImportKeysWithEntry(manifest, entry);
  const seen = new Set<string>();
  const assets: string[] = [];

  for (const key of keys) {
    const chunk = manifest[key];
    if (!chunk?.assets) continue;
    for (const file of chunk.assets) {
      if (seen.has(file)) continue;
      seen.add(file);
      assets.push(file);
    }
  }

  return assets;
}

function requireEntryChunk(manifest: ViteManifest, entry: string): ViteManifestChunk {
  const chunk = manifest[entry];
  if (!chunk) {
    throw new Error(`vite manifest missing entry: ${entry}`);
  }
  if (!chunk.file) {
    throw new Error(`vite manifest entry missing file: ${entry}`);
  }
  return chunk;
}

function normalizeDevEntryPath(entry: string): string {
  const trimmed = String(entry ?? '').trim();
  if (!trimmed) {
    throw new Error('vite dev entry must not be empty');
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isAbsoluteOrProtocolRelativeUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//');
}

const SAME_ORIGIN_DATA_URL_SENTINEL = 'https://facetheory.invalid';

function originFromAbsoluteHttpUrl(value: string | URL | undefined): string | null {
  if (value === undefined) return null;
  const normalized = String(value);
  if (!isAbsoluteOrProtocolRelativeUrl(normalized)) return null;
  const parsed = new URL(normalized, SAME_ORIGIN_DATA_URL_SENTINEL);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.origin;
}

function assertSameOriginDataUrl(
  dataUrl: string,
  allowedOrigin: string | null,
): string {
  const trimmed = String(dataUrl ?? '').trim();
  if (!trimmed) {
    throw new Error('external hydration dataUrl must not be empty');
  }

  // Resolve against the real allowed origin when available so WHATWG/browser
  // network-path forms such as `/\host` and `\\host` cannot hide behind a
  // string-prefix relative-url classifier.
  const parseBase = allowedOrigin ?? SAME_ORIGIN_DATA_URL_SENTINEL;
  let parsed: URL;
  try {
    parsed = new URL(trimmed, parseBase);
  } catch {
    throw new Error(`external hydration dataUrl is invalid: ${trimmed}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `external hydration dataUrl must be http(s) or same-origin: ${trimmed}`,
    );
  }

  if (!allowedOrigin) {
    if (
      !isAbsoluteOrProtocolRelativeUrl(trimmed) &&
      parsed.origin === SAME_ORIGIN_DATA_URL_SENTINEL
    ) {
      return trimmed;
    }
    throw new Error(
      `external hydration dataUrl must be same-origin or relative: ${trimmed}`,
    );
  }

  if (parsed.origin !== allowedOrigin) {
    throw new Error(
      `external hydration dataUrl resolved cross-origin: expected ${allowedOrigin}, received ${parsed.origin}`,
    );
  }

  return trimmed;
}

function stripSearchAndHash(path: string): string {
  const hashIndex = path.indexOf('#');
  const noHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const searchIndex = noHash.indexOf('?');
  return searchIndex >= 0 ? noHash.slice(0, searchIndex) : noHash;
}

function mimeTypeForFont(file: string): string | null {
  const normalized = stripSearchAndHash(file).toLowerCase();
  if (normalized.endsWith('.woff2')) return 'font/woff2';
  if (normalized.endsWith('.woff')) return 'font/woff';
  if (normalized.endsWith('.ttf')) return 'font/ttf';
  if (normalized.endsWith('.otf')) return 'font/otf';
  if (normalized.endsWith('.eot')) return 'application/vnd.ms-fontobject';
  return null;
}

function assetHintTagAttrs(
  href: string,
  file: string,
  crossorigin: boolean,
): Record<string, string | boolean> {
  const normalized = stripSearchAndHash(file).toLowerCase();
  const attrs: Record<string, string | boolean> = { href };

  if (/\.(png|apng|avif|bmp|gif|ico|jpeg|jpg|svg|tif|tiff|webp)$/.test(normalized)) {
    attrs.rel = 'preload';
    attrs.as = 'image';
    if (crossorigin) attrs.crossorigin = true;
    return attrs;
  }

  if (/\.(woff2?|ttf|otf|eot)$/.test(normalized)) {
    attrs.rel = 'preload';
    attrs.as = 'font';
    const mimeType = mimeTypeForFont(file);
    if (mimeType) attrs.type = mimeType;
    if (crossorigin) attrs.crossorigin = true;
    return attrs;
  }

  if (/\.(aac|flac|m4a|mp3|oga|ogg|wav)$/.test(normalized)) {
    attrs.rel = 'preload';
    attrs.as = 'audio';
    if (crossorigin) attrs.crossorigin = true;
    return attrs;
  }

  if (/\.(m4v|mov|mp4|ogv|webm)$/.test(normalized)) {
    attrs.rel = 'preload';
    attrs.as = 'video';
    if (crossorigin) attrs.crossorigin = true;
    return attrs;
  }

  attrs.rel = 'prefetch';
  if (crossorigin) attrs.crossorigin = true;
  return attrs;
}

export function viteAssetsForEntry(
  manifest: ViteManifest,
  entry: string,
  options: ViteAssetsOptions = {},
): { bootstrapModule: string; headTags: FaceHeadTag[] } {
  const base = options.base ?? '/';
  const crossorigin = options.crossorigin ?? true;
  const includeAssets = options.includeAssets ?? false;
  const dynamicImportPolicy = options.dynamicImports ?? 'ignore';

  if (dynamicImportPolicy !== 'ignore') {
    throw new Error(`unsupported Vite dynamic import policy: ${String(dynamicImportPolicy)}`);
  }

  const entryChunk = requireEntryChunk(manifest, entry);

  const bootstrapModule = joinBase(base, entryChunk.file);
  const preloadFiles = collectImportFiles(manifest, entry);
  const cssFiles = collectCss(manifest, entry);
  const assetFiles = includeAssets ? collectAssets(manifest, entry) : [];

  const headTags: FaceHeadTag[] = [];
  const seenHrefs = new Set<string>();

  const pushLinkTag = (attrs: Record<string, string | boolean>) => {
    const href = attrs.href;
    if (typeof href !== 'string' || href.length === 0) return;
    if (seenHrefs.has(href)) return;
    seenHrefs.add(href);
    headTags.push({
      type: 'link',
      attrs,
    });
  };

  for (const file of preloadFiles) {
    pushLinkTag({
      rel: 'modulepreload',
      href: joinBase(base, file),
      ...(crossorigin ? { crossorigin: true } : {}),
    });
  }

  for (const file of cssFiles) {
    pushLinkTag({
      rel: 'stylesheet',
      href: joinBase(base, file),
      ...(crossorigin ? { crossorigin: true } : {}),
    });
  }

  for (const file of assetFiles) {
    const href = joinBase(base, file);
    pushLinkTag(assetHintTagAttrs(href, file, crossorigin));
  }

  return { bootstrapModule, headTags };
}

/**
 * Dynamic import policy: FaceTheory currently ignores `dynamicImports` from Vite manifests.
 * This avoids prefetch noise and keeps head output deterministic; prefetch behavior can be
 * added later under a new explicit policy value.
 */
export function viteDynamicImportPolicy(): DynamicImportPolicy {
  return 'ignore';
}

export function viteDevAssetsForEntry(
  entry: string,
  options: ViteDevAssetsOptions = {},
): { bootstrapModule: string; headTags: FaceHeadTag[] } {
  const base = options.base ?? '/';
  const hmrClient = options.hmrClient ?? true;
  const normalizedEntry = normalizeDevEntryPath(entry);
  const bootstrapModule = joinBase(base, normalizedEntry);
  const headTags: FaceHeadTag[] = [];

  if (hmrClient) {
    headTags.push({
      type: 'script',
      attrs: {
        type: 'module',
        src: joinBase(base, '/@vite/client'),
      },
    });
  }

  return { bootstrapModule, headTags };
}

export function viteHydrationForEntry(
  manifest: ViteManifest,
  entry: string,
  data: unknown,
  options: ViteAssetsOptions = {},
): FaceHydration {
  const { bootstrapModule } = viteAssetsForEntry(manifest, entry, options);
  return { data, bootstrapModule };
}

export function viteDevHydrationForEntry(
  entry: string,
  data: unknown,
  options: ViteDevAssetsOptions = {},
): FaceHydration {
  const { bootstrapModule } = viteDevAssetsForEntry(entry, options);
  return { data, bootstrapModule };
}

export function externalHydrationForEntry(
  manifest: ViteManifest,
  entry: string,
  data: unknown,
  options: ViteExternalHydrationOptions,
): FaceExternalHydration {
  const { bootstrapModule } = viteAssetsForEntry(manifest, entry, options);
  const allowedOrigin =
    options.allowedOrigin !== undefined
      ? new URL(String(options.allowedOrigin)).origin
      : originFromAbsoluteHttpUrl(options.base);
  return {
    type: 'external',
    data,
    dataUrl: assertSameOriginDataUrl(options.dataUrl, allowedOrigin),
    bootstrapModule,
  };
}
