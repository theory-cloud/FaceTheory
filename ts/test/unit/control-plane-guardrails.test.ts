import assert from 'node:assert/strict';
import test from 'node:test';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
  CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH,
  assertControlPlaneBoundaryGuardrails,
  assertControlPlaneDeliveryGuardrails,
  createControlPlaneApp,
  createControlPlanePresetDescriptor,
  type ControlPlaneSectionReadContract,
} from '../../src/index.js';
import { handleLambdaUrlEvent } from '../../src/lambda-url.js';
import type { FaceBody } from '../../src/types.js';

async function collect(body: FaceBody): Promise<string> {
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for await (const chunk of body) chunks.push(decoder.decode(chunk, { stream: true }));
  chunks.push(decoder.decode());
  return chunks.join('');
}

async function collectSourceFiles(
  dir: string,
): Promise<Array<{ path: string; content: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; content: string }> = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }
    if (!/\.(?:ts|tsx|svelte)$/.test(entry.name)) continue;
    files.push({
      path: path.relative(path.resolve('..'), fullPath),
      content: await readFile(fullPath, 'utf8'),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function createDemoApp(options: {
  mode?: 'relaxed' | 'strict';
  delivery?: 'client-fill' | 'streaming';
  gate?: 'allow' | 'deny';
}) {
  return createControlPlaneApp({
    csp: { mode: options.mode ?? 'relaxed' },
    delivery: { capability: options.delivery ?? 'client-fill' },
    gate: () =>
      options.gate === 'deny'
        ? { ok: false, status: 403, title: 'Wrong plane', message: 'No shell.' }
        : { ok: true, plane: 'staff', tenant: 'tenant-a' },
    faces: [
      {
        route: '/',
        title: 'Control Plane',
        sections: [
          {
            id: 'agents',
            title: 'Agents',
            read: { bounded: true, tenantScoped: true },
            load: () => ({ count: 2 }),
            render: (_ctx, data) =>
              `<p class="agents-count">${String((data as { count: number }).count)} agents</p>`,
          },
        ],
        renderShell: (_ctx, helpers) =>
          `<main data-facetheory-view><h1>Control shell</h1>${helpers.section('agents')}</main>`,
      },
    ],
  });
}

test('control-plane preset: relaxed mode is the default and strict CSP remains supported', async () => {
  const app = createControlPlaneApp({
    gate: () => ({ ok: true }),
    faces: [
      {
        route: '/',
        title: 'Relaxed',
        renderShell: () =>
          '<main data-facetheory-view><h1>Relaxed</h1><style>.relaxed-inline{color:red}</style></main>',
      },
    ],
  });

  const response = await app.handle({ method: 'GET', path: '/' });
  const html = await collect(response.body);

  assert.equal(response.status, 200);
  assert.equal(response.headers['x-facetheory-control-plane-csp-mode']?.[0], 'relaxed');
  assert.equal(
    response.headers['x-facetheory-control-plane-strict-csp-supported']?.[0],
    'true',
  );
  assert.equal(response.headers['content-security-policy'], undefined);
  assert.ok(html.includes('<style>.relaxed-inline{color:red}</style>'));
  assert.deepEqual(createControlPlanePresetDescriptor().csp, {
    mode: 'relaxed',
    strict_csp_supported: true,
  });
});

test('control-plane preset: strict mode opts into no-inline CSP and external assets', async () => {
  const app = createDemoApp({ mode: 'strict', delivery: 'client-fill' });
  const result = await handleLambdaUrlEvent(app, {
    rawPath: '/',
    requestContext: { http: { method: 'GET', path: '/' }, requestId: 'strict-1' },
  });

  assert.equal(result.statusCode, 200);
  assert.match(result.headers?.['content-security-policy'] ?? '', /script-src 'self'/);
  assert.match(result.headers?.['content-security-policy'] ?? '', /style-src 'self'/);
  assert.ok(result.body.includes(`href="${CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH}"`));
  assert.ok(result.body.includes(`src="${CONTROL_PLANE_BOOTSTRAP_MODULE_PATH}"`));
  assert.equal(result.body.includes('<style'), false);
  assert.equal(result.body.includes('__FACETHEORY_DATA__'), false);
});

test('control-plane preset: shell-first client-fill leaves section data off critical path', async () => {
  let loadCalls = 0;
  const app = createControlPlaneApp({
    delivery: { capability: 'client-fill' },
    gate: () => ({ ok: true }),
    faces: [
      {
        route: '/',
        sections: [
          {
            id: 'slow',
            title: 'Slow section',
            read: { bounded: true, tenantScoped: true },
            load: () => {
              loadCalls += 1;
              return { value: 'loaded' };
            },
            render: (_ctx, data) => `<p>${String((data as { value: string }).value)}</p>`,
          },
        ],
      },
    ],
  });

  const shell = await app.handle({ method: 'GET', path: '/' });
  const html = await collect(shell.body);
  assert.equal(loadCalls, 0);
  assert.ok(html.includes('data-facetheory-section-src='));
  assert.ok(html.includes('Slow section loading'));
  assert.equal(html.includes('<p>loaded</p>'), false);

  const section = await app.handle({
    method: 'GET',
    path: '/_facetheory/control-plane/sections/root-0/slow',
  });
  assert.equal(section.status, 200);
  assert.equal(section.headers['content-type']?.[0], 'text/html; charset=utf-8');
  assert.equal(await collect(section.body), '<p>loaded</p>');
  assert.equal(loadCalls, 1);
});

test('control-plane preset: rejects section reads without bounded tenant scope at app construction', () => {
  const createWithRead = (read: unknown) => () =>
    createControlPlaneApp({
      gate: () => ({ ok: true, tenant: 'tenant-a' }),
      faces: [
        {
          route: '/',
          sections: [
            {
              id: 'unsafe',
              read: read as ControlPlaneSectionReadContract,
              load: () => ({ count: 0 }),
              render: () => '<p>unsafe</p>',
            },
          ],
        },
      ],
    });

  assert.throws(
    createWithRead({ tenantScoped: true }),
    /control-plane section "unsafe" must declare bounded tenant-scoped reads/,
  );
  assert.throws(
    createWithRead({ bounded: true }),
    /control-plane section "unsafe" must declare bounded tenant-scoped reads/,
  );
  assert.throws(
    createWithRead({ bounded: false, tenantScoped: true }),
    /control-plane section "unsafe" must declare bounded tenant-scoped reads/,
  );
  assert.throws(
    createWithRead({ bounded: true, tenantScoped: false }),
    /control-plane section "unsafe" must declare bounded tenant-scoped reads/,
  );
});

test('control-plane preset: streaming capability does not block first shell chunk on section data', async () => {
  let resolveSection!: (value: { value: string }) => void;
  const sectionReady = new Promise<{ value: string }>((resolve) => {
    resolveSection = resolve;
  });
  const app = createControlPlaneApp({
    delivery: { capability: 'streaming' },
    gate: () => ({ ok: true }),
    faces: [
      {
        route: '/',
        sections: [
          {
            id: 'streamed',
            title: 'Streamed section',
            read: { bounded: true, tenantScoped: true },
            load: () => sectionReady,
            render: (_ctx, data) =>
              `<p>${String((data as { value: string }).value)}</p>`,
          },
        ],
      },
    ],
  });

  const response = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(response.body instanceof Uint8Array));
  const iterator = response.body[Symbol.asyncIterator]();
  const documentPrefix = await iterator.next();
  assert.equal(documentPrefix.done, false);
  const shell = await iterator.next();
  assert.equal(shell.done, false);
  const shellChunk = new TextDecoder().decode(shell.value);
  assert.ok(shellChunk.includes('Streamed section loading'));
  assert.equal(shellChunk.includes('<p>stream-data</p>'), false);

  resolveSection({ value: 'stream-data' });
  const rest: string[] = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    rest.push(new TextDecoder().decode(next.value, { stream: true }));
  }
  assert.ok(rest.join('').includes('<p>stream-data</p>'));
});

