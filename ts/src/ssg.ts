import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createFaceApp } from './app.js';
import { renderHTMLDocument } from './html.js';
import type { FaceBody, FaceModule, Headers } from './types.js';
import { normalizePath } from './types.js';

export type SsgTrailingSlashPolicy = 'always' | 'never';

export interface BuildSsgSiteOptions {
  faces: FaceModule[];
  outDir: string;
  clean?: boolean;
  trailingSlash?: SsgTrailingSlashPolicy;
  write404Fallback?: boolean;
  emitHydrationData?: boolean;
  allowNetwork?: boolean;
  fetch?: typeof fetch;
  assetManifestPath?: string;
}

export interface SsgPageEntry {
  routePattern: string;
  path: string;
  file: string;
  status: number;
  contentType: string;
  hydrationDataFile?: string;
}

export interface SsgManifest {
  version: 1;
  routePathPolicy: 'normalized';
  htmlOutputPolicy: 'index-or-html';
  trailingSlash: SsgTrailingSlashPolicy;
  assetManifest: {
    format: 'vite';
    path: string;
  };
  notFoundFile?: string;
  pages: SsgPageEntry[];
}

export interface BuildSsgSiteResult {
  outDir: string;
  manifestFile: string;
  pages: SsgPageEntry[];
  notFoundFile?: string;
}

interface SsgRouteSegment {
  kind: 'static' | 'param' | 'proxy_plus' | 'proxy_star';
  value: string;
}

interface PlannedPage {
  routePattern: string;
  path: string;
}

const DEFAULT_ASSET_MANIFEST_PATH = '.vite/manifest.json';
const DEFAULT_404_HTML = renderHTMLDocument({
  head: '<title>Not Found</title>',
  body: '<h1>Not Found</h1><template data-facetheory-ssg-404="true"></template>',
});

export async function buildSsgSite(options: BuildSsgSiteOptions): Promise<BuildSsgSiteResult> {
  const outDir = path.resolve(options.outDir);
  const clean = options.clean ?? true;
  const trailingSlash = options.trailingSlash ?? 'always';
  const write404Fallback = options.write404Fallback ?? true;
  const emitHydrationData = options.emitHydrationData ?? false;
  const assetManifestPath = options.assetManifestPath ?? DEFAULT_ASSET_MANIFEST_PATH;
  const allowNetwork = options.allowNetwork ?? false;
  const fetchImpl = options.fetch;

  if (clean) {
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });

  const app = createFaceApp({ faces: options.faces });
  const plannedPages = await planSsgPages(options.faces);

  const builtPages: SsgPageEntry[] = [];
  const htmlByPath = new Map<string, string>();

  await withFetchGuard(
    {
      allowNetwork,
      ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
    },
    async () => {
    for (const page of plannedPages) {
      const response = await app.handle({ method: 'GET', path: page.path });
      if (response.status >= 500) {
        const networkHint =
          !allowNetwork && fetchImpl === undefined
            ? ' Network access is disabled by default during SSG; mock fetch or set allowNetwork:true.'
            : '';
        throw new Error(
          `SSG route "${page.path}" returned status ${response.status}; build aborted.${networkHint}`,
        );
      }
      if (response.isBase64) {
        throw new Error(
          `SSG route "${page.path}" returned isBase64=true; only text/html responses are supported`,
        );
      }

      const body = await collectBody(response.body);
      const html = new TextDecoder().decode(body);
      const file = ssgFilePathForRoute(page.path, trailingSlash);
      const contentType = firstHeaderValue(response.headers, 'content-type') ?? 'text/html; charset=utf-8';

      await writeOutFile(outDir, file, html);

      let hydrationDataFile: string | undefined;
      if (emitHydrationData) {
        const hydrationJson = extractHydrationDataJson(html);
        if (hydrationJson !== null) {
          hydrationDataFile = ssgHydrationDataFilePathForRoute(page.path);
          await writeOutFile(outDir, hydrationDataFile, `${hydrationJson}\n`);
        }
      }

      const entry: SsgPageEntry = {
        routePattern: page.routePattern,
        path: page.path,
        file,
        status: response.status,
        contentType,
      };
      if (hydrationDataFile !== undefined) {
        entry.hydrationDataFile = hydrationDataFile;
      }
      builtPages.push(entry);
      htmlByPath.set(page.path, html);
    }
    },
  );

  builtPages.sort((left, right) => left.path.localeCompare(right.path));

  let notFoundFile: string | undefined;
  if (write404Fallback) {
    const notFoundHtml = htmlByPath.get('/404') ?? DEFAULT_404_HTML;
    notFoundFile = '404.html';
    await writeOutFile(outDir, notFoundFile, notFoundHtml);
  }

  const manifest: SsgManifest = {
    version: 1,
    routePathPolicy: 'normalized',
    htmlOutputPolicy: 'index-or-html',
    trailingSlash,
    assetManifest: {
      format: 'vite',
      path: assetManifestPath,
    },
    pages: builtPages,
  };
  if (notFoundFile !== undefined) {
    manifest.notFoundFile = notFoundFile;
  }

  const manifestFile = '.facetheory/ssg-manifest.json';
  await writeOutFile(outDir, manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    outDir,
    manifestFile,
    pages: builtPages,
    ...(notFoundFile !== undefined ? { notFoundFile } : {}),
  };
}

