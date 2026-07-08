import assert from 'node:assert/strict';
import test from 'node:test';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createControlPlaneApp } from '../../src/control-plane.js';
import {
  createHostOwnedControlPlaneExampleApp,
  HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT,
} from '../../examples/control-plane-host-owned-contracts/handler.js';
import type { FaceBody } from '../../src/types.js';

async function collect(body: FaceBody): Promise<string> {
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for await (const chunk of body) chunks.push(decoder.decode(chunk, { stream: true }));
  chunks.push(decoder.decode());
  return chunks.join('');
}

test('control-plane host-contract example uses opaque bounded tenant reads in SSR load', async () => {
  const app = createHostOwnedControlPlaneExampleApp();
  const response = await app.handle({ method: 'GET', path: '/' });
  const body = await collect(response.body);

  assert.equal(response.status, 200);
  assert.equal(HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT.bounded, true);
  assert.equal(HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT.tenantScoped, true);
  assert.equal(
    HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT.contractId,
    'host.tabletheory.key-m1.section-read',
  );
  assert.ok(body.includes('Host-owned control-plane section reads'));
  assert.ok(body.includes('data-example="host-owned-section-read"'));
  assert.ok(body.includes('Host accepted tenant'));
  assert.ok(body.includes('tenant_example_safe'));
  assert.ok(body.includes('section:operator-summary:read'));
  assert.ok(body.includes('host.tabletheory.key-m1.section-read'));
});

test('control-plane host-contract example avoids client globals and time-varying reads', async () => {
  const source = await readFile(
    path.resolve('examples/control-plane-host-owned-contracts/handler.ts'),
    'utf8',
  );

  assert.ok(!source.includes('Date.now('));
  assert.ok(!source.includes('new Date('));
  assert.ok(!source.includes('Math.random('));
  assert.ok(!source.includes('window.'));
  assert.ok(!source.includes('document.'));
  assert.ok(!source.includes('@aws-sdk/client-dynamodb'));
  assert.ok(!source.includes('@aws-sdk/lib-dynamodb'));
});


test('control-plane sections report original load/render exceptions to onError', async () => {
  const sectionError = new Error('sensitive control-plane section failure');
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> = [];

  const app = createControlPlaneApp({
    gate: () => ({ ok: true }),
    faces: [
      {
        route: '/',
        sections: [
          {
            id: 'broken-section',
            title: 'Broken section',
            read: { bounded: true, tenantScoped: true },
            errorHtml: '<p data-state="fallback">Section fallback</p>',
            load: () => {
              throw sectionError;
            },
            render: () => '<p>unreachable</p>',
          },
        ],
      },
    ],
    faceApp: {
      observability: {
        onError: (err, ctx) =>
          observedErrors.push({
            err,
            ctx: ctx as unknown as Record<string, unknown>,
          }),
      },
    },
  });

  const response = await app.handle({
    method: 'GET',
    path: '/_facetheory/control-plane/sections/root-0/broken-section',
    headers: { 'x-request-id': ['cp-error-1'] },
  });
  const body = await collect(response.body);

  assert.equal(response.status, 200);
  assert.ok(body.includes('Section fallback'));
  assert.equal(body.includes('sensitive control-plane section failure'), false);
  assert.equal(observedErrors.length, 1);
  assert.equal(observedErrors[0]?.err, sectionError);
  assert.equal(observedErrors[0]?.ctx.phase, 'control-plane-section');
  assert.equal(observedErrors[0]?.ctx.sectionId, 'broken-section');
  assert.equal(observedErrors[0]?.ctx.requestId, 'cp-error-1');
});
