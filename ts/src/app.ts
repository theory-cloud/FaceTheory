import { randomUUID } from 'node:crypto';

import { utf8 } from './bytes.js';
import { renderFaceHead } from './head.js';
import {
  renderHTMLDocument,
  streamHTMLDocument,
  type HTMLDocumentParts,
} from './html.js';
import {
  createIsrRuntime,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type FaceIsrOptions,
  type IsrRenderFreshOptions,
  type IsrRuntime,
} from './isr.js';
import {
  errorClassFor,
  logLevelForStatus,
  reportFaceError,
  type FaceErrorPhase,
  type FaceObservabilityHooks,
  type FaceRequestCompletedLogRecord,
  type FaceStreamErrorLogRecord,
} from './ops.js';
import {
  buildStrictCspHeader,
  requiresStrictCspDocumentValidation,
  validateStrictCspDocument,
} from './security.js';
import {
  canonicalizePathForTrailingSlashPolicy,
  normalizeTrailingSlashPolicy,
  routePatternConflict,
  Router,
} from './router.js';
import { jsonResourceResponse, textResourceResponse } from './resource.js';
import {
  createSsrHydrationSidecarStore,
  normalizeSsrHydrationSidecarDataUrlPrefix,
  type SsrHydrationSidecarStore,
  type SsrHydrationSidecarStoreOptions,
  type SsrHydrationSidecarVariantInput,
} from './ssr-hydration.js';
import type {
  FaceContext,
  FaceContractWarningLogRecord,
  FaceExternalHydration,
  FaceHydration,
  FaceMode,
  FaceModule,
  FaceResourceRoute,
  FaceRenderResult,
  FaceRequest,
  FaceResponse,
  FaceHeaders,
  TrailingSlashPolicy,
} from './types.js';
import {
  canonicalizeHeaders,
  cloneCookies,
  cloneQuery,
  normalizePath,
  parseCookiesFromHeaders,
  parseQueryString,
} from './types.js';

/**
 * Options for constructing a FaceTheory app: Faces define render-mode routes,
 * resources define raw endpoints, and optional runtimes wire ISR, strict CSP,
 * hydration sidecars, observability, and trailing-slash policy.
 */
export interface FaceAppOptions {
  faces: FaceModule[];
  resources?: FaceResourceRoute[];
  isr?: FaceIsrOptions;
  ssrHydrationSidecars?: FaceSsrHydrationSidecarOptions;
  observability?: FaceAppObservabilityHooks;
  strictCsp?: FaceStrictCspOptions;
  trailingSlash?: TrailingSlashPolicy;
}

/**
 * Structured log record emitted by a FaceApp for request completion, stream errors,
 * and construction-time contract warnings.
 */
export type FaceAppLogRecord =
  | FaceRequestCompletedLogRecord
  | FaceStreamErrorLogRecord
  | (FaceContractWarningLogRecord &
      Partial<Omit<FaceRequestCompletedLogRecord, 'event'>>);

/**
 * Observer callback for FaceApp structured logs; implementations must avoid mutating
 * render output or request context.
 */
export type FaceAppLogHook = (record: FaceAppLogRecord) => void;

/**
 * Observability callbacks used by FaceApp without changing emitted HTML bytes or
 * hydration behavior.
 */
export interface FaceAppObservabilityHooks extends Omit<
  FaceObservabilityHooks,
  'log'
> {
  /**
   * Structured request completion records and construction-time contract
   * warnings. Contract warnings remain warnings until the planned v4 contract
   * escalation.
   */
  log?: FaceAppLogHook;
}

/**
 * Configuration for strict SSR hydration sidecars that externalize render data into
 * signed, same-origin resources instead of inline script data.
 */
export interface FaceSsrHydrationSidecarOptions extends Pick<
  SsrHydrationSidecarStoreOptions,
  | 'htmlStore'
  | 'signingSecret'
  | 'now'
  | 'ttlSeconds'
  | 'keyPrefix'
  | 'dataUrlPrefix'
  | 'scope'
