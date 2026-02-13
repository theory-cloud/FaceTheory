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
}

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

function collectCss(manifest: ViteManifest, entry: string): string[] {
  const keys = [...collectImports(manifest, entry), entry];
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

export function viteAssetsForEntry(
  manifest: ViteManifest,
  entry: string,
  options: ViteAssetsOptions = {},
): { bootstrapModule: string; headTags: FaceHeadTag[] } {
  const base = options.base ?? '/';
  const crossorigin = options.crossorigin ?? true;

  const entryChunk = requireEntryChunk(manifest, entry);

  const bootstrapModule = joinBase(base, entryChunk.file);
  const preloadFiles = collectImportFiles(manifest, entry);
  const cssFiles = collectCss(manifest, entry);

  const headTags: FaceHeadTag[] = [];

  for (const file of preloadFiles) {
    headTags.push({
      type: 'link',
      attrs: {
        rel: 'modulepreload',
        href: joinBase(base, file),
        ...(crossorigin ? { crossorigin: true } : {}),
      },
    });
  }

  for (const file of cssFiles) {
    headTags.push({
      type: 'link',
      attrs: {
        rel: 'stylesheet',
        href: joinBase(base, file),
        ...(crossorigin ? { crossorigin: true } : {}),
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
