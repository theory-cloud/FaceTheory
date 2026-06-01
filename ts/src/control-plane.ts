import { utf8 } from './bytes.js';
import { createFaceApp, type FaceApp, type FaceAppOptions } from './app.js';
import {
  DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
  NAVIGATION_PENDING_ATTRIBUTE,
  NAVIGATION_PENDING_INDICATOR_ATTRIBUTE,
} from './navigation-pending.js';
import {
  RESPONSIVE_PRIMITIVES_CSS,
  RESPONSIVE_PRIMITIVES_CLASS_PREFIX,
} from './responsive-primitives/index.js';
import {
  jsonResourceResponse,
  methodNotAllowedResourceResponse,
  textResourceResponse,
} from './resource.js';
import type {
  FaceContext,
  FaceHeadTag,
  FaceMode,
  FaceModule,
  FaceRenderResult,
  FaceResourceRoute,
  FaceResponse,
} from './types.js';
import { normalizePath } from './types.js';

export type ControlPlaneCspMode = 'relaxed' | 'strict';
export type ControlPlaneDeliveryCapability = 'client-fill' | 'streaming';

export const CONTROL_PLANE_PRESET_SURFACE_ID =
  'theorycloud_control_plane_delivery.facetheory.preset';
export const CONTROL_PLANE_PRESET_CONTRACT =
  'theorycloud_control_plane_delivery.v0.1';
export const CONTROL_PLANE_STRICT_CSP_SUPPORTED = true;

export const CONTROL_PLANE_ASSET_PREFIX = '/_facetheory/control-plane';
export const CONTROL_PLANE_BOOTSTRAP_MODULE_PATH = `${CONTROL_PLANE_ASSET_PREFIX}/control-plane.js`;
export const CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH = `${CONTROL_PLANE_ASSET_PREFIX}/responsive-primitives.css`;
export const CONTROL_PLANE_SECTION_PREFIX = `${CONTROL_PLANE_ASSET_PREFIX}/sections`;

const JAVASCRIPT_CONTENT_TYPE = 'text/javascript; charset=utf-8';
const CSS_CONTENT_TYPE = 'text/css; charset=utf-8';
const HTML_FRAGMENT_CONTENT_TYPE = 'text/html; charset=utf-8';
const NO_STORE = 'no-store';
const NOSNIFF = 'nosniff';
const CONTROL_PLANE_MODE_HEADER = 'x-facetheory-control-plane-csp-mode';
const STRICT_CSP_SUPPORTED_HEADER =
  'x-facetheory-control-plane-strict-csp-supported';

export interface ControlPlanePresetDescriptor {
  readonly contract: typeof CONTROL_PLANE_PRESET_CONTRACT;
  readonly surface_id: typeof CONTROL_PLANE_PRESET_SURFACE_ID;
  readonly csp: {
    readonly mode: ControlPlaneCspMode;
    readonly strict_csp_supported: true;
  };
  readonly render: {
    readonly shell_first: true;
    readonly critical_path_data: false;
  };
  readonly asset_serving: {
    readonly content_type: typeof JAVASCRIPT_CONTENT_TYPE;
    readonly nosniff: true;
    readonly head_mirrors_get: true;
  };
  readonly nav_pending: {
    readonly indicator_id_collision_proof: true;
    readonly observe_only_form_pending: true;
  };
}

export interface ControlPlaneGateAccepted {
  ok: true;
  plane?: string | undefined;
  tenant?: string | undefined;
  claims?: unknown;
}

export interface ControlPlaneGateRejected {
  ok: false;
  status?: number | undefined;
  title?: string | undefined;
  message?: string | undefined;
  headers?: Record<string, string | readonly string[]> | undefined;
  cookies?: string[] | undefined;
}

export type ControlPlaneGateResult =
  | ControlPlaneGateAccepted
  | ControlPlaneGateRejected;

export type ControlPlaneGate = (
  ctx: FaceContext,
) => ControlPlaneGateResult | Promise<ControlPlaneGateResult>;

