import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assembleFaceRenderResult,
  modeUsesRuntimeHydrationSidecars,
  runAdapterRenderPipeline,
} from '../../src/adapter-pipeline.js';
import type { FaceContext, UIIntegration } from '../../src/types.js';

const ctx: FaceContext = {
  params: {},
  proxy: null,
  request: {
    body: new Uint8Array(),
    cookies: {},
    cspNonce: null,
    headers: {},
    isBase64: false,
    method: 'GET',
    path: '/',
    query: {},
  },
};

test('adapter pipeline: modeUsesRuntimeHydrationSidecars preserves current modes', () => {
  assert.equal(modeUsesRuntimeHydrationSidecars('ssr'), true);
  assert.equal(modeUsesRuntimeHydrationSidecars('ssg'), true);
  assert.equal(modeUsesRuntimeHydrationSidecars('isr'), true);
  assert.equal(modeUsesRuntimeHydrationSidecars('spa'), false);
});

test('adapter pipeline: assembleFaceRenderResult preserves deterministic tag order', () => {
  const out = assembleFaceRenderResult({
    html: '<main>ok</main>',
    integrationHeadTags: [{ type: 'meta', attrs: { name: 'integration' } }],
    integrationStyleTags: [{ cssText: '.integration{}' }],
    options: {
      status: 202,
      headers: { 'x-test': 'yes' },
      cookies: ['a=b'],
      head: { title: 'Pipeline' },
      headTags: [{ type: 'meta', attrs: { name: 'options' } }],
      styleTags: [{ cssText: '.options{}' }],
      hydration: { data: { ok: true }, bootstrapModule: '/assets/app.js' },
      csp: { inlineScripts: false },
    },
    adapterHeadTags: [{ type: 'meta', attrs: { name: 'adapter' } }],
    adapterStyleTags: [{ cssText: '.adapter{}' }],
  });

  assert.equal(out.status, 202);
  assert.deepEqual(out.headers, { 'x-test': 'yes' });
  assert.deepEqual(out.cookies, ['a=b']);
  assert.deepEqual(
    out.headTags?.map((tag) => tag.type === 'meta' && tag.attrs.name),
    ['integration', 'options', 'adapter'],
  );
  assert.deepEqual(
    out.styleTags?.map((tag) => tag.cssText),
    ['.integration{}', '.options{}', '.adapter{}'],
  );
});

test('adapter pipeline: runs prepare, wrap, render, contribute, finalize, enforce in order', async () => {
  const events: string[] = [];
  const integration: UIIntegration<string> = {
    name: 'ordering',
    createState: () => {
      events.push('prepare');
      return { suffix: '!' };
    },
    wrapTree: (tree, _ctx, state) => {
      const suffix = (state as { suffix: string }).suffix;
      events.push(`wrap:${suffix}`);
      return `${tree}${suffix}`;
    },
    contribute: (_ctx, state) => {
      const suffix = (state as { suffix: string }).suffix;
      events.push(`contribute:${suffix}`);
      return {
        headTags: [{ type: 'meta', attrs: { name: 'contribute' } }],
        styleTags: [{ cssText: '.contribute{}' }],
      };
    },
    finalize: (out, _ctx, state) => {
      const suffix = (state as { suffix: string }).suffix;
      events.push(`finalize:${suffix}`);
      return {
        ...out,
        headTags: [
          ...(out.headTags ?? []),
          { type: 'meta', attrs: { name: 'finalize' } },
        ],
      };
    },
  };

  const out = await runAdapterRenderPipeline({
    ctx,
    tree: 'tree',
    integrations: [integration],
    options: {
      headTags: [{ type: 'meta', attrs: { name: 'options' } }],
      styleTags: [{ cssText: '.options{}' }],
    },
    renderTree: (tree, context) => {
      events.push(
        `render:${tree}:${String(context.preparedIntegrations.length)}`,
      );
      return {
        html: `<main>${tree}</main>`,
        headTags: [{ type: 'meta', attrs: { name: 'adapter' } }],
        styleTags: [{ cssText: '.adapter{}' }],
      };
    },
    enforceStrictCsp: (result) => {
      events.push(`enforce:${String(result.headTags?.length ?? 0)}`);
    },
  });

  assert.deepEqual(events, [
    'prepare',
    'wrap:!',
    'render:tree!:1',
    'contribute:!',
    'finalize:!',
    'enforce:4',
  ]);
  assert.equal(out.html, '<main>tree!</main>');
  assert.deepEqual(
    out.headTags?.map((tag) => tag.type === 'meta' && tag.attrs.name),
    ['contribute', 'options', 'adapter', 'finalize'],
  );
});
