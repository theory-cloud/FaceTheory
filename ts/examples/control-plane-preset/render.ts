import assert from 'node:assert/strict';

import {
  CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
  CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH,
  createControlPlaneApp,
} from '../../src/control-plane.js';
import { handleLambdaUrlEvent } from '../../src/lambda-url.js';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = ''] = arg.replace(/^--/, '').split('=');
    return [key, value] as const;
  }),
);

const mode = args.get('mode') === 'strict' ? 'strict' : 'relaxed';
const delivery = args.get('delivery') === 'streaming' ? 'streaming' : 'client-fill';

const app = createControlPlaneApp({
  csp: { mode },
  delivery: { capability: delivery },
  gate: () => ({ ok: true, plane: 'staff', tenant: 'example-tenant' }),
  faces: [
    {
      route: '/',
      title: `FaceTheory control plane (${mode}/${delivery})`,
      sections: [
        {
          id: 'agents',
          title: 'Agents',
          read: { bounded: true, tenantScoped: true },
          loadingHtml:
            '<div class="facetheory-rcp-skeleton facetheory-rcp-skeleton--rounded facetheory-rcp-skeleton--width-full facetheory-rcp-skeleton--height-lg facetheory-rcp-skeleton--pulse" aria-hidden="true"></div>',
          load: () => ({ count: 3, newest: 'control-plane-preset-demo' }),
          render: (_ctx, data) => {
            const agents = data as { count: number; newest: string };
            return `<p><strong>${String(agents.count)}</strong> bounded agents loaded for this tenant.</p><p>Newest: ${agents.newest}</p>`;
          },
        },
        {
          id: 'operations',
          title: 'Operations',
          read: { bounded: true, tenantScoped: true },
          load: () => ['deploy', 'audit', 'rotate'],
          render: (_ctx, data) =>
            `<ul>${(data as string[])
              .map((item) => `<li>${item}</li>`)
              .join('')}</ul>`,
        },
      ],
      renderShell: (_ctx, helpers) => `<main data-facetheory-view>
        <h1>Theory Cloud control-plane preset</h1>
        <p>CSP mode: <strong>${helpers.cspMode}</strong>; delivery: <strong>${helpers.delivery}</strong>.</p>
        ${helpers.section('agents')}
        ${helpers.section('operations')}
      </main>`,
    },
  ],
});

const page = await app.handle({ method: 'GET', path: '/', cspNonce: 'example-nonce' });
assert.equal(page.status, 200);

let body = '';
if (page.body instanceof Uint8Array) {
  body = new TextDecoder().decode(page.body);
} else {
  const decoder = new TextDecoder();
  for await (const chunk of page.body) body += decoder.decode(chunk, { stream: true });
  body += decoder.decode();
}

assert.ok(body.includes('Theory Cloud control-plane preset'));
assert.ok(body.includes(CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH));
assert.ok(body.includes(CONTROL_PLANE_BOOTSTRAP_MODULE_PATH));
assert.equal(
  page.headers['x-facetheory-control-plane-strict-csp-supported']?.[0],
  'true',
);

if (mode === 'strict') {
  assert.ok(page.headers['content-security-policy']?.[0]?.includes("script-src 'self'"));
  assert.equal(body.includes('<style'), false);
}

if (delivery === 'client-fill') {
  assert.equal(body.includes('bounded agents loaded'), false);
  const section = await handleLambdaUrlEvent(app, {
    rawPath: '/_facetheory/control-plane/sections/root-0/agents',
    requestContext: {
      http: {
        method: 'GET',
        path: '/_facetheory/control-plane/sections/root-0/agents',
      },
      requestId: 'example-section',
    },
  });
  assert.equal(section.statusCode, 200);
  assert.ok(section.body.includes('bounded agents loaded'));
} else {
  assert.ok(body.includes('bounded agents loaded'));
}

const asset = await handleLambdaUrlEvent(app, {
  rawPath: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
  requestContext: {
    http: { method: 'HEAD', path: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH },
    requestId: 'example-head',
  },
});
assert.equal(asset.statusCode, 200);
assert.equal(asset.headers?.['content-type'], 'text/javascript; charset=utf-8');
assert.equal(asset.headers?.['x-content-type-options'], 'nosniff');

console.log(
  JSON.stringify(
    {
      cspMode: mode,
      delivery,
      strict_csp_supported: true,
      status: page.status,
      contentType: page.headers['content-type']?.[0],
      csp: page.headers['content-security-policy']?.[0] ?? null,
      bodyBytes: body.length,
    },
    null,
    2,
  ),
);
