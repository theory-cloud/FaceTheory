import { enforceAdapterStrictCspResult } from '../adapter-csp.js';
import {
  modeUsesRuntimeHydrationSidecars,
  runAdapterRenderPipeline,
} from '../adapter-pipeline.js';
import type {
  FaceContext,
  FaceCspPolicy,
  FaceHead,
  FaceHeadTag,
  FaceHydration,
  FaceMode,
  FaceModule,
  FaceRenderResult,
  FaceStyleTag,
  UIIntegration,
} from '../types.js';

export interface SvelteSSRRenderResult {
  /** Server-rendered body fragment produced by Svelte. */
  html: string;
  /** Optional CSS emitted by legacy/pre-rendered Svelte inputs. */
  css?: { code: string };
  /** Optional raw Svelte head output; strict CSP rejects this in no-raw-head mode. */
  head?: string;
}

/**
 * A synchronous "bring-your-own-HTML" render input: any object exposing a
 * `render(props)` that returns pre-rendered `{ html, head?, css? }`. This is not
 * a Svelte-4 compiled component (FaceTheory requires Svelte >=5.55.7); it is the
 * escape hatch for callers supplying externally/hand-rendered markup. Compiled
 * Svelte 5 components have no `.render()` and go through `svelte/server` instead.
 */
export interface SvelteLegacySSRComponent<Props = Record<string, unknown>> {
  render: (props?: Props) => SvelteSSRRenderResult;
}

export interface RenderSvelteOptions {
  /** HTTP status for the rendered Face response. */
  status?: number;
  /** Additional response headers merged into the Face response. */
  headers?: Record<string, string | string[]>;
  /** Set-Cookie header values emitted with the response. */
  cookies?: string[];
  /** Structured document head shortcut, usually `{ title }`. */
  head?: FaceHead;
  /** Deterministic head tags emitted through FaceTheory's head primitive. */
  headTags?: FaceHeadTag[];
  /** Deterministic style tags emitted by adapter integrations. */
  styleTags?: FaceStyleTag[];
  /** Hydration payload or external sidecar reference for the client bootstrap. */
  hydration?: FaceHydration;
  /** Strict-CSP policy requested by this render. */
  csp?: FaceCspPolicy;
  /** Svelte UI integrations for wrapping render input and contributing head/styles. */
  integrations?: Array<SvelteUIIntegration>;
}

export interface SvelteRenderInput<Props = Record<string, unknown>> {
  /** Compiled Svelte 5 component, or a synchronous pre-rendered legacy input. */
  component: unknown;
  /** Props passed to the component during server rendering. */
  props?: Props;
  /**
   * Optional CSS text emitted at build time (Svelte 5 emits CSS in compile output, not server render output).
   */
  cssText?: string;
}

/**
 * Adapter-neutral integration hook specialized to Svelte render inputs.
 */
export type SvelteUIIntegration<
  Props extends Record<string, unknown> = Record<string, unknown>,
  TState = unknown,
> = UIIntegration<SvelteRenderInput<Props>, TState>;

/**
 * Render a Svelte component/input through the buffered adapter path and return a
 * FaceTheory `FaceRenderResult` with deterministic head, style, hydration, and
 * strict-CSP validation.
 */
export async function renderSvelte<Props extends Record<string, unknown>>(
  ctx: FaceContext,
  input: SvelteRenderInput<Props>,
  options: RenderSvelteOptions = {},
): Promise<FaceRenderResult> {
  return renderSvelteInternal(ctx, input, options);
}

interface SvelteRenderValidationOptions {
  deferStrictCspHydrationValidation?: boolean;
}