export async function planSsgPages(faces: FaceModule[]): Promise<PlannedPage[]> {
  const ssgFaces = faces
    .filter((face) => face.mode === 'ssg')
    .slice()
    .sort((left, right) => normalizePath(left.route).localeCompare(normalizePath(right.route)));

  const planned: PlannedPage[] = [];
  const seenPaths = new Set<string>();

  for (const face of ssgFaces) {
    const routePattern = normalizePath(face.route);
    const routeSegments = parseRouteSegments(routePattern);
    const hasDynamicSegments = routeSegments.some((segment) => segment.kind !== 'static');

    if (!hasDynamicSegments) {
      const pathForRoute = normalizePath(routePattern);
      if (seenPaths.has(pathForRoute)) {
        throw new Error(`duplicate SSG output path "${pathForRoute}"`);
      }
      seenPaths.add(pathForRoute);
      planned.push({ routePattern, path: pathForRoute });
      continue;
    }

    if (!face.generateStaticParams) {
      throw new Error(
        `SSG route "${routePattern}" has dynamic segments but no generateStaticParams()`,
      );
    }

    const paramsList = await face.generateStaticParams();
    const pathsForFace: string[] = [];
    for (const params of paramsList) {
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        throw new Error(
          `generateStaticParams() for route "${routePattern}" returned a non-object entry`,
        );
      }
      const resolvedPath = resolveRoutePath(routeSegments, params as Record<string, string>);
      pathsForFace.push(resolvedPath);
    }

    pathsForFace.sort((left, right) => left.localeCompare(right));
    for (const pathForRoute of pathsForFace) {
      if (seenPaths.has(pathForRoute)) {
        throw new Error(`duplicate SSG output path "${pathForRoute}"`);
      }
      seenPaths.add(pathForRoute);
      planned.push({ routePattern, path: pathForRoute });
    }
  }

  return planned;
}

export function ssgFilePathForRoute(
  routePath: string,
  trailingSlash: SsgTrailingSlashPolicy = 'always',
): string {
  const normalized = normalizePath(routePath);
  if (normalized === '/') return 'index.html';

  const stripped = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!stripped) return 'index.html';
  if (trailingSlash === 'never') return `${stripped}.html`;
  return `${stripped}/index.html`;
}

export function ssgHydrationDataFilePathForRoute(routePath: string): string {
  const normalized = normalizePath(routePath);
  const stripped = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!stripped) return '_facetheory/data/index.json';
  return `_facetheory/data/${stripped}.json`;
}

function parseRouteSegments(routePattern: string): SsgRouteSegment[] {
  const normalized = normalizePath(routePattern);
  if (normalized === '/') return [];

  const parts = normalized.replace(/^\/+/, '').split('/');
  return parts.map((part) => {
    if (part.startsWith('{') && part.endsWith('}')) {
      const token = part.slice(1, -1);
      if (token.endsWith('+')) return { kind: 'proxy_plus', value: token.slice(0, -1) };
      if (token.endsWith('*')) return { kind: 'proxy_star', value: token.slice(0, -1) };
      return { kind: 'param', value: token };
    }
    return { kind: 'static', value: part };
  });
}

function resolveRoutePath(
  segments: SsgRouteSegment[],
  params: Record<string, string>,
): string {
  if (segments.length === 0) return '/';

  const pathParts: string[] = [];

  for (const segment of segments) {
    if (segment.kind === 'static') {
      pathParts.push(segment.value);
      continue;
    }

    const rawValue = params[segment.value];
    const value = rawValue === undefined ? '' : String(rawValue);

    if (segment.kind === 'proxy_plus') {
      if (!value) {
        throw new Error(`missing required proxy param "${segment.value}"`);
      }
      const proxyParts = value.split('/').filter((part) => part.length > 0);
      if (proxyParts.length === 0) {
        throw new Error(`missing required proxy param "${segment.value}"`);
      }
      pathParts.push(...proxyParts.map((part) => encodeURIComponent(part)));
      continue;
    }

    if (segment.kind === 'proxy_star') {
      if (!value) continue;
      const proxyParts = value.split('/').filter((part) => part.length > 0);
      pathParts.push(...proxyParts.map((part) => encodeURIComponent(part)));
      continue;
    }

    if (!value) {
      throw new Error(`missing required route param "${segment.value}"`);
    }
    pathParts.push(encodeURIComponent(value));
  }

  if (pathParts.length === 0) return '/';
  return `/${pathParts.join('/')}`;
}

async function collectBody(body: FaceBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function firstHeaderValue(headers: Headers, key: string): string | null {
  const values = headers[key] ?? headers[key.toLowerCase()] ?? [];
  if (!values.length) return null;
  return values[0] ?? null;
}

async function writeOutFile(outDir: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.resolve(outDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function extractHydrationDataJson(html: string): string | null {
  const match = html.match(
    /<script[^>]*id=(?:"|')__FACETHEORY_DATA__(?:"|')[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;
  const json = match[1]?.trim() ?? '';
  return json.length > 0 ? json : null;
}

async function withFetchGuard(
  options: { allowNetwork: boolean; fetch?: typeof fetch },
  fn: () => Promise<void>,
): Promise<void> {
  const globalRef = globalThis as { fetch?: typeof fetch };
  const originalFetch = globalRef.fetch;

  const explicitFetch = options.fetch;
  const hasExplicitFetch = explicitFetch !== undefined;
  const shouldBlockNetwork = !options.allowNetwork && !hasExplicitFetch;

  if (explicitFetch !== undefined) {
    globalRef.fetch = explicitFetch;
  } else if (shouldBlockNetwork) {
    globalRef.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const target =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      throw new Error(
        `SSG network access is disabled. Mock fetch in buildSsgSite() or set allowNetwork:true (attempted "${target}")`,
      );
    };
  }

  try {
    await fn();
  } finally {
    if (originalFetch !== undefined) {
      globalRef.fetch = originalFetch;
    } else {
      delete globalRef.fetch;
    }
  }
}