> {
  /**
   * Request-derived variant binding used when writing a sidecar during the
   * HTML render and when reading it through the framework-owned resource
   * route. The callback must only use request fields that the sidecar fetch can
   * reproduce. The default ignores arbitrary cookies so path-scoped or
   * attacker-tossed cookies that appear on only one of the HTML or sidecar
   * requests cannot perturb strict hydration availability. If a deployment
   * needs tenant/session binding, provide a custom callback that allowlists
   * stable fields present on both requests. Only HMAC-derived digests are
   * stored in tokens and metadata.
   */
  requestVariant?: FaceSsrHydrationSidecarVariantCallback;
}

/**
 * Computes a reproducible request variant for SSR hydration sidecars; only stable
 * request fields present on both HTML and sidecar fetches should be included.
 */
export type FaceSsrHydrationSidecarVariantCallback = (
  request: Readonly<Required<FaceRequest>>,
) => SsrHydrationSidecarVariantInput | Promise<SsrHydrationSidecarVariantInput>;

/**
 * Strict CSP runtime limits applied when no-inline policies require buffering streamed
 * HTML for whole-document validation.
 */
export interface FaceStrictCspOptions {
  /**
   * Maximum raw stream bytes FaceTheory will collect for strict no-inline CSP
   * document validation. Strict streaming responses must be buffered before
   * validation so this limit prevents unbounded body collection.
   */
  maxStreamingBodyBytes?: number;
}

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
/**
 * Default maximum buffered body size for strict CSP streaming validation, chosen to
 * fail closed rather than collect unbounded Lambda memory.
 */
export const DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES = 5 * 1024 * 1024;
const SAFE_INTERNAL_ERROR_HTML = renderHTMLDocument({
  head: '<title>Internal Server Error</title>',
  body: '<h1>Internal Server Error</h1><template data-facetheory-error="true"></template>',
});
const SAFE_PAYLOAD_TOO_LARGE_HTML = renderHTMLDocument({
  head: '<title>Payload Too Large</title>',
  body: '<h1>Payload Too Large</h1><template data-facetheory-error="strict-csp-stream-body-too-large"></template>',
});

const REQUEST_ID_HEADER = 'x-request-id';
const OBSERVED_ERROR = Symbol('facetheory.observed-error');

interface ObservedFaceError {
  phase: FaceErrorPhase;
  value: unknown;
}

type FaceResponseWithObservedError = FaceResponse & {
  [OBSERVED_ERROR]?: ObservedFaceError;
};

class StreamPreflightError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('stream body failed before first chunk');
    this.name = 'StreamPreflightError';
    this.cause = cause;
  }
}

class StrictCspStreamBodyTooLargeError extends Error {
  constructor(
    readonly limitBytes: number,
    readonly receivedBytes: number,
  ) {
    super(
      `strict CSP streaming body exceeded ${String(limitBytes)} byte limit after ${String(receivedBytes)} bytes`,
    );
    this.name = 'StrictCspStreamBodyTooLargeError';
  }
}

interface FaceAppSsrHydrationSidecarRuntime {
  routes: FaceResourceRoute[];
  store: SsrHydrationSidecarStore;
  requestVariant: FaceSsrHydrationSidecarVariantCallback;
}

/**
 * Framework-neutral FaceTheory application that routes resources and Faces, executes
 * `load`/`render` according to the Face mode, wraps deterministic HTML documents, and
 * returns handler-agnostic responses.
 */
export class FaceApp {
  private readonly router: Router;
  private readonly faceByPattern: Map<string, FaceModule>;
  private readonly resourceByPattern: Map<string, FaceResourceRoute>;
  private readonly isrRuntime: IsrRuntime | null;
  private readonly ssrHydrationSidecarRuntime: FaceAppSsrHydrationSidecarRuntime | null;
  private readonly observability: FaceAppObservabilityHooks | null;
  private readonly strictCspMaxStreamingBodyBytes: number;
  private readonly trailingSlash: TrailingSlashPolicy;
  private coldStartPending = true;