async function renderSvelteInternal<Props extends Record<string, unknown>>(
  ctx: FaceContext,
  input: SvelteRenderInput<Props>,
  options: RenderSvelteOptions,
  validationOptions: SvelteRenderValidationOptions = {},
): Promise<FaceRenderResult> {
  return runAdapterRenderPipeline<
    SvelteRenderInput<Props>,
    SvelteUIIntegration<Props>
  >({
    ctx,
    tree: input,
    options,
    integrations: (options.integrations ?? []) as Array<
      SvelteUIIntegration<Props>
    >,
    renderTree: async (currentInput) => {
      const rendered = await renderSvelteInput(currentInput);
      const headTags: FaceHeadTag[] = [];
      const styleTags: FaceStyleTag[] = [];

      if (rendered.head) {
        headTags.push({ type: 'raw', html: rendered.head });
      }
      const cssText = rendered.css?.code ?? currentInput.cssText;
      if (cssText) {
        styleTags.push({
          cssText,
          attrs: { 'data-svelte': 'true' },
        });
      }

      return {
        html: rendered.html,
        headTags,
        styleTags,
      };
    },
    enforceStrictCsp: (out) => {
      enforceAdapterStrictCspResult(out, {
        adapterName: 'Svelte adapter',
        deferHydrationValidation:
          validationOptions.deferStrictCspHydrationValidation === true,
      });
    },
  });
}

async function renderSvelteInput<Props extends Record<string, unknown>>(
  input: SvelteRenderInput<Props>,
): Promise<SvelteSSRRenderResult> {
  // FaceTheory requires Svelte >=5.55.7. Compiled Svelte 5 components expose no
  // static `.render()`, so they render through `svelte/server` below. The
  // synchronous `.render()` fast path is retained only for
  // `SvelteLegacySSRComponent` inputs (pre-rendered `{ html, head?, css? }`).
  // The former Svelte 4->5 `.render()` deprecation-error fallback is removed
  // with Svelte 4 support: under Svelte 5-only there is no legacy compiled
  // component whose `.render()` would throw and need bridging to `svelte/server`.
  const maybeLegacy = input.component as Partial<
    SvelteLegacySSRComponent<Props>
  >;
  if (typeof maybeLegacy.render === 'function') {
    return maybeLegacy.render(input.props);
  }

  return renderWithSvelteServer(input.component, input.props);
}

async function renderWithSvelteServer<Props extends Record<string, unknown>>(
  component: unknown,
  props: Props | undefined,
): Promise<SvelteSSRRenderResult> {
  const { render } = (await import('svelte/server')) as unknown as {
    render: (component: unknown, options?: unknown) => unknown;
  };
  const serverRenderOptions: unknown = props === undefined ? {} : { props };
  const outUnknown = render(component, serverRenderOptions);
  const out =
    outUnknown && typeof outUnknown === 'object'
      ? (outUnknown as Record<string, unknown>)
      : {};

  const rendered: SvelteSSRRenderResult = {
    html: String(out.body ?? out.html ?? ''),
  };

  const head = out.head;
  if (head) rendered.head = String(head);

  const cssUnknown = out.css;
  if (cssUnknown && typeof cssUnknown === 'object') {
    const css = cssUnknown as Record<string, unknown>;
    if (css.code) rendered.css = { code: String(css.code) };
  }

  return rendered;
}

export interface SvelteFaceOptions<
  Data = unknown,
  Props extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Route pattern registered with `createFaceApp()`. */
  route: string;
  /** FaceTheory render mode for this Svelte Face. */
  mode: FaceMode;
  /** Optional server-side data loader; cache behavior follows the selected mode. */
  load?: (ctx: FaceContext) => Promise<Data>;
  /** Returns the Svelte render input for the request/build. */
  render: (
    ctx: FaceContext,
    data: Data,
  ) => SvelteRenderInput<Props> | Promise<SvelteRenderInput<Props>>;
  /** Static or request-derived render options passed to `renderSvelte()`. */
  renderOptions?:
    | RenderSvelteOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderSvelteOptions | Promise<RenderSvelteOptions>);
}

/**
 * Create a Svelte `FaceModule` while preserving FaceTheory's mode, hydration,
 * head/style, and strict-CSP contracts.
 */
export function createSvelteFace<
  Data = unknown,
  Props extends Record<string, unknown> = Record<string, unknown>,
>(options: SvelteFaceOptions<Data, Props>): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const input = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderSvelteInternal(ctx, input, renderOptions, {
        deferStrictCspHydrationValidation: modeUsesRuntimeHydrationSidecars(
          options.mode,
        ),
      });
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (
      ctx: FaceContext,
    ) => Promise<unknown>;
  }

  return mod;
}