export interface ControlPlaneSectionReadContract {
  bounded: true;
  tenantScoped: true;
}

export interface ControlPlaneDataSection<Data = unknown> {
  id: string;
  title?: string | undefined;
  read: ControlPlaneSectionReadContract;
  loadingHtml?: string | undefined;
  emptyHtml?: string | undefined;
  errorHtml?: string | undefined;
  load: (
    ctx: FaceContext,
    gate: ControlPlaneGateAccepted,
  ) => Data | Promise<Data>;
  render: (
    ctx: FaceContext,
    data: Data,
    gate: ControlPlaneGateAccepted,
  ) => string | Promise<string>;
}

export interface ControlPlaneSectionRenderInfo {
  id: string;
  title: string | null;
  src: string | null;
  loadingHtml: string;
}

export interface ControlPlaneShellHelpers {
  readonly cspMode: ControlPlaneCspMode;
  readonly delivery: ControlPlaneDeliveryCapability;
  readonly section: (sectionId: string) => string;
  readonly sections: readonly ControlPlaneSectionRenderInfo[];
}

export interface ControlPlaneFace<Data = unknown> {
  route: string;
  mode?: Extract<FaceMode, 'ssr'> | undefined;
  title?: string | undefined;
  lang?: string | undefined;
  headTags?: FaceHeadTag[] | undefined;
  htmlAttrs?: FaceRenderResult['htmlAttrs'];
  bodyAttrs?: FaceRenderResult['bodyAttrs'];
  sections?: Array<ControlPlaneDataSection<Data>> | undefined;
  renderShell?: (
    ctx: FaceContext,
    helpers: ControlPlaneShellHelpers,
    gate: ControlPlaneGateAccepted,
  ) => string | Promise<string>;
}

export interface ControlPlaneCspOptions {
  mode?: ControlPlaneCspMode | undefined;
}

export interface ControlPlaneDeliveryOptions {
  capability?: ControlPlaneDeliveryCapability | undefined;
}

export interface ControlPlaneAppOptions {
  faces: ControlPlaneFace[];
  gate: ControlPlaneGate;
  csp?: ControlPlaneCspOptions | undefined;
  delivery?: ControlPlaneDeliveryOptions | undefined;
  resources?: FaceResourceRoute[] | undefined;
  assets?: ControlPlaneBrowserAsset[] | undefined;
  faceApp?: Omit<FaceAppOptions, 'faces' | 'resources'> | undefined;
}

export interface ControlPlaneBrowserAsset {
  route: string;
  body: string | Uint8Array;
  contentType?: string | undefined;
  cacheControl?: string | null | undefined;
}

interface NormalizedControlPlaneDataSection<Data = unknown>
  extends ControlPlaneDataSection<Data> {
  endpoint: string;
  slug: string;
}

interface NormalizedControlPlaneFace {
  face: ControlPlaneFace;
  route: string;
  routeSlug: string;
  sections: NormalizedControlPlaneDataSection[];
}

interface NormalizedControlPlaneAppOptions {
  cspMode: ControlPlaneCspMode;
  delivery: ControlPlaneDeliveryCapability;
  gate: ControlPlaneGate;
}

export function createControlPlaneApp(
  options: ControlPlaneAppOptions,
): FaceApp {
  const normalizedOptions = normalizeControlPlaneAppOptions(options);
  const normalizedFaces = normalizeControlPlaneFaces(options.faces);
  const faces = normalizedFaces.map((face) =>
    createPresetFace(face, normalizedOptions),
  );
  const resources = [
    ...createControlPlaneAssetRoutes([
      ...defaultControlPlaneAssets(),
      ...(options.assets ?? []),
    ]),
    ...createControlPlaneSectionRoutes(normalizedFaces, normalizedOptions),
    ...(options.resources ?? []),
  ];

  return createFaceApp({
    ...(options.faceApp ?? {}),
    faces,
    resources,
  });
}

