// Fixture: a clean consumer of the packed FaceTheory tarball.
//
// `scripts/verify-consumer-install.sh` copies this file into a temporary project
// whose only dependencies are the packed tarball and the React peer pair, so
// nothing this script imports resolves back into this repository. Its job is to
// exercise what a release actually promises: the published entry points import,
// one SSR Face renders through the React adapter twice with byte-identical
// output, and one SSG site builds onto a real filesystem.
//
// Every check fails closed. A missing export, a missing artifact, a render
// difference or an empty SSG output exits non-zero; nothing is skipped.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as React from 'react';

import {
  buildSsgSite,
  createFaceApp,
  handleLambdaUrlEvent,
  metaTag,
  titleTag,
} from '@theory-cloud/facetheory';
import { createReactFace } from '@theory-cloud/facetheory/react';

const consumerRoot = path.dirname(fileURLToPath(import.meta.url));

function receipt(label, value) {
  console.log(`consumer-install(ts): ${label}: ${value}`);
}

function assertInsideConsumer(resolved, label) {
  const specifier = resolved.startsWith('file:')
    ? fileURLToPath(resolved)
    : resolved;
  const relative = path.relative(consumerRoot, specifier);
  assert.ok(
    relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${label} resolved outside the consumer project: ${specifier}`,
  );
}

// 1. The published entry points resolve from the installed tarball, not from a
//    repository checkout.
assertInsideConsumer(import.meta.resolve('@theory-cloud/facetheory'), 'entry point');
assertInsideConsumer(
  import.meta.resolve('@theory-cloud/facetheory/react'),
  'react adapter entry point',
);
receipt('entry point', import.meta.resolve('@theory-cloud/facetheory'));

// 2. A real SSR render through the React adapter, twice. The two renders must be
//    byte-identical once the per-response CSP nonce is set aside: the nonce is
//    unique per response by design (deterministic within a response, never
//    across responses), so it is the one token a determinism comparison may not
//    include.
const app = createFaceApp({
  faces: [
    createReactFace({
      route: '/',
      mode: 'ssr',
      render: () =>
        React.createElement(
          'main',
          null,
          React.createElement('h1', null, 'FaceTheory consumer'),
          React.createElement('p', null, 'Rendered by the packed tarball.'),
        ),
      renderOptions: {
        headTags: [titleTag('Consumer'), metaTag('description', 'clean consumer')],
        hydration: {
          data: { source: 'consumer-install' },
          bootstrapModule: '/assets/consumer.js',
        },
      },
    }),
  ],
});

const event = {
  version: '2.0',
  rawPath: '/',
  rawQueryString: '',
  headers: { host: 'consumer.example' },
  requestContext: {
    requestId: 'consumer-install',
    http: { method: 'GET', path: '/' },
  },
};

const first = await handleLambdaUrlEvent(app, event);
const second = await handleLambdaUrlEvent(app, event);

assert.equal(first.statusCode, 200, `SSR render status ${first.statusCode}`);
const withoutNonce = (body) => body.replace(/ nonce="[^"]*"/g, '');
assert.match(first.body, / nonce="[^"]+"/, 'the response carried no CSP nonce');
assert.equal(
  withoutNonce(first.body),
  withoutNonce(second.body),
  'two SSR renders of one Face produced different HTML',
);
assert.match(first.body, /<h1>FaceTheory consumer<\/h1>/);
assert.match(first.body, /<title>Consumer<\/title>/);
assert.match(first.body, /<meta [^>]*name="description"/);
assert.match(first.body, /<meta [^>]*content="clean consumer"/);
assert.match(first.body, /consumer-install/);
receipt('ssr render', `${first.body.length} bytes, deterministic across two renders`);

// 3. A real SSG build onto a real filesystem, then read the artifact back.
const outDir = await mkdtemp(path.join(tmpdir(), 'facetheory-consumer-ssg-'));
try {
  const result = await buildSsgSite({
    faces: [
      {
        route: '/',
        mode: 'ssg',
        render: () => ({
          head: { title: 'Consumer SSG' },
          html: '<main><h1>Consumer SSG</h1></main>',
        }),
      },
    ],
    outDir,
    trailingSlash: 'always',
    emitHydrationData: false,
  });

  assert.ok(result.pages.length > 0, 'SSG build produced no pages');
  const home = result.pages.find((page) => page.path === '/');
  assert.ok(home, 'SSG build did not emit the / page');
  const html = await readFile(path.resolve(outDir, home.file), 'utf8');
  assert.match(html, /<h1>Consumer SSG<\/h1>/);
  receipt('ssg build', `${result.pages.length} page(s) in ${result.outDir}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}

receipt('runtime', `node ${process.version}, react ${React.version}`);
console.log(`consumer-install(ts): PASS on node ${process.version}`);