  constructor(options: FaceAppOptions) {
    this.trailingSlash = normalizeTrailingSlashPolicy(options.trailingSlash);
    this.router = new Router({ trailingSlash: this.trailingSlash });
    this.faceByPattern = new Map();
    this.resourceByPattern = new Map();
    this.observability = options.observability ?? null;
    this.strictCspMaxStreamingBodyBytes =
      normalizeStrictCspMaxStreamingBodyBytes(
        options.strictCsp?.maxStreamingBodyBytes,
      );
    this.ssrHydrationSidecarRuntime = options.ssrHydrationSidecars
      ? createFaceAppSsrHydrationSidecarRuntime(options.ssrHydrationSidecars)
      : null;

    const constructionWarnings: FaceContractWarningLogRecord[] = [];

    for (const face of options.faces) {
      const pattern = canonicalizePathForTrailingSlashPolicy(
        validateFaceContract(face),
        this.trailingSlash,
      );
      if (this.faceByPattern.has(pattern)) {
        throw new Error(`duplicate face route: ${pattern}`);
      }
      this.router.add(pattern);
      this.faceByPattern.set(pattern, face);
      constructionWarnings.push(...faceContractWarnings(face, pattern));
    }

    const resources = this.ssrHydrationSidecarRuntime
      ? [
          ...this.ssrHydrationSidecarRuntime.routes,
          ...(options.resources ?? []),
        ]
      : (options.resources ?? []);

    for (const resource of resources) {
      const pattern = canonicalizePathForTrailingSlashPolicy(
        resource.route,
        this.trailingSlash,
      );
      if (this.resourceByPattern.has(pattern)) {
        throw new Error(`duplicate resource route: ${pattern}`);
      }

      for (const resourcePattern of this.resourceByPattern.keys()) {
        const conflict = routePatternConflict(resourcePattern, pattern);
        if (conflict === 'duplicate') {
          throw new Error(`duplicate resource route: ${pattern}`);
        }
        if (conflict === 'ambiguous') {
          throw new Error(
            `ambiguous resource routes: ${resourcePattern} and ${pattern}`,
          );
        }
      }

      for (const facePattern of this.faceByPattern.keys()) {
        const conflict = routePatternConflict(facePattern, pattern);
        if (conflict === 'duplicate') {
          throw new Error(`duplicate face/resource route: ${pattern}`);
        }
        if (conflict === 'ambiguous') {
          throw new Error(
            `ambiguous face/resource routes: ${facePattern} and ${pattern}`,
          );
        }
      }

      this.router.add(pattern);
      this.resourceByPattern.set(pattern, resource);
    }

    const hasIsrFace = options.faces.some((face) => face.mode === 'isr');
    if (!hasIsrFace) {
      this.isrRuntime = null;
    } else {
      const isrOptions = options.isr ?? {};
      this.isrRuntime = createIsrRuntime({
        ...isrOptions,
        htmlStore: isrOptions.htmlStore ?? new InMemoryHtmlStore(),
        metaStore: isrOptions.metaStore ?? new InMemoryIsrMetaStore(),
        observability: this.observability ?? isrOptions.observability ?? null,
      });
    }

    emitFaceContractWarnings(this.observability, constructionWarnings);
  }

  async handle(request: FaceRequest): Promise<FaceResponse> {
    const hooks = this.observability;
    const now = hooks?.now ?? (() => Date.now());
    const startedAt = now();

    const normalizedReq = normalizeRequest(request);
    const requestId = normalizedReq.headers[REQUEST_ID_HEADER]?.[0] ?? '';
    const coldStart = this.consumeColdStartMarker();

    let routePattern = '';
    let mode: FaceMode | 'none' = 'none';
    let renderMs: number | null = null;

    const trailingSlashRedirectPath = this.router.redirectPath(
      normalizedReq.path,
    );
    if (trailingSlashRedirectPath !== null) {
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        redirectResponse(
          withQueryString(trailingSlashRedirectPath, normalizedReq.query),
        ),
        {
          routePattern: trailingSlashRedirectPath,
          mode,
          renderMs,
          coldStart,
        },
      );
    }

    let response: FaceResponse;
    const match = this.router.match(normalizedReq.path);