export function createControlPlanePresetDescriptor(
  mode: ControlPlaneCspMode = 'relaxed',
): ControlPlanePresetDescriptor {
  return {
    contract: CONTROL_PLANE_PRESET_CONTRACT,
    surface_id: CONTROL_PLANE_PRESET_SURFACE_ID,
    csp: {
      mode,
      strict_csp_supported: CONTROL_PLANE_STRICT_CSP_SUPPORTED,
    },
    render: {
      shell_first: true,
      critical_path_data: false,
    },
    asset_serving: {
      content_type: JAVASCRIPT_CONTENT_TYPE,
      nosniff: true,
      head_mirrors_get: true,
    },
    nav_pending: {
      indicator_id_collision_proof: true,
      observe_only_form_pending: true,
    },
  };
}

export function createControlPlaneAssetRoutes(
  assets: readonly ControlPlaneBrowserAsset[],
): FaceResourceRoute[] {
  return assets.map((asset) => {
    const route = normalizePath(asset.route);
    const body = asset.body instanceof Uint8Array ? asset.body : utf8(asset.body);
    const contentType = asset.contentType ?? JAVASCRIPT_CONTENT_TYPE;
    const cacheControl = asset.cacheControl === undefined ? NO_STORE : asset.cacheControl;

    return {
      route,
      handle: (ctx) => {
        const method = ctx.request.method;
        if (method !== 'GET' && method !== 'HEAD') {
          return methodNotAllowedResourceResponse(['GET', 'HEAD']);
        }

        return staticAssetResponse({
          body: method === 'HEAD' ? new Uint8Array() : body,
          cacheControl,
          contentType,
        });
      },
    } satisfies FaceResourceRoute;
  });
}

export function controlPlaneStylesheetHeadTag(
  href = CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH,
): FaceHeadTag {
  return {
    type: 'link',
    attrs: { rel: 'stylesheet', href },
  };
}

export function controlPlaneBootstrapHeadTag(
  src = CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
): FaceHeadTag {
  return {
    type: 'script',
    attrs: { type: 'module', src },
  };
}

function normalizeControlPlaneAppOptions(
  options: ControlPlaneAppOptions,
): NormalizedControlPlaneAppOptions {
  const cspMode = options.csp?.mode ?? 'relaxed';
  if (cspMode !== 'relaxed' && cspMode !== 'strict') {
    throw new TypeError('control-plane csp.mode must be "relaxed" or "strict"');
  }

  const delivery = options.delivery?.capability ?? 'client-fill';
  if (delivery !== 'client-fill' && delivery !== 'streaming') {
    throw new TypeError(
      'control-plane delivery.capability must be "client-fill" or "streaming"',
    );
  }

  return { cspMode, delivery, gate: options.gate };
}

function normalizeControlPlaneFaces(
  faces: readonly ControlPlaneFace[],
): NormalizedControlPlaneFace[] {
  return faces.map((face, index) => {
    const route = normalizePath(face.route);
    const routeSlug = slugForRoute(route, index);
    const seenSections = new Set<string>();
    const sections = (face.sections ?? []).map((section) => {
      assertSectionReadContract(section);
      const slug = slugForId(section.id);
      if (seenSections.has(slug)) {
        throw new Error(`duplicate control-plane section id: ${section.id}`);
      }
      seenSections.add(slug);
      return {
        ...section,
        endpoint: `${CONTROL_PLANE_SECTION_PREFIX}/${routeSlug}/${slug}`,
        slug,
      };
    });

    return { face, route, routeSlug, sections };
  });
}

function assertSectionReadContract(section: ControlPlaneDataSection): void {
  if (section.read.bounded !== true || section.read.tenantScoped !== true) {
    throw new Error(
      `control-plane section "${section.id}" must declare bounded tenant-scoped reads`,
    );
  }
}

