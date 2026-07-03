import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createFaceApp } from './app.js';
import { renderHTMLDocument, safeJson } from './html.js';
import type {
  FaceBody,
  FaceHydration,
  FaceInlineHydration,
  FaceModule,
  FaceRenderResult,
  FaceHeaders,
} from './types.js';
import {
  normalizePath,
  trimLeadingSlashes,
  trimOuterSlashes,
} from './types.js';

export type SsgTrailingSlashPolicy = 'always' | 'never';

export interface BuildSsgSiteOptions {
  faces: FaceModule[];
  outDir: string;
  clean?: boolean;
  concurrency?: number;
  incremental?: boolean;
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
  contentHash?: string;
}

export interface SsgFailedRoute {
  routePattern: string;
  path: string;
  message: string;
  status?: number;
}

export interface SsgSkippedRoute {
  routePattern: string;
  path: string;
  file: string;
  reason: 'content-hash-match';
  contentHash: string;
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
  failedRoutes?: SsgFailedRoute[];
  skippedRoutes?: SsgSkippedRoute[];
}

interface SsgRouteSegment {
  kind: 'static' | 'param' | 'proxy_plus' | 'proxy_star';
  value: string;
}

interface PlannedPage {
  routePattern: string;
  path: string;
}

interface SsgHydrationSidecar {
  data: unknown;
}

type FaceApp = ReturnType<typeof createFaceApp>;

type SsgPageBuildOutcome =
  | {
      ok: true;
      entry: SsgPageEntry;
      html: string;
      skippedRoute?: SsgSkippedRoute;
    }
  | {
      ok: false;
      failure: SsgFailedRoute;
    };

class SsgRouteBuildError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SsgRouteBuildError';
    if (status !== undefined) {
      this.status = status;
    }
  }
}

export class SsgBuildFailedError extends Error {
  readonly failedRoutes: SsgFailedRoute[];
  readonly result: BuildSsgSiteResult & { failedRoutes: SsgFailedRoute[] };

  constructor(result: BuildSsgSiteResult & { failedRoutes: SsgFailedRoute[] }) {
    super(formatSsgBuildFailureMessage(result.failedRoutes));
    this.name = 'SsgBuildFailedError';
    this.failedRoutes = result.failedRoutes;
    this.result = result;
  }
}

const DEFAULT_ASSET_MANIFEST_PATH = '.vite/manifest.json';
const SSG_MANIFEST_FILE = '.facetheory/ssg-manifest.json';
const DEFAULT_404_HTML = renderHTMLDocument({
  head: '<title>Not Found</title>',
  body: '<h1>Not Found</h1><template data-facetheory-ssg-404="true"></template>',
});

