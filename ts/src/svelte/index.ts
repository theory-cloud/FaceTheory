import type {
  FaceContext,
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
  html: string;
  css?: { code: string };
  head?: string;
}

export interface SvelteLegacySSRComponent<Props = Record<string, unknown>> {
  render: (props?: Props) => SvelteSSRRenderResult;
}

export interface RenderSvelteOptions {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
  integrations?: Array<SvelteUIIntegration>;
}

export interface SvelteRenderInput<Props = Record<string, unknown>> {
  component: unknown;
  props?: Props;
  /**
   * Optional CSS text emitted at build time (Svelte 5 emits CSS in compile output, not server render output).
   */
  cssText?: string;
}

export type SvelteUIIntegration<Props extends Record<string, unknown> = Record<string, unknown>> =
  UIIntegration<SvelteRenderInput<Props>>;

export async function renderSvelte<Props extends Record<string, unknown>>(
  ctx: FaceContext,
  input: SvelteRenderInput<Props>,
  options: RenderSvelteOptions = {},
): Promise<FaceRenderResult> {
  const integrations = (options.integrations ?? []) as Array<SvelteUIIntegration<Props>>;

  let currentInput: SvelteRenderInput<Props> = input;
  for (const integration of integrations) {
    if (!integration.wrapTree) continue;
    currentInput = integration.wrapTree(currentInput, ctx);
  }

  const integrationHeadTags: FaceHeadTag[] = [];
  const integrationStyleTags: FaceStyleTag[] = [];
  for (const integration of integrations) {
    if (!integration.contribute) continue;
    const contribution = await integration.contribute(ctx);
    if (contribution.headTags) integrationHeadTags.push(...contribution.headTags);
    if (contribution.styleTags) integrationStyleTags.push(...contribution.styleTags);
  }

  let rendered: SvelteSSRRenderResult;

  const maybeLegacy = currentInput.component as Partial<SvelteLegacySSRComponent<Props>>;
  if (typeof maybeLegacy.render === 'function') {
    try {
      rendered = maybeLegacy.render(currentInput.props);
    } catch (err) {
      if (!isSvelte5DeprecatedRenderError(err)) throw err;
      rendered = await renderWithSvelteServer(currentInput.component, currentInput.props);
    }
  } else {
    rendered = await renderWithSvelteServer(currentInput.component, currentInput.props);
  }

  const headTags: FaceHeadTag[] = [...integrationHeadTags, ...(options.headTags ?? [])];
  const styleTags: FaceStyleTag[] = [...integrationStyleTags, ...(options.styleTags ?? [])];

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

  let out: FaceRenderResult = { html: rendered.html };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;

  for (const integration of integrations) {
    if (!integration.finalize) continue;
    out = await integration.finalize(out, ctx);
  }

  return out;
}

function isSvelte5DeprecatedRenderError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('Component.render(...) is no longer valid in Svelte 5');
}

async function renderWithSvelteServer<Props extends Record<string, unknown>>(
  component: unknown,
  props: Props | undefined,
): Promise<SvelteSSRRenderResult> {
  const { render } = await import('svelte/server');
  const serverRenderOptions = props === undefined ? {} : { props };
  const out = render(component as any, serverRenderOptions as any);

  const rendered: SvelteSSRRenderResult = {
    html: String((out as any).body ?? (out as any).html ?? ''),
  };

  const head = (out as any).head;
  if (head) rendered.head = String(head);

  const css = (out as any).css;
  if (css?.code) rendered.css = { code: String(css.code) };

  return rendered;
}

export interface SvelteFaceOptions<
  Data = unknown,
  Props extends Record<string, unknown> = Record<string, unknown>,
> {
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => SvelteRenderInput<Props> | Promise<SvelteRenderInput<Props>>;
  renderOptions?:
    | RenderSvelteOptions
    | ((ctx: FaceContext, data: Data) => RenderSvelteOptions | Promise<RenderSvelteOptions>);
}

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
      return renderSvelte(ctx, input, renderOptions);
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (ctx: FaceContext) => Promise<unknown>;
  }

  return mod;
}