function createPresetFace(
  normalized: NormalizedControlPlaneFace,
  options: NormalizedControlPlaneAppOptions,
): FaceModule {
  return {
    route: normalized.route,
    mode: 'ssr',
    render: async (ctx) => {
      const gate = await options.gate(ctx);
      if (!gate.ok) return deniedControlPlaneResult(gate, options.cspMode);

      const helpers = createShellHelpers(normalized, ctx, gate, options);
      const base = await baseControlPlaneResult(normalized, ctx, gate, helpers, options);
      if (options.delivery === 'streaming') {
        return {
          ...base,
          html: streamControlPlaneSections(base.html, normalized, ctx, gate),
        };
      }
      return base;
    },
  };
}

async function baseControlPlaneResult(
  normalized: NormalizedControlPlaneFace,
  ctx: FaceContext,
  gate: ControlPlaneGateAccepted,
  helpers: ControlPlaneShellHelpers,
  options: NormalizedControlPlaneAppOptions,
): Promise<FaceRenderResult> {
  const face = normalized.face;
  const shell = face.renderShell
    ? await face.renderShell(ctx, helpers, gate)
    : renderDefaultControlPlaneShell(helpers);

  const headTags = [
    controlPlaneStylesheetHeadTag(),
    ...(face.headTags ?? []),
    controlPlaneBootstrapHeadTag(),
  ];

  const headers: Record<string, string> = {
    [CONTROL_PLANE_MODE_HEADER]: options.cspMode,
    [STRICT_CSP_SUPPORTED_HEADER]: 'true',
  };

  const result: FaceRenderResult = {
    headers,
    head: { title: face.title ?? 'Control Plane' },
    headTags,
    html: shell,
  };
  if (face.lang !== undefined) result.lang = face.lang;
  if (face.htmlAttrs !== undefined) result.htmlAttrs = face.htmlAttrs;
  result.bodyAttrs = {
    ...(face.bodyAttrs ?? {}),
    'data-facetheory-control-plane': true,
    'data-facetheory-control-plane-csp-mode': options.cspMode,
    'data-facetheory-control-plane-delivery': options.delivery,
  };
  if (options.cspMode === 'strict') {
    result.csp = { inlineScripts: false, inlineStyles: false, rawHead: false };
  }
  return result;
}

function createShellHelpers(
  normalized: NormalizedControlPlaneFace,
  ctx: FaceContext,
  _gate: ControlPlaneGateAccepted,
  options: NormalizedControlPlaneAppOptions,
): ControlPlaneShellHelpers {
  const infos = normalized.sections.map((section) => ({
    id: section.id,
    title: section.title ?? null,
    src:
      options.delivery === 'client-fill'
        ? sectionEndpointForRequest(section.endpoint, ctx)
        : null,
    loadingHtml: section.loadingHtml ?? defaultSectionLoadingHtml(section),
  }));
  const byId = new Map(infos.map((info) => [info.id, info] as const));

  return {
    cspMode: options.cspMode,
    delivery: options.delivery,
    section: (sectionId) => {
      const info = byId.get(sectionId);
      if (!info) throw new Error(`unknown control-plane section: ${sectionId}`);
      return renderSectionFrame(info);
    },
    sections: infos,
  };
}

function renderDefaultControlPlaneShell(
  helpers: ControlPlaneShellHelpers,
): string {
  const sections = helpers.sections.map((section) => helpers.section(section.id)).join('');
  return `<main data-facetheory-view data-facetheory-control-plane-shell="true">${sections}</main>`;
}

function renderSectionFrame(section: ControlPlaneSectionRenderInfo): string {
  const title = section.title
    ? `<h2 class="facetheory-control-plane-section__title">${escapeHtml(section.title)}</h2>`
    : '';
  const srcAttr = section.src
    ? ` data-facetheory-section-src="${escapeHtml(section.src)}"`
    : '';
  return `<section class="facetheory-control-plane-section" data-facetheory-control-section="${escapeHtml(section.id)}" data-state="loading"${srcAttr}>${title}<div class="facetheory-control-plane-section__body">${section.loadingHtml}</div></section>`;
}