export async function buildSsgSite(
  options: BuildSsgSiteOptions,
): Promise<BuildSsgSiteResult> {
  const outDir = path.resolve(options.outDir);
  const incremental = options.incremental ?? false;
  const clean = incremental ? false : (options.clean ?? true);
  const trailingSlash = options.trailingSlash ?? 'always';
  const write404Fallback = options.write404Fallback ?? true;
  const emitHydrationData = options.emitHydrationData ?? false;
  const concurrency = normalizeSsgConcurrency(options.concurrency ?? 1);
  const assetManifestPath =
    options.assetManifestPath ?? DEFAULT_ASSET_MANIFEST_PATH;
  const allowNetwork = options.allowNetwork ?? false;
  const fetchImpl = options.fetch;

  if (clean) {
    await rm(outDir, { recursive: true, force: true });
  }
  const previousManifest = incremental
    ? await readPreviousSsgManifest(outDir)
    : null;
  const previousPagesByPath = new Map(
    (previousManifest?.pages ?? []).map((entry) => [entry.path, entry]),
  );
  await mkdir(outDir, { recursive: true });

  const strictHydrationSidecars = new Map<string, SsgHydrationSidecar>();
  const app = createFaceApp({
    faces: withSsgStrictHydrationSidecars(
      options.faces,
      strictHydrationSidecars,
    ),
  });
  const plannedPages = await planSsgPages(options.faces);

  const builtPages: SsgPageEntry[] = [];
  const failedRoutes: SsgFailedRoute[] = [];
  const skippedRoutes: SsgSkippedRoute[] = [];
  const htmlByPath = new Map<string, string>();

  const buildOutcomes = await withFetchGuard(
    {
      allowNetwork,
      ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
    },
    async () =>
      mapWithConcurrency(plannedPages, concurrency, (page) => {
        const previousEntry = previousPagesByPath.get(page.path);
        return buildSsgPage({
          app,
          page,
          outDir,
          trailingSlash,
          emitHydrationData,
          strictHydrationSidecars,
          incremental,
          ...(previousEntry !== undefined ? { previousEntry } : {}),
          allowNetwork,
          hasFetchOverride: fetchImpl !== undefined,
        });
      }),
  );

  for (const outcome of buildOutcomes) {
    if (outcome.ok) {
      builtPages.push(outcome.entry);
      if (outcome.skippedRoute !== undefined) {
        skippedRoutes.push(outcome.skippedRoute);
      }
      htmlByPath.set(outcome.entry.path, outcome.html);
      continue;
    }
    failedRoutes.push(outcome.failure);
  }

  builtPages.sort((left, right) => left.path.localeCompare(right.path));
  failedRoutes.sort((left, right) => left.path.localeCompare(right.path));
  skippedRoutes.sort((left, right) => left.path.localeCompare(right.path));

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

  const manifestFile = SSG_MANIFEST_FILE;
  await writeOutFile(
    outDir,
    manifestFile,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const result: BuildSsgSiteResult = {
    outDir,
    manifestFile,
    pages: builtPages,
    ...(notFoundFile !== undefined ? { notFoundFile } : {}),
    ...(skippedRoutes.length > 0 ? { skippedRoutes } : {}),
  };

  if (failedRoutes.length > 0) {
    const failedResult: BuildSsgSiteResult & {
      failedRoutes: SsgFailedRoute[];
    } = {
      ...result,
      failedRoutes,
    };
    throw new SsgBuildFailedError(failedResult);
  }

  return result;
}

export async function planSsgPages(
  faces: FaceModule[],
): Promise<PlannedPage[]> {
  const ssgFaces = faces
    .filter((face) => face.mode === 'ssg')
    .slice()
    .sort((left, right) =>
      normalizePath(left.route).localeCompare(normalizePath(right.route)),
    );

  const planned: PlannedPage[] = [];
  const seenPaths = new Set<string>();

  for (const face of ssgFaces) {
    const routePattern = normalizePath(face.route);
    const routeSegments = parseRouteSegments(routePattern);
    const hasDynamicSegments = routeSegments.some(
      (segment) => segment.kind !== 'static',
    );

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
      const resolvedPath = resolveRoutePath(
        routeSegments,
        params as Record<string, string>,
      );
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

async function buildSsgPage(options: {
  app: FaceApp;
  page: PlannedPage;
  outDir: string;
  trailingSlash: SsgTrailingSlashPolicy;
  emitHydrationData: boolean;
  strictHydrationSidecars: Map<string, SsgHydrationSidecar>;
  incremental: boolean;
  previousEntry?: SsgPageEntry;
  allowNetwork: boolean;
  hasFetchOverride: boolean;
}): Promise<SsgPageBuildOutcome> {
  const {
    app,
    page,
    outDir,
    trailingSlash,
    emitHydrationData,
    strictHydrationSidecars,
    incremental,
    previousEntry,
    allowNetwork,
    hasFetchOverride,
  } = options;

  try {
    const response = await app.handle({ method: 'GET', path: page.path });
    if (response.status >= 500) {
      const networkHint =
        !allowNetwork && !hasFetchOverride
          ? ' Network access is disabled by default during SSG; mock fetch or set allowNetwork:true.'
          : '';
      throw new SsgRouteBuildError(
        `SSG route "${page.path}" returned status ${response.status}.${networkHint}`,
        response.status,
      );
    }
    if (response.isBase64) {
      throw new SsgRouteBuildError(
        `SSG route "${page.path}" returned isBase64=true; only text/html responses are supported`,
      );
    }

    const body = await collectBody(response.body);
    const html = new TextDecoder().decode(body);
    const file = ssgFilePathForRoute(page.path, trailingSlash);
    const contentType =
      firstHeaderValue(response.headers, 'content-type') ??
      'text/html; charset=utf-8';

    const strictHydrationSidecar = strictHydrationSidecars.get(page.path);
    let hydrationDataFile: string | undefined;
    let hydrationDataContent: string | undefined;
    if (strictHydrationSidecar !== undefined) {
      hydrationDataFile = ssgHydrationDataFilePathForRoute(page.path);
      hydrationDataContent = `${safeJson(strictHydrationSidecar.data)}\n`;
    } else if (emitHydrationData) {
      const hydrationJson = extractHydrationDataJson(html);
      if (hydrationJson !== null) {
        hydrationDataFile = ssgHydrationDataFilePathForRoute(page.path);
        hydrationDataContent = `${hydrationJson}\n`;
      }
    }

    const contentHash = hashSsgRenderedOutput(html, hydrationDataContent);
    const entry: SsgPageEntry = {
      routePattern: page.routePattern,
      path: page.path,
      file,
      status: response.status,
      contentType,
      contentHash,
    };
    if (hydrationDataFile !== undefined) {
      entry.hydrationDataFile = hydrationDataFile;
    }

    const skippedRoute = await ssgSkippedRouteIfUnchanged({
      incremental,
      outDir,
      entry,
      html,
      ...(hydrationDataContent !== undefined ? { hydrationDataContent } : {}),
      ...(previousEntry !== undefined ? { previousEntry } : {}),
    });

    if (skippedRoute === undefined) {
      await writeOutFile(outDir, file, html);
      if (
        hydrationDataFile !== undefined &&
        hydrationDataContent !== undefined
      ) {
        await writeOutFile(outDir, hydrationDataFile, hydrationDataContent);
      }
    }

    return {
      ok: true,
      entry,
      html,
      ...(skippedRoute !== undefined ? { skippedRoute } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      failure: failedRouteForError(page, error),
    };
  }
}

function withSsgStrictHydrationSidecars(
  faces: FaceModule[],
  sidecars: Map<string, SsgHydrationSidecar>,
): FaceModule[] {
  return faces.map((face) => {
    if (face.mode !== 'ssg') return face;

    return {
      ...face,
      render: async (ctx, data) => {
        const out = await face.render(ctx, data);
        if (!requiresSsgStrictHydrationSidecar(out)) return out;

        const routePath = normalizePath(ctx.request.path);
        const hydrationDataFile = ssgHydrationDataFilePathForRoute(routePath);
        sidecars.set(routePath, { data: out.hydration.data });

        return {
          ...out,
          hydration: externalizeSsgHydration(
            out.hydration,
            `/${hydrationDataFile}`,
          ),
        };
      },
    };
  });
}

function requiresSsgStrictHydrationSidecar(
  out: FaceRenderResult,
): out is FaceRenderResult & { hydration: FaceInlineHydration } {
  return (
    out.csp?.inlineScripts === false &&
    out.hydration !== undefined &&
    out.hydration.type !== 'external'
  );
}

function externalizeSsgHydration(
  hydration: FaceInlineHydration,
  dataUrl: string,
): FaceHydration {
  return {
    type: 'external',
    data: hydration.data,
    dataUrl,
    bootstrapModule: hydration.bootstrapModule,
  };
}

function failedRouteForError(
  page: PlannedPage,
  error: unknown,
): SsgFailedRoute {
  const failure: SsgFailedRoute = {
    routePattern: page.routePattern,
    path: page.path,
    message: errorMessage(error),
  };
  if (error instanceof SsgRouteBuildError && error.status !== undefined) {
    failure.status = error.status;
  }
  return failure;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatSsgBuildFailureMessage(failedRoutes: SsgFailedRoute[]): string {
  const routeWord = failedRoutes.length === 1 ? 'route' : 'routes';
  const routeList = failedRoutes.map((route) => route.path).join(', ');
  const routeMessages = failedRoutes
    .map((route) => `${route.path}: ${route.message}`)
    .join('\n');
  return `SSG build failed for ${failedRoutes.length} ${routeWord}: ${routeList}\n${routeMessages}`;
}

async function readPreviousSsgManifest(
  outDir: string,
): Promise<SsgManifest | null> {
  const manifestPath = path.resolve(outDir, SSG_MANIFEST_FILE);
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null;
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SsgManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.pages)) return null;
    return parsed as SsgManifest;
  } catch {
    return null;
  }
}

function hashSsgRenderedOutput(
  html: string,
  hydrationDataContent: string | undefined,
): string {
  const hash = createHash('sha256');
  hash.update('facetheory:ssg-output:v1\0html\0');
  hash.update(html);
  hash.update('\0hydration-data\0');
  if (hydrationDataContent !== undefined) {
    hash.update(hydrationDataContent);
  }
  return `sha256-${hash.digest('hex')}`;
}

async function ssgSkippedRouteIfUnchanged(options: {
  incremental: boolean;
  outDir: string;
  entry: SsgPageEntry;
  html: string;
  hydrationDataContent?: string;
  previousEntry?: SsgPageEntry;
}): Promise<SsgSkippedRoute | undefined> {
  const {
    incremental,
    outDir,
    entry,
    html,
    hydrationDataContent,
    previousEntry,
  } = options;

  if (!incremental) return undefined;
  if (entry.contentHash === undefined) return undefined;
  if (previousEntry?.contentHash !== entry.contentHash) return undefined;
  if (previousEntry.file !== entry.file) return undefined;
  if (previousEntry.hydrationDataFile !== entry.hydrationDataFile) {
    return undefined;
  }
  if (!(await ssgOutputFileMatches(outDir, entry.file, html))) {
    return undefined;
  }
  if (entry.hydrationDataFile !== undefined) {
    if (hydrationDataContent === undefined) return undefined;
    if (
      !(await ssgOutputFileMatches(
        outDir,
        entry.hydrationDataFile,
        hydrationDataContent,
      ))
    ) {
      return undefined;
    }
  }

  const skippedRoute: SsgSkippedRoute = {
    routePattern: entry.routePattern,
    path: entry.path,
    file: entry.file,
    reason: 'content-hash-match',
    contentHash: entry.contentHash,
  };
  if (entry.hydrationDataFile !== undefined) {
    skippedRoute.hydrationDataFile = entry.hydrationDataFile;
  }
  return skippedRoute;
}

async function ssgOutputFileMatches(
  outDir: string,
  relativePath: string,
  expectedContent: string,
): Promise<boolean> {
  const absolutePath = path.resolve(outDir, relativePath);
  assertSafeSsgOutputPath(outDir, relativePath, absolutePath);
  try {
    return (await readFile(absolutePath, 'utf8')) === expectedContent;
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function errorHasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export function ssgFilePathForRoute(
  routePath: string,
  trailingSlash: SsgTrailingSlashPolicy = 'always',
): string {
  const normalized = normalizePath(routePath);
  if (normalized === '/') return 'index.html';

  const stripped = trimOuterSlashes(normalized);
  if (!stripped) return 'index.html';
  if (trailingSlash === 'never') return `${stripped}.html`;
  return `${stripped}/index.html`;
}

export function ssgHydrationDataFilePathForRoute(routePath: string): string {
  const normalized = normalizePath(routePath);
  const stripped = trimOuterSlashes(normalized);
  if (!stripped) return '_facetheory/data/index.json';
  return `_facetheory/data/${stripped}.json`;
}

function parseRouteSegments(routePattern: string): SsgRouteSegment[] {
  const normalized = normalizePath(routePattern);
  if (normalized === '/') return [];

  const parts = trimLeadingSlashes(normalized).split('/');
  return parts.map((part) => {
    if (part.startsWith('{') && part.endsWith('}')) {
      const token = part.slice(1, -1);
      if (token.endsWith('+'))
        return { kind: 'proxy_plus', value: token.slice(0, -1) };
      if (token.endsWith('*'))
        return { kind: 'proxy_star', value: token.slice(0, -1) };
      return { kind: 'param', value: token };
    }
    assertSafeSsgPathSegment(part, `route "${routePattern}"`);
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
      proxyParts.forEach((part) =>
        assertSafeSsgPathSegment(part, `param "${segment.value}"`),
      );
      pathParts.push(...proxyParts.map((part) => encodeURIComponent(part)));
      continue;
    }

    if (segment.kind === 'proxy_star') {
      if (!value) continue;
      const proxyParts = value.split('/').filter((part) => part.length > 0);
      proxyParts.forEach((part) =>
        assertSafeSsgPathSegment(part, `param "${segment.value}"`),
      );
      pathParts.push(...proxyParts.map((part) => encodeURIComponent(part)));
      continue;
    }

    if (!value) {
      throw new Error(`missing required route param "${segment.value}"`);
    }
    assertSafeSsgPathSegment(value, `param "${segment.value}"`);
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

function firstHeaderValue(headers: FaceHeaders, key: string): string | null {
  const values = headers[key] ?? headers[key.toLowerCase()] ?? [];
  if (!values.length) return null;
  return values[0] ?? null;
}

async function writeOutFile(
  outDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = path.resolve(outDir, relativePath);
  assertSafeSsgOutputPath(outDir, relativePath, absolutePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function assertSafeSsgPathSegment(segment: string, source: string): void {
  if (segment === '.' || segment === '..') {
    throw new Error(
      `SSG ${source} contains prohibited dot-segment "${segment}"; generateStaticParams() values must not escape the output root`,
    );
  }
}

function assertSafeSsgOutputPath(
  outDir: string,
  relativePath: string,
  absolutePath: string,
): void {
  const normalizedRelative = relativePath.replaceAll('\\', '/');
  for (const segment of normalizedRelative.split('/')) {
    if (!segment) continue;
    assertSafeSsgPathSegment(segment, `output path "${relativePath}"`);
  }

  const relativeToOutDir = path.relative(outDir, absolutePath);
  if (
    !relativeToOutDir ||
    relativeToOutDir === '..' ||
    relativeToOutDir.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToOutDir)
  ) {
    throw new Error(`SSG output path "${relativePath}" escapes outDir "${outDir}"`);
  }
}

function extractHydrationDataJson(html: string): string | null {
  const match = html.match(
    /<script[^>]*id=(?:"|')__FACETHEORY_DATA__(?:"|')[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;
  const json = match[1]?.trim() ?? '';
  return json.length > 0 ? json : null;
}

function normalizeSsgConcurrency(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('SSG concurrency must be a positive integer');
  }
  return value;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (items.length === 0) return [];

  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker();
    }),
  );
  return results;
}

async function withFetchGuard<T>(
  options: { allowNetwork: boolean; fetch?: typeof fetch },
  fn: () => Promise<T>,
): Promise<T> {
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
    return await fn();
  } finally {
    if (originalFetch !== undefined) {
      globalRef.fetch = originalFetch;
    } else {
      delete globalRef.fetch;
    }
  }
}
