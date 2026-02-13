import { createSSRApp, h, type VNode } from 'vue';
import { renderToString } from '@vue/server-renderer';

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

export interface RenderVueOptions {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
}

export async function renderVue(
  _ctx: FaceContext,
  vnode: VNode,
  options: RenderVueOptions = {},
): Promise<FaceRenderResult> {
  const app = createSSRApp({ render: () => vnode });
  const html = await renderToString(app);

  const headTags = options.headTags ?? [];
  const styleTags = options.styleTags ?? [];

  const out: FaceRenderResult = { html };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;

  return out;
}

export interface VueFaceOptions<Data = unknown> {
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => VNode | Promise<VNode>;
  renderOptions?:
    | RenderVueOptions
    | ((ctx: FaceContext, data: Data) => RenderVueOptions | Promise<RenderVueOptions>);
}

export function createVueFace<Data = unknown>(options: VueFaceOptions<Data>): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const vnode = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderVue(ctx, vnode, renderOptions);
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (ctx: FaceContext) => Promise<unknown>;
  }

  return mod;
}

export { h };