async function* streamControlPlaneSections(
  shell: string | AsyncIterable<Uint8Array>,
  normalized: NormalizedControlPlaneFace,
  ctx: FaceContext,
  gate: ControlPlaneGateAccepted,
): AsyncIterable<Uint8Array> {
  if (typeof shell === 'string') {
    yield utf8(shell);
  } else {
    for await (const chunk of shell) yield chunk;
  }

  for (const section of normalized.sections) {
    const html = await renderSectionDataHtml(section, ctx, gate);
    yield utf8(
      `<section class="facetheory-control-plane-section facetheory-control-plane-section--streamed" data-facetheory-control-streamed-section="${escapeHtml(section.id)}" data-state="success"><div class="facetheory-control-plane-section__body">${html}</div></section>`,
    );
  }
}

function createControlPlaneSectionRoutes(
  faces: readonly NormalizedControlPlaneFace[],
  options: NormalizedControlPlaneAppOptions,
): FaceResourceRoute[] {
  const routes: FaceResourceRoute[] = [];
  for (const face of faces) {
    for (const section of face.sections) {
      routes.push({
        route: section.endpoint,
        handle: async (ctx) => {
          if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
            return methodNotAllowedResourceResponse(['GET', 'HEAD']);
          }
          const gate = await options.gate(ctx);
          if (!gate.ok) return deniedSectionResponse(gate);
          const html = await renderSectionDataHtml(section, ctx, gate);
          return sectionHtmlResponse(html, ctx.request.method === 'HEAD');
        },
      });
    }
  }
  return routes;
}

async function renderSectionDataHtml<Data>(
  section: NormalizedControlPlaneDataSection<Data>,
  ctx: FaceContext,
  gate: ControlPlaneGateAccepted,
): Promise<string> {
  try {
    const data = await section.load(ctx, gate);
    const rendered = await section.render(ctx, data, gate);
    if (!String(rendered).trim() && section.emptyHtml !== undefined) {
      return section.emptyHtml;
    }
    return rendered;
  } catch {
    return section.errorHtml ?? defaultSectionErrorHtml(section);
  }
}

function sectionHtmlResponse(html: string, headOnly: boolean): FaceResponse {
  const response = textResourceResponse(headOnly ? '' : html, {
    contentType: HTML_FRAGMENT_CONTENT_TYPE,
    headers: { 'x-content-type-options': NOSNIFF },
  });
  return response;
}

function deniedSectionResponse(gate: ControlPlaneGateRejected): FaceResponse {
  const status = normalizeHttpStatus(gate.status ?? 403);
  return jsonResourceResponse(
    {
      error: gate.title ?? 'Forbidden',
      message: gate.message ?? 'The requested control-plane section is not available.',
    },
    { status, headers: { 'x-content-type-options': NOSNIFF } },
  );
}

function deniedControlPlaneResult(
  gate: ControlPlaneGateRejected,
  cspMode: ControlPlaneCspMode,
): FaceRenderResult {
  const status = normalizeHttpStatus(gate.status ?? 403);
  const title = gate.title ?? (status === 401 ? 'Unauthorized' : 'Forbidden');
  const message = gate.message ?? 'This control-plane surface is not available.';
  const result: FaceRenderResult = {
    status,
    headers: {
      ...(gate.headers ?? {}),
      [CONTROL_PLANE_MODE_HEADER]: cspMode,
      [STRICT_CSP_SUPPORTED_HEADER]: 'true',
    },
    head: { title },
    headTags: [controlPlaneStylesheetHeadTag()],
    html: `<main data-facetheory-control-plane-gate="denied"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main>`,
  };
  if (gate.cookies !== undefined) result.cookies = gate.cookies;
  if (cspMode === 'strict') {
    result.csp = { inlineScripts: false, inlineStyles: false, rawHead: false };
  }
  return result;
}