    if (!match) {
      response = textResponse(404, 'Not Found', {
        'content-type': ['text/plain; charset=utf-8'],
      });
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
          coldStart,
        },
      );
    }

    const routePatternForMatch = match.pattern;
    const resource = this.resourceByPattern.get(routePatternForMatch);

    const ctx: FaceContext = {
      request: normalizedReq,
      params: match.params,
      proxy: match.proxy ?? null,
    };

    if (resource) {
      routePattern = routePatternForMatch;
      let observedError: ObservedFaceError | null = null;
      try {
        response = await resource.handle(ctx);
      } catch (err) {
        observedError = { phase: 'resource', value: err };
        response = internalErrorResponse();
      }

      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
          coldStart,
          error: observedError,
        },
      );
    }

    const face = this.faceByPattern.get(routePatternForMatch);
    if (!face) {
      response = textResponse(500, 'Internal Error', {
        'content-type': ['text/plain; charset=utf-8'],
      });
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
          coldStart,
        },
      );
    }

    routePattern = routePatternForMatch;
    mode = face.mode;

    try {
      const renderFresh = async (
        isrOptions?: IsrRenderFreshOptions,
      ): Promise<FaceResponse> => {
        const renderStartedAt = now();
        const data = face.load ? await face.load(ctx) : null;
        try {
          const out = prepareRenderResultForIsr(
            await face.render(ctx, data),
            isrOptions,
          );
          const preparedOut =
            face.mode === 'ssr'
              ? await prepareRenderResultForSsrHydrationSidecar(
                  out,
                  this.ssrHydrationSidecarRuntime,
                  normalizedReq,
                )
              : out;
          return await toHTTPResponse(
            preparedOut,
            normalizedReq,
            this.strictCspMaxStreamingBodyBytes,
            {
              hooks,
              method: normalizedReq.method,
              mode,
              path: normalizedReq.path,
              requestId,
              routePattern,
            },
          );
        } finally {
          renderMs = Math.max(0, now() - renderStartedAt);
        }
      };

      if (face.mode === 'isr') {
        if (!this.isrRuntime) {
          throw new Error(
            `ISR runtime is not configured for route "${match.pattern}"`,
          );
        }
        response = await this.isrRuntime.handleFace({
          face,
          ctx,
          routePattern: match.pattern,
          renderFresh,
        });
        return finishResponse(
          hooks,
          now,
          startedAt,
          requestId,
          normalizedReq,
          response,
          {
            routePattern,
            mode,
            renderMs,
            coldStart,
          },
        );
      }

      response = await renderFresh();
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
          coldStart,
        },
      );
    } catch (err) {
      const observedError = observedErrorFromCaughtRenderError(err);
      response =
        err instanceof StrictCspStreamBodyTooLargeError
          ? strictCspStreamBodyTooLargeResponse()
          : internalErrorResponse();
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
          coldStart,
          error: observedError,
        },
      );
    }
  }

  private consumeColdStartMarker(): boolean {
    const coldStart = this.coldStartPending;
    this.coldStartPending = false;
    return coldStart;
  }
}

/**
 * Creates the canonical FaceTheory application instance from a bounded list of Faces
 * and optional resource/runtime configuration.
 */
export function createFaceApp(options: FaceAppOptions): FaceApp {
  return new FaceApp(options);
}

/**
 * Identity helper that preserves typed `load` data inference for a FaceModule while
 * returning the runtime Face contract unchanged.
 */
export function defineFace<TData = unknown>(
  face: FaceModule<TData>,
): FaceModule<TData> {
  return face;
}

function validateFaceContract(face: FaceModule): string {
  const route = String((face as { route?: unknown }).route ?? '').trim();
  if (!route) {
    throw new Error('face route must be a non-empty string');
  }

  const mode = (face as { mode?: unknown }).mode;
  if (mode !== 'ssr' && mode !== 'ssg' && mode !== 'isr') {
    throw new Error(
      `invalid face mode for route "${route}": expected ssr, ssg, or isr`,
    );
  }

  if (typeof (face as { render?: unknown }).render !== 'function') {
    throw new Error(`face render for route "${route}" must be a function`);
  }

  return normalizePath(route);
}

function faceContractWarnings(
  face: FaceModule,
  routePattern: string,
): FaceContractWarningLogRecord[] {
  const warnings: FaceContractWarningLogRecord[] = [];

  if (face.mode === 'isr' && face.revalidateSeconds === undefined) {
    warnings.push({
      level: 'warn',
      event: 'facetheory.app.contract.warning',
      warningCode: 'isr.revalidate_seconds_missing',
      routePattern,
      mode: face.mode,
      message:
        `ISR face "${routePattern}" does not declare revalidateSeconds; ` +
        'this remains a construction warning until the v4 contract escalation.',
    });
  }

  if (
    face.mode === 'ssg' &&
    routePatternHasParams(routePattern) &&
    typeof face.generateStaticParams !== 'function'
  ) {
    warnings.push({
      level: 'warn',
      event: 'facetheory.app.contract.warning',
      warningCode: 'ssg.generate_static_params_missing',
      routePattern,
      mode: face.mode,
      message:
        `SSG param face "${routePattern}" does not declare generateStaticParams; ` +
        'this remains a construction warning until the v4 contract escalation.',
    });
  }

  return warnings;
}

