import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';

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

export interface RenderReactOptions {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
  integrations?: Array<UIIntegration<React.ReactElement>>;
}

export async function renderReact(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactOptions = {},
): Promise<FaceRenderResult> {
  const integrations = options.integrations ?? [];

  let tree: React.ReactElement = React.createElement(React.Fragment, null, node);

  for (const integration of integrations) {
    if (integration.wrapTree) {
      tree = integration.wrapTree(tree, ctx);
    }
  }

  const integrationHeadTags: FaceHeadTag[] = [];
  const integrationStyleTags: FaceStyleTag[] = [];

  for (const integration of integrations) {
    if (!integration.contribute) continue;
    const contribution = await integration.contribute(ctx);
    if (contribution.headTags) integrationHeadTags.push(...contribution.headTags);
    if (contribution.styleTags) integrationStyleTags.push(...contribution.styleTags);
  }

  const html = ReactDOMServer.renderToString(tree);
  const headTags = [...integrationHeadTags, ...(options.headTags ?? [])];
  const styleTags = [...integrationStyleTags, ...(options.styleTags ?? [])];

  let out: FaceRenderResult = { html };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;

  for (const integration of integrations) {
    if (integration.finalize) {
      out = await integration.finalize(out, ctx);
    }
  }

  return out;
}

export interface ReactFaceOptions<Data = unknown> {
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => React.ReactNode | Promise<React.ReactNode>;
  renderOptions?:
    | RenderReactOptions
    | ((ctx: FaceContext, data: Data) => RenderReactOptions | Promise<RenderReactOptions>);
}

export function createReactFace<Data = unknown>(
  options: ReactFaceOptions<Data>,
): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const tree = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderReact(ctx, tree, renderOptions);
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (ctx: FaceContext) => Promise<unknown>;
  }

  return mod;
}