function staticAssetResponse(input: {
  body: Uint8Array;
  cacheControl: string | null;
  contentType: string;
}): FaceResponse {
  return {
    status: 200,
    headers: sortHeaderValues({
      ...(input.cacheControl === null ? {} : { 'cache-control': [input.cacheControl] }),
      'content-type': [input.contentType],
      'x-content-type-options': [NOSNIFF],
    }),
    cookies: [],
    body: input.body,
    isBase64: false,
  };
}

function defaultControlPlaneAssets(): ControlPlaneBrowserAsset[] {
  return [
    {
      route: CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH,
      body: CONTROL_PLANE_STYLESHEET,
      contentType: CSS_CONTENT_TYPE,
    },
    {
      route: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
      body: CONTROL_PLANE_BOOTSTRAP_MODULE,
      contentType: JAVASCRIPT_CONTENT_TYPE,
    },
  ];
}

function sectionEndpointForRequest(endpoint: string, ctx: FaceContext): string {
  const current = encodeURIComponent(ctx.request.path);
  return `${endpoint}?facetheory_path=${current}`;
}

function defaultSectionLoadingHtml(section: ControlPlaneDataSection): string {
  const label = section.title ? `${section.title} loading` : 'Loading';
  return `<div class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-async-boundary" data-state="loading"><div class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-loading-state" role="status" aria-live="polite" aria-busy="true"><div class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-loading-state__content"><span class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-spinner ${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-spinner--sm ${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-spinner--primary" role="status" aria-label="${escapeHtml(label)}"><svg class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-spinner__glyph" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><span class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-visually-hidden">${escapeHtml(label)}</span></span><p class="${RESPONSIVE_PRIMITIVES_CLASS_PREFIX}-loading-state__message">Loading…</p></div></div></div>`;
}

function defaultSectionErrorHtml<Data>(
  section: ControlPlaneDataSection<Data>,
): string {
  const title = section.title ?? section.id;
  return `<div class="facetheory-control-plane-section__error" role="alert">${escapeHtml(title)} failed to load.</div>`;
}

function slugForRoute(route: string, index: number): string {
  const slug = slugForId(route);
  return slug === 'root' ? `root-${String(index)}` : slug;
}

function slugForId(value: string): string {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'root';
}

function normalizeHttpStatus(value: number): number {
  const status = Math.trunc(Number(value));
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) return 500;
  return status;
}