function routePatternHasParams(routePattern: string): boolean {
  return routePattern.split('/').some((segment) => {
    const trimmed = segment.trim();
    return (
      trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.length > 2
    );
  });
}

function emitFaceContractWarnings(
  hooks: FaceAppObservabilityHooks | null,
  warnings: readonly FaceContractWarningLogRecord[],
): void {
  const log = hooks?.log as FaceAppLogHook | undefined;
  for (const warning of warnings) {
    log?.(warning);
  }
}

function createFaceAppSsrHydrationSidecarRuntime(
  options: FaceSsrHydrationSidecarOptions,
): FaceAppSsrHydrationSidecarRuntime {
  const dataUrlPrefix = normalizeSsrHydrationSidecarDataUrlPrefix(
    options.dataUrlPrefix,
  );
  const routePatterns =
    routePatternsFromSsrHydrationSidecarDataUrlPrefix(dataUrlPrefix);

  const runtime: Omit<FaceAppSsrHydrationSidecarRuntime, 'routes'> = {
    store: createSsrHydrationSidecarStore({
      ...options,
      dataUrlPrefix,
    }),
    requestVariant:
      options.requestVariant ?? defaultSsrHydrationSidecarRequestVariant,
  };

  return {
    ...runtime,
    routes: routePatterns.map((route) => ({
      route,
      handle: (ctx) => handleSsrHydrationSidecarResource(runtime, ctx),
    })),
  };
}

function routePatternsFromSsrHydrationSidecarDataUrlPrefix(
  prefix: string,
): string[] {
  if (prefix === '/') {
    throw new TypeError(
      'SSR hydration sidecar dataUrlPrefix must include a static path segment',
    );
  }

  if (prefix.includes('{') || prefix.includes('}')) {
    throw new TypeError(
      'SSR hydration sidecar dataUrlPrefix must be a static path prefix',
    );
  }

  if (prefix !== '/') {
    const segments = prefix.slice(1).split('/');
    if (segments.some((segment) => segment.length === 0)) {
      throw new TypeError(
        'SSR hydration sidecar dataUrlPrefix must not contain empty path segments',
      );
    }
  }

  return [prefix, `${prefix}/{token}`, `${prefix}/{token+}`];
}

async function handleSsrHydrationSidecarResource(
  runtime: Omit<FaceAppSsrHydrationSidecarRuntime, 'routes'>,
  ctx: FaceContext,
): Promise<FaceResponse> {
  if (ctx.request.method !== 'GET') return ssrHydrationSidecarFailureResponse();

  const token = ctx.proxy ?? ctx.params.token ?? '';
  try {
    const variant = await runtime.requestVariant(ctx.request);
    const sidecar = await runtime.store.read({ token, variant });
    return jsonResourceResponse(sidecar.data);
  } catch (err) {
    return withObservedError(
      ssrHydrationSidecarFailureResponse(),
      'ssr-hydration-sidecar',
      err,
    );
  }
}

function ssrHydrationSidecarFailureResponse(): FaceResponse {
  return textResourceResponse('Not Found', { status: 404 });
}

function defaultSsrHydrationSidecarRequestVariant(
  _request: Readonly<Required<FaceRequest>>,
): SsrHydrationSidecarVariantInput {
  return { stableCookies: {} };
}

function normalizeRequest(req: FaceRequest): Required<FaceRequest> {
  const rawPath = String(req.path ?? '').trim();
  const headers = canonicalizeHeaders(req.headers);
  ensureRequestId(headers);

  return {
    method:
      String(req.method ?? '')
        .trim()
        .toUpperCase() || 'GET',
    path: normalizePath(rawPath),
    headers,
    query: req.query ? cloneQuery(req.query) : queryFromPath(rawPath),
    cookies: req.cookies
      ? cloneCookies(req.cookies)
      : parseCookiesFromHeaders(headers),
    body: req.body ?? new Uint8Array(),
    isBase64: Boolean(req.isBase64),
    cspNonce: req.cspNonce ?? null,
  };
}

