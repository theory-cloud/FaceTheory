import type { FaceHeadTag, FaceHydration } from './types.js';

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

export function viteHydrationForEntry(
  manifest: ViteManifest,
  entry: string,
  data: unknown,
  options: ViteAssetsOptions = {},
): FaceHydration {
  const { bootstrapModule } = viteAssetsForEntry(manifest, entry, options);
  return { data, bootstrapModule };
}