test('control-plane preset: gate rejection is buffered before any shell is returned', async () => {
  const app = createDemoApp({ mode: 'strict', delivery: 'streaming', gate: 'deny' });
  const response = await app.handle({ method: 'GET', path: '/', cspNonce: 'gate-nonce' });
  assert.equal(response.status, 403);
  assert.ok(response.body instanceof Uint8Array);
  const html = await collect(response.body);
  assert.ok(html.includes('Wrong plane'));
  assert.equal(html.includes('Control shell'), false);
});

test('control-plane asset registrar: serves ESM helper GET and HEAD through real Lambda serving path', async () => {
  const app = createDemoApp({ mode: 'relaxed' });

  const get = await handleLambdaUrlEvent(app, {
    rawPath: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
    requestContext: {
      http: { method: 'GET', path: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH },
      requestId: 'asset-get',
    },
  });
  const head = await handleLambdaUrlEvent(app, {
    rawPath: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH,
    requestContext: {
      http: { method: 'HEAD', path: CONTROL_PLANE_BOOTSTRAP_MODULE_PATH },
      requestId: 'asset-head',
    },
  });

  assert.equal(get.statusCode, 200);
  assert.equal(head.statusCode, 200);
  assert.equal(get.headers?.['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(head.headers?.['content-type'], get.headers?.['content-type']);
  assert.equal(get.headers?.['x-content-type-options'], 'nosniff');
  assert.equal(head.headers?.['x-content-type-options'], 'nosniff');
  assert.ok(get.body.includes('startControlPlane'));
  assert.equal(head.body, '');
});

test('control-plane asset registrar: serves Tier B CSS externally in both modes', async () => {
  for (const mode of ['relaxed', 'strict'] as const) {
    const app = createDemoApp({ mode });
    const result = await handleLambdaUrlEvent(app, {
      rawPath: CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH,
      requestContext: {
        http: {
          method: 'GET',
          path: CONTROL_PLANE_RESPONSIVE_PRIMITIVES_STYLESHEET_PATH,
        },
        requestId: `css-${mode}`,
      },
    });
    assert.equal(result.statusCode, 200, mode);
    assert.equal(result.headers?.['content-type'], 'text/css; charset=utf-8');
    assert.equal(result.headers?.['x-content-type-options'], 'nosniff');
    assert.ok(result.body.includes('.facetheory-rcp-spinner'), mode);
    assert.ok(result.body.includes('prefers-reduced-motion'), mode);
  }
});

test('control-plane guardrails: unconditional I4/I5/I10 fail in both CSP modes', () => {
  for (const mode of ['relaxed', 'strict'] as const) {
    assert.throws(
      () =>
        assertControlPlaneDeliveryGuardrails({
          csp: {
            mode,
            strict_csp_supported: true,
            inline_scripts: false,
            inline_styles: false,
            nonce: 'per_request_single_source',
          },
          streamed_sections_styling: 'external_css',
          asset_serving: {
            content_type: 'application/json',
            nosniff: true,
            head_mirrors_get: true,
          },
          nav_pending: { indicator_id_collision_proof: true },
          tests: { exercise_real_serving_path: true },
        }),
      /I4/,
      mode,
    );
  }
});

test('control-plane guardrails: relaxed mode tolerates antd-cssinjs while strict inline style fails', () => {
  assert.doesNotThrow(() =>
    assertControlPlaneDeliveryGuardrails({
      csp: {
        mode: 'relaxed',
        strict_csp_supported: true,
        inline_scripts: true,
        inline_styles: true,
        nonce: 'regenerated',
      },
      streamed_sections_styling: 'antd_cssinjs',
      asset_serving: {
        content_type: 'text/javascript; charset=utf-8',
        nosniff: true,
        head_mirrors_get: true,
      },
      nav_pending: { indicator_id_collision_proof: true },
      tests: { exercise_real_serving_path: true },
    }),
  );

  assert.throws(
    () =>
      assertControlPlaneDeliveryGuardrails({
        csp: {
          mode: 'strict',
          strict_csp_supported: true,
          inline_scripts: false,
          inline_styles: true,
          nonce: 'per_request_single_source',
        },
        streamed_sections_styling: 'inline_style',
        asset_serving: {
          content_type: 'text/javascript; charset=utf-8',
          nosniff: true,
          head_mirrors_get: true,
        },
        nav_pending: { indicator_id_collision_proof: true },
        tests: { exercise_real_serving_path: true },
      }),
    /I1/,
  );

  assert.throws(
    () =>
      assertControlPlaneDeliveryGuardrails({
        csp: {
          mode: 'strict',
          strict_csp_supported: true,
          inline_scripts: false,
          inline_styles: false,
          nonce: 'per_request_single_source',
        },
        streamed_sections_styling: 'antd_cssinjs',
        asset_serving: {
          content_type: 'text/javascript; charset=utf-8',
          nosniff: true,
          head_mirrors_get: true,
        },
        nav_pending: { indicator_id_collision_proof: true },
        tests: { exercise_real_serving_path: true },
      }),
    /I2/,
  );
});

test('control-plane boundary guardrails: current source keeps control-plane and Stitch host-owned', async () => {
  const files = await collectSourceFiles(path.resolve('src'));

  assert.doesNotThrow(() => assertControlPlaneBoundaryGuardrails(files));
});

test('control-plane boundary guardrails: blocks raw data/auth ownership in control-plane surfaces', () => {
  assert.throws(
    () =>
      assertControlPlaneBoundaryGuardrails([
        {
          path: 'ts/src/stitch-admin/raw-store.ts',
          content:
            "import { DynamoDBClient } from '@aws-sdk/client-dynamodb';\nexport const client = new DynamoDBClient({});\n",
        },
      ]),
    /raw DynamoDB clients/,
  );

  assert.throws(
    () =>
      assertControlPlaneBoundaryGuardrails([
        {
          path: 'ts/src/control-plane.ts',
          content:
            "export function normalizeStaffEntitlement(input: unknown) { return input; }\n",
        },
      ]),
    /entitlement normalization/,
  );

  assert.throws(
    () =>
      assertControlPlaneBoundaryGuardrails([
        {
          path: 'ts/src/control-plane.ts',
          content:
            "import { createTableTheoryModel } from '@theory-cloud/tabletheory-ts';\nvoid createTableTheoryModel;\n",
        },
      ]),
    /TableTheory imports are limited/,
  );

  assert.doesNotThrow(() =>
    assertControlPlaneBoundaryGuardrails([
      {
        path: 'ts/src/tabletheory/index.ts',
        content:
          "import { createTableTheoryModel } from '@theory-cloud/tabletheory-ts';\nvoid createTableTheoryModel;\n",
      },
      {
        path: 'ts/test/unit/tabletheory-isr-meta-store.test.ts',
        content:
          "import { TableTheoryIsrMetaStoreAdapter } from '../../src/tabletheory/index.js';\nvoid TableTheoryIsrMetaStoreAdapter;\n",
      },
    ]),
  );
});