function ensureRequestId(headers: FaceHeaders): void {
  const existing = headers[REQUEST_ID_HEADER] ?? [];
  const first = String(existing[0] ?? '').trim();
  headers[REQUEST_ID_HEADER] = [first || randomUUID()];
}

function finishResponse(
  hooks: FaceObservabilityHooks | null,
  now: () => number,
  startedAt: number,
  requestId: string,
  req: Readonly<Required<FaceRequest>>,
  response: FaceResponse,
  context: {
    routePattern: string;
    mode: FaceMode | 'none';
    renderMs: number | null;
    coldStart?: boolean;
    error?: ObservedFaceError | null;
  },
): FaceResponse {
  const headers: FaceHeaders = { ...(response.headers ?? {}) };
  headers[REQUEST_ID_HEADER] = [requestId];

  const sorted: FaceHeaders = {};
  for (const key of Object.keys(headers).sort()) {
    sorted[key] = headers[key] ?? [];
  }

  const out: FaceResponse = { ...response, headers: sorted };

  const durationMs = Math.max(0, now() - startedAt);
  const isrState =
    String(out.headers['x-facetheory-isr']?.[0] ?? '').trim() || null;
  const isStream = !(out.body instanceof Uint8Array);

  const level = logLevelForStatus(out.status);
  const observedError =
    context.error ?? observedErrorFromResponse(response) ?? null;
  const errorClass = observedError
    ? reportFaceError(hooks, observedError.value, {
        requestId,
        method: req.method,
        path: req.path,
        routePattern: context.routePattern,
        mode: context.mode,
        phase: observedError.phase,
        status: out.status,
        isrState,
      })
    : null;

  hooks?.log?.({
    level,
    event: 'facetheory.request.completed',
    requestId,
    method: req.method,
    path: req.path,
    routePattern: context.routePattern,
    mode: context.mode,
    status: out.status,
    durationMs,
    renderMs: context.renderMs,
    isrState,
    isStream,
    errorClass,
  });

  hooks?.metric?.({
    name: 'facetheory.request',
    value: 1,
    tags: {
      method: req.method,
      route_pattern: context.routePattern || req.path,
      mode: String(context.mode),
      status: String(out.status),
      isr_state: isrState ?? '',
      is_stream: isStream ? '1' : '0',
      error_class: errorClass ?? '',
      cold_start: context.coldStart ? '1' : '0',
    },
  });

  if (context.mode === 'isr' && isrState !== null) {
    hooks?.metric?.({
      name: 'facetheory.isr.cache',
      value: 1,
      tags: {
        method: req.method,
        route_pattern: context.routePattern || req.path,
        state: isrState,
        status: String(out.status),
      },
    });
  }

  if (context.renderMs !== null) {
    hooks?.metric?.({
      name: 'facetheory.render_ms',
      value: context.renderMs,
      tags: {
        method: req.method,
        route_pattern: context.routePattern || req.path,
        mode: String(context.mode),
      },
    });
  }

  return out;
}

