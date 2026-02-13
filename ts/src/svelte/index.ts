import type {
  FaceContext,
  FaceHead,
  FaceHeadTag,
  FaceHydration,
  FaceMode,
  FaceModule,
  FaceRenderResult,
  FaceStyleTag,
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
}

export interface SvelteRenderInput<Props = Record<string, unknown>> {
  component: unknown;
  props?: Props;
  /**
   * Optional CSS text emitted at build time (Svelte 5 emits CSS in compile output, not server render output).
   */
  cssText?: string;
}

export async function renderSvelte<Props extends Record<string, unknown>>(
  _ctx: FaceContext,
  input: SvelteRenderInput<Props>,
  options: RenderSvelteOptions = {},
): Promise<FaceRenderResult> {
  let rendered: SvelteSSRRenderResult;

  const maybeLegacy = input.component as Partial<SvelteLegacySSRComponent<Props>>;
  if (typeof maybeLegacy.render === 'function') {
    rendered = maybeLegacy.render(input.props);
  } else {
    const { render } = await import('svelte/server');
    const serverRenderOptions = input.props === undefined ? {} : { props: input.props };
    const out = render(input.component as any, serverRenderOptions as any);

    rendered = { html: String((out as any).body ?? (out as any).html ?? '') };

    const head = (out as any).head;
    if (head) rendered.head = String(head);

    const css = (out as any).css;
    if (css?.code) rendered.css = { code: String(css.code) };
  }

  const headTags: FaceHeadTag[] = [...(options.headTags ?? [])];
  const styleTags: FaceStyleTag[] = [...(options.styleTags ?? [])];

  if (rendered.head) {
    headTags.push({ type: 'raw', html: rendered.head });
  }
  const cssText = rendered.css?.code ?? input.cssText;
  if (cssText) {
    styleTags.push({
      cssText,
      attrs: { 'data-svelte': 'true' },
    });
  }

  const out: FaceRenderResult = { html: rendered.html };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;

  return out;
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