function sortHeaderValues(headers: Record<string, string[]>): Record<string, string[]> {
  const sorted: Record<string, string[]> = {};
  for (const key of Object.keys(headers).sort()) sorted[key] = headers[key] ?? [];
  return sorted;
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const CONTROL_PLANE_STYLESHEET = `${RESPONSIVE_PRIMITIVES_CSS}
.facetheory-control-plane-section {
  display: block;
  margin-block: var(--stitch-space-md, 1rem);
  padding: var(--stitch-space-md, 1rem);
  border: 1px solid var(--stitch-color-outline-variant, #c6c5d0);
  border-radius: var(--stitch-radius-lg, 12px);
  background: var(--stitch-color-surface, #ffffff);
  color: var(--stitch-color-on-surface, #131b2e);
}

.facetheory-control-plane-section__title {
  margin: 0 0 var(--stitch-space-sm, 0.75rem);
  font: inherit;
  font-weight: 700;
}

.facetheory-control-plane-section__body {
  min-block-size: 2rem;
}

.facetheory-control-plane-section__error {
  color: var(--stitch-color-error, #ba1a1a);
}

.facetheory-navigation-pending-pill {
  position: fixed;
  inset-block-start: var(--stitch-space-md, 1rem);
  inset-inline-end: var(--stitch-space-md, 1rem);
  z-index: var(--facetheory-navigation-pending-z-index, 2147483647);
  padding: 0.5rem 0.75rem;
  border-radius: 999px;
  background: var(--stitch-color-primary, #2f55d4);
  color: var(--stitch-color-on-primary, #ffffff);
  box-shadow: 0 0.5rem 1.5rem rgba(19, 27, 46, 0.18);
  font: inherit;
  font-weight: 700;
}

.facetheory-navigation-pending-control[aria-busy='true'] {
  cursor: progress;
}

@media (prefers-reduced-motion: reduce) {
  .facetheory-navigation-pending-pill {
    transition: none;
  }
}
`;

export const CONTROL_PLANE_BOOTSTRAP_MODULE = `const NAV_ATTR=${JSON.stringify(NAVIGATION_PENDING_ATTRIBUTE)};
const INDICATOR_ATTR=${JSON.stringify(NAVIGATION_PENDING_INDICATOR_ATTRIBUTE)};
const DEFAULT_INDICATOR_ID=${JSON.stringify(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID)};
function sameOriginUrl(href){try{const url=new URL(href,window.location.href);return url.origin===window.location.origin?url:null;}catch{return null;}}
function acceptedAnchor(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.altKey||event.ctrlKey||event.shiftKey)return null;const target=event.target instanceof Element?event.target.closest('a[href]'):null;if(!(target instanceof HTMLAnchorElement))return null;if(target.target&&target.target.toLowerCase()!=='_self')return null;if(target.hasAttribute('download')||target.hasAttribute('data-facetheory-reload'))return null;const rel=(target.getAttribute('rel')||'').toLowerCase().split(/\\s+/);if(rel.includes('external'))return null;const url=sameOriginUrl(target.href);if(!url||url.href===window.location.href)return null;return target;}
function isIndicator(el){return el instanceof HTMLElement&&el.getAttribute(INDICATOR_ATTR)==='true';}
function indicatorElement(id){const existing=document.getElementById(id);if(isIndicator(existing))return existing;if(!existing){const el=document.createElement('div');el.id=id;return el;}for(let i=1;i<1000;i+=1){const candidate=id+'-'+String(i);const next=document.getElementById(candidate);if(isIndicator(next))return next;if(!next){const el=document.createElement('div');el.id=candidate;console.warn('FaceTheory navigation pending indicator id "'+id+'" already belongs to a non-indicator element; using "'+candidate+'" instead.');return el;}}throw new Error('FaceTheory navigation pending could not allocate indicator id');}
function showPending(source,targets){for(const target of targets){target.setAttribute(NAV_ATTR,source);target.setAttribute('aria-busy','true');target.classList.add('facetheory-navigation-pending-control');}const el=indicatorElement(DEFAULT_INDICATOR_ID);el.textContent='Loading…';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');el.setAttribute(NAV_ATTR,source);el.setAttribute(INDICATOR_ATTR,'true');el.classList.add('facetheory-navigation-pending-pill');if(!el.parentNode)(document.body||document.documentElement).appendChild(el);}
function startNavigationPending(){document.addEventListener('click',event=>{const anchor=acceptedAnchor(event);if(anchor)showPending('link',[anchor]);});document.addEventListener('submit',event=>{const form=event.target instanceof HTMLFormElement?event.target:null;if(!form)return;const targets=[form];if(event.submitter instanceof HTMLElement)targets.push(event.submitter);showPending('form',targets);},true);}
async function fillSection(section){const src=section.getAttribute('data-facetheory-section-src');if(!src)return;try{const response=await fetch(src,{credentials:'same-origin',headers:{accept:'text/html'}});if(!response.ok)throw new Error('HTTP '+String(response.status));const html=await response.text();const body=section.querySelector('.facetheory-control-plane-section__body')||section;body.innerHTML=html;section.setAttribute('data-state','success');}catch(error){section.setAttribute('data-state','error');const body=section.querySelector('.facetheory-control-plane-section__body')||section;body.innerHTML='<div class="facetheory-control-plane-section__error" role="alert">Section failed to load.</div>';console.error('FaceTheory control-plane section fill failed',error);}}
function startClientFill(){for(const section of document.querySelectorAll('[data-facetheory-control-section][data-facetheory-section-src]'))void fillSection(section);}
export function startControlPlane(){startNavigationPending();startClientFill();}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',startControlPlane,{once:true});}else{startControlPlane();}
`;