function withObservedError(
  response: FaceResponse,
  phase: FaceErrorPhase,
  value: unknown,
): FaceResponse {
  Object.defineProperty(response, OBSERVED_ERROR, {
    value: { phase, value },
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return response;
}

function observedErrorFromResponse(
  response: FaceResponse,
): ObservedFaceError | null {
  return (response as FaceResponseWithObservedError)[OBSERVED_ERROR] ?? null;
}

function observedErrorFromCaughtRenderError(err: unknown): ObservedFaceError {
  if (err instanceof StreamPreflightError) {
    return { phase: 'stream-preflight', value: err.cause };
  }
  return { phase: 'render', value: err };
}

function queryFromPath(path: string): Record<string, string[]> {
  const idx = path.indexOf('?');
  if (idx < 0 || idx === path.length - 1) return {};
  return parseQueryString(path.slice(idx + 1));
}

function toHeaders(
  input: FaceRenderResult['headers'],
  cookies: string[] | undefined,
): FaceHeaders {
  const headers: FaceHeaders = {};
  const setCookieValues: string[] = [];

  for (const [key, value] of Object.entries(input ?? {})) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;

    const normalizedValues = (Array.isArray(value) ? value : [value]).map(
      String,
    );
    if (lower === 'set-cookie') {
      setCookieValues.push(...normalizedValues);
      continue;
    }

    const existingValues = headers[lower];
    if (existingValues) {
      existingValues.push(...normalizedValues);
    } else {
      headers[lower] = [...normalizedValues];
    }
  }

  if (cookies?.length) {
    setCookieValues.push(...cookies.map(String));
  }

  if (setCookieValues.length > 0) {
    headers['set-cookie'] = setCookieValues;
  }

  const sortedHeaders: FaceHeaders = {};
  for (const key of Object.keys(headers).sort()) {
    sortedHeaders[key] = headers[key] ?? [];
  }
  return sortedHeaders;
}

function prepareRenderResultForIsr(
  out: FaceRenderResult,
  options: IsrRenderFreshOptions | undefined,
): FaceRenderResult {
  const dataUrl = options?.strictExternalHydrationDataUrl;
  if (
    dataUrl === undefined ||
    out.csp?.inlineScripts !== false ||
    out.hydration === undefined
  ) {
    return out;
  }

  const hydration = externalizeHydrationForIsr(out.hydration, dataUrl);
  options?.onHydrationSidecar?.({
    data: hydration.data,
    dataUrl: hydration.dataUrl,
  });

  return {
    ...out,
    hydration,
  };
}

async function prepareRenderResultForSsrHydrationSidecar(
  out: FaceRenderResult,
  runtime: FaceAppSsrHydrationSidecarRuntime | null,
  req: Readonly<Required<FaceRequest>>,
): Promise<FaceRenderResult> {
  if (
    runtime === null ||
    out.csp?.inlineScripts !== false ||
    out.hydration === undefined ||
    isExternalHydration(out.hydration)
  ) {
    return out;
  }

  const hydration = out.hydration;
  const variant = await runtime.requestVariant(req);
  const sidecar = await runtime.store.write({
    data: hydration.data,
    variant,
  });

  return {
    ...out,
    hydration: externalizeHydration(hydration, sidecar.dataUrl),
  };
}

function externalizeHydrationForIsr(
  hydration: FaceHydration,
  dataUrl: string,
): FaceExternalHydration {
  return externalizeHydration(hydration, dataUrl);
}

function externalizeHydration(
  hydration: FaceHydration,
  dataUrl: string,
): FaceExternalHydration {
  return {
    type: 'external',
    data: hydration.data,
    dataUrl,
    bootstrapModule: hydration.bootstrapModule,
  };
}

function isExternalHydration(
  hydration: FaceHydration,
): hydration is FaceExternalHydration {
  return hydration.type === 'external';
}

interface StreamErrorTelemetryContext {
  hooks: FaceObservabilityHooks | null;
  requestId: string;
  method: string;
  path: string;
  routePattern: string;
  mode: FaceMode | 'none';
}

async function toHTTPResponse(
  out: FaceRenderResult,
  req: Readonly<Required<FaceRequest>>,
  strictCspMaxStreamingBodyBytes: number,
  streamTelemetry?: StreamErrorTelemetryContext,
): Promise<FaceResponse> {
  const status = out.status ?? 200;
  const headers = toHeaders(out.headers, out.cookies);
  const cookies = headers['set-cookie'] ?? [];

  if (!headers['content-type']) {
    headers['content-type'] = [HTML_CONTENT_TYPE];
  }
  applyStrictCspResponseHeader(headers, out.csp, req.cspNonce);

  const head = renderFaceHead(out, { cspNonce: req.cspNonce });
  const documentParts = withDocumentShell(out);

  if (typeof out.html === 'string') {
    const documentHtml = renderHTMLDocument({
      ...documentParts,
      head,
      body: out.html,
    });
    validateStrictCspDocument(documentHtml, { policy: out.csp });

    return {
      status,
      headers,
      cookies,
      body: utf8(documentHtml),
      isBase64: false,
    };
  }

  if (requiresStrictCspDocumentValidation(out.csp)) {
    const strictBody = await collectStreamAsUtf8Text(
      out.html,
      strictCspMaxStreamingBodyBytes,
    );
    const documentHtml = renderHTMLDocument({
      ...documentParts,
      head,
      body: strictBody,
    });
    validateStrictCspDocument(documentHtml, { policy: out.csp });

    return {
      status,
      headers,
      cookies,
      body: utf8(documentHtml),
      isBase64: false,
    };
  }

  const body = streamHTMLDocument({
    ...documentParts,
    head,
    body: await preflightStream(out.html),
    ...(streamTelemetry
      ? {
          onStreamError: (err: unknown) =>
            reportStreamError(streamTelemetry, err),
        }
      : {}),
  });

  return { status, headers, cookies, body, isBase64: false };
}

function reportStreamError(
  context: StreamErrorTelemetryContext,
  err: unknown,
): void {
  const errorClass = errorClassFor(err);
  context.hooks?.log?.({
    level: 'error',
    event: 'facetheory.stream_error',
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    routePattern: context.routePattern,
    mode: context.mode,
    errorClass,
  });
  context.hooks?.metric?.({
    name: 'facetheory.stream_error',
    value: 1,
    tags: {
      method: context.method,
      route_pattern: context.routePattern || context.path,
      mode: String(context.mode),
      error_class: errorClass,
    },
  });
}

function applyStrictCspResponseHeader(
  headers: FaceHeaders,
  policy: FaceRenderResult['csp'],
  cspNonce: string | null,
): void {
  if (!requiresStrictCspDocumentValidation(policy)) return;
  if (headers['content-security-policy']?.length) return;
  headers['content-security-policy'] = [buildStrictCspHeader({ cspNonce })];
}

async function collectStreamAsUtf8Text(
  input: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of input) {
    const normalizedChunk =
      chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += normalizedChunk.byteLength;
    if (total > maxBytes) {
      throw new StrictCspStreamBodyTooLargeError(maxBytes, total);
    }
    chunks.push(normalizedChunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function withDocumentShell(
  out: FaceRenderResult,
): Pick<HTMLDocumentParts, 'lang' | 'htmlAttrs' | 'bodyAttrs'> {
  const parts: Pick<HTMLDocumentParts, 'lang' | 'htmlAttrs' | 'bodyAttrs'> = {};
  if (out.lang !== undefined) parts.lang = out.lang;
  if (out.htmlAttrs !== undefined) parts.htmlAttrs = out.htmlAttrs;
  if (out.bodyAttrs !== undefined) parts.bodyAttrs = out.bodyAttrs;
  return parts;
}

async function preflightStream(
  input: AsyncIterable<Uint8Array>,
): Promise<AsyncIterable<Uint8Array>> {
  const iterator = input[Symbol.asyncIterator]();

  let firstChunk: IteratorResult<Uint8Array>;
  try {
    firstChunk = await iterator.next();
  } catch (err) {
    throw new StreamPreflightError(err);
  }

  return (async function* () {
    if (!firstChunk.done) {
      yield firstChunk.value;
    }

    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      yield next.value;
    }
  })();
}

function withQueryString(
  path: string,
  query: Record<string, string[]>,
): string {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(query)) {
    for (const value of values) {
      params.append(key, value);
    }
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function redirectResponse(location: string): FaceResponse {
  return textResponse(308, 'Permanent Redirect', {
    location: [location],
    'content-type': ['text/plain; charset=utf-8'],
  });
}

function textResponse(
  status: number,
  body: string,
  headers: FaceHeaders,
): FaceResponse {
  return {
    status,
    headers,
    cookies: headers['set-cookie'] ?? [],
    body: utf8(body),
    isBase64: false,
  };
}

function internalErrorResponse(): FaceResponse {
  return {
    status: 500,
    headers: { 'content-type': [HTML_CONTENT_TYPE] },
    cookies: [],
    body: utf8(SAFE_INTERNAL_ERROR_HTML),
    isBase64: false,
  };
}

function strictCspStreamBodyTooLargeResponse(): FaceResponse {
  return {
    status: 413,
    headers: { 'content-type': [HTML_CONTENT_TYPE] },
    cookies: [],
    body: utf8(SAFE_PAYLOAD_TOO_LARGE_HTML),
    isBase64: false,
  };
}

function normalizeStrictCspMaxStreamingBodyBytes(
  value: number | undefined,
): number {
  if (value === undefined) {
    return DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES;
  }

  const normalized = Math.trunc(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(
      'strictCsp.maxStreamingBodyBytes must be a non-negative safe integer',
    );
  }

  return normalized;
}
