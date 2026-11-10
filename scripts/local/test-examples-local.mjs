import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTree } from './lib/tree.mjs';
import { rawHttpChunks } from './lib/runtime.mjs';
import { validateLedger, validateManifest } from './lib/manifest.mjs';
import {
  assertIncrementalStream,
  assertRunnerVersion,
  parseGoVersionM,
  runnerSpec,
} from './lib/apptheory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoots = [];

async function createFixture() {
  const base = path.join(os.homedir(), '.cache', 'facetheory-examples-local');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'selftest-'));
  fixtureRoots.push(root);
  await mkdir(path.join(root, 'ts/examples/alpha'), { recursive: true });
  await writeFile(path.join(root, 'ts/examples/alpha/one.ts'), 'export const one = 1;\n');
  await writeFile(path.join(root, 'ts/examples/alpha/two.ts'), 'export const two = 2;\n');
  await mkdir(path.join(root, 'infra/stack'), { recursive: true });
  await writeFile(path.join(root, 'infra/stack/package.json'), '{}\n');
  await writeFile(path.join(root, 'infra/stack/stack.ts'), 'export const stack = 1;\n');
  return root;
}

function baseManifest() {
  return {
    version: 1,
    profile: {
      name: 'selftest',
      ports: { first: 8210, last: 8249, reserved: [[8123, 8123], [8130, 8199]] },
      apptheoryRunner: {
        module: 'github.com/theory-cloud/apptheory/v7',
        package: 'github.com/theory-cloud/apptheory/v7/cmd/apptheory-local',
        version: 'v7.1.0',
      },
    },
    entries: {
      'ts/examples/alpha': {
        rows: [
          {
            id: 'alpha#serve',
            entrypoints: ['one.ts'],
            class: 'L1',
            port: 8210,
            runner: 'alpha',
            serve: { kind: 'node', cwd: 'ts', args: ['examples/alpha/one.ts'] },
          },
        ],
        coveredBy: { 'two.ts': 'alpha#serve' },
      },
      'infra/stack': {
        rows: [
          {
            id: 'infra/stack#synth',
            entrypoints: ['stack.ts'],
            class: 'I',
            runner: 'infra-synth',
            gap: 'synth only',
            build: [{ cwd: 'infra/stack', script: 'test' }],
          },
        ],
      },
    },
  };
}

function messages(result) {
  return result.errors.join('\n');
}

test.after(async () => {
  for (const root of fixtureRoots) {
    await rm(root, { recursive: true, force: true });
  }
});

test('the raw HTTP reader preserves streaming chunk boundaries', async () => {
  const server = http.createServer(async (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    for (const value of ['first', 'second', 'third']) {
      response.write(value);
      await new Promise((resolve) => setImmediate(resolve));
    }
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const result = await rawHttpChunks({ port: address.port, path: '/' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.chunks.map((chunk) => chunk.toString('utf8')), ['first', 'second', 'third']);
    assert.equal(result.body, 'firstsecondthird');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the checked-in manifest classifies every example, infra stack and entrypoint', async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'scripts/local/examples-local.json'), 'utf8'));
  const tree = await discoverTree(ROOT);
  const result = validateManifest(ROOT, manifest, tree);
  assert.deepEqual(result.errors, []);
  const directories = tree.examples.map((example) => example.directory);
  for (const directory of directories) {
    assert.ok(manifest.entries[directory], `missing manifest entry for ${directory}`);
  }
  for (const stack of tree.infra) {
    assert.ok(manifest.entries[stack.directory], `missing manifest entry for ${stack.directory}`);
  }
});

test('an unclassified example directory fails the run', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  await mkdir(path.join(root, 'ts/examples/beta'), { recursive: true });
  await writeFile(path.join(root, 'ts/examples/beta/entry.ts'), 'export const entry = 1;\n');
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /unclassified example directory ts\/examples\/beta/);
});

test('an unmanifested entrypoint fails the run', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  delete manifest.entries['ts/examples/alpha'].coveredBy;
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /unmanifested entrypoint ts\/examples\/alpha\/two\.ts/);
});

test('a manifest entrypoint that does not exist fails the run', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows[0].entrypoints = ['missing.ts'];
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /entrypoint ts\/examples\/alpha\/missing\.ts does not exist/);
});

test('a skip field is a failure', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows[0].skip = true;
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /a skip is a failure/);
});

test('duplicate ports fail the run', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows.push({
    ...manifest.entries['ts/examples/alpha'].rows[0],
    id: 'alpha#second',
  });
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /port 8210 is already used by alpha#serve/);
});

test('a port in a reserved or out-of-range block fails the run', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows[0].port = 8123;
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /collides with reserved range 8123-8123/);

  const outside = baseManifest();
  outside.entries['ts/examples/alpha'].rows[0].port = 9000;
  const second = validateManifest(root, outside, await discoverTree(root));
  assert.match(messages(second), /outside the documented 8210-8249 range/);
});

test('a pending row must name the gap and cannot reserve a serving port', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows[0].pending = 'FT2';
  manifest.entries['ts/examples/alpha'].rows[0].port = 8210;
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /pending rows must name what is missing/);
  assert.match(messages(result), /pending rows must not reserve a serving port/);
});

test('an L3 row without a named gap fails, and an L1 row cannot declare a gap', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows[0].class = 'L3';
  const missing = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(missing), /L3 rows must name a gap/);

  const l1 = baseManifest();
  l1.entries['ts/examples/alpha'].rows[0].gap = 'not allowed';
  const extra = validateManifest(root, l1, await discoverTree(root));
  assert.match(messages(extra), /L1 rows must not declare a gap/);
});

test('stale coveredBy and via-host without verifiedBy fail', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].coveredBy = { 'missing.ts': 'alpha#serve' };
  const stale = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(stale), /coveredBy missing\.ts does not match an entrypoint/);

  const host = baseManifest();
  host.entries['ts/examples/alpha'].rows[0].runner = 'via-host';
  const unverified = validateManifest(root, host, await discoverTree(root));
  assert.match(messages(unverified), /via-host rows must set verifiedBy/);
});

test('apptheory-local serve rows accept only the runner-reported cloudfront surface', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['infra/stack'].rows.push({
    id: 'infra/stack#local-run',
    entrypoints: ['stack.ts'],
    class: 'L2',
    port: 8240,
    runner: 'apptheory-local-gateway',
    gap: 'fixture',
    serve: {
      kind: 'apptheory-local',
      app: 'infra/stack',
      backends: ['s3proxy'],
      publicSurface: 'gateway',
    },
  });
  const invalid = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(invalid), /serve\.publicSurface must be cloudfront/);
});

test('the checked-in manifest pins the released runner and no sibling checkout', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, 'scripts/local/examples-local.json'), 'utf8'),
  );
  assert.deepEqual(runnerSpec(manifest), {
    module: 'github.com/theory-cloud/apptheory/v7',
    package: 'github.com/theory-cloud/apptheory/v7/cmd/apptheory-local',
    version: 'v7.1.0',
  });
  assert.equal(manifest.profile.apptheoryCheckout, undefined);
  assert.equal(manifest.profile.tabletheoryCheckout, undefined);
  assert.deepEqual(JSON.parse(await readFile(path.join(ROOT, 'scripts/local/examples-local-ledger.json'), 'utf8')), {
    version: 1,
    rows: [],
  });
});

test('a profile without an exact released runner pin fails validation', async () => {
  const root = await createFixture();
  const missing = baseManifest();
  delete missing.profile.apptheoryRunner;
  assert.match(
    messages(validateManifest(root, missing, await discoverTree(root))),
    /apptheoryRunner is required/,
  );

  const floating = baseManifest();
  floating.profile.apptheoryRunner.version = 'latest';
  assert.match(
    messages(validateManifest(root, floating, await discoverTree(root))),
    /exact release tag/,
  );

  const checkout = baseManifest();
  checkout.profile.apptheoryCheckout = '../AppTheory';
  assert.match(
    messages(validateManifest(root, checkout, await discoverTree(root))),
    /apptheoryCheckout is retired/,
  );
});

const RUNNER_VERSION_OUTPUT = [
  '/root/.cache/facetheory-examples-local/apptheory-local/v7.1.0/bin/apptheory-local: go1.27.3',
  '\tpath\tgithub.com/theory-cloud/apptheory/v7/cmd/apptheory-local',
  '\tmod\tgithub.com/theory-cloud/apptheory/v7\tv7.1.0\th1:abc=',
  '\tdep\tgithub.com/aws/aws-sdk-go-v2\tv1.40.0\th1:def=',
  '\tbuild\t-buildmode=exe',
  '',
].join('\n');

function fakeGoVersionM(output, status = 0) {
  return () => ({ status, stdout: output, stderr: status === 0 ? '' : 'go: not a binary' });
}

const RUNNER_SPEC = {
  module: 'github.com/theory-cloud/apptheory/v7',
  package: 'github.com/theory-cloud/apptheory/v7/cmd/apptheory-local',
  version: 'v7.1.0',
};

test('go version -m parsing reads the command, module and release tag', () => {
  assert.deepEqual(parseGoVersionM(RUNNER_VERSION_OUTPUT), {
    path: 'github.com/theory-cloud/apptheory/v7/cmd/apptheory-local',
    module: 'github.com/theory-cloud/apptheory/v7',
    version: 'v7.1.0',
  });
});

test('the installed runner must be the exact command and release the manifest pins', () => {
  const accepted = assertRunnerVersion('/cache/apptheory-local', RUNNER_SPEC, {
    run: fakeGoVersionM(RUNNER_VERSION_OUTPUT),
  });
  assert.equal(accepted.version, 'v7.1.0');

  assert.throws(
    () =>
      assertRunnerVersion('/cache/apptheory-local', RUNNER_SPEC, {
        run: fakeGoVersionM(
          RUNNER_VERSION_OUTPUT.replace(
            'mod\tgithub.com/theory-cloud/apptheory/v7\tv7.1.0',
            'mod\tgithub.com/theory-cloud/apptheory/v7\tv6.4.0',
          ),
        ),
      }),
    /reports github\.com\/theory-cloud\/apptheory\/v7 v6\.4\.0; the manifest pins github\.com\/theory-cloud\/apptheory\/v7 v7\.1\.0/,
  );

  assert.throws(
    () =>
      assertRunnerVersion('/cache/apptheory-local', RUNNER_SPEC, {
        run: fakeGoVersionM(
          RUNNER_VERSION_OUTPUT.replace(
            'path\tgithub.com/theory-cloud/apptheory/v7/cmd/apptheory-local',
            'path\tgithub.com/theory-cloud/apptheory/v6/cmd/apptheory-local',
          ),
        ),
      }),
    /reports command github\.com\/theory-cloud\/apptheory\/v6\/cmd\/apptheory-local; the manifest pins github\.com\/theory-cloud\/apptheory\/v7\/cmd\/apptheory-local/,
  );

  assert.throws(
    () =>
      assertRunnerVersion('/cache/apptheory-local', RUNNER_SPEC, {
        run: fakeGoVersionM('', 1),
      }),
    /cannot verify the installed apptheory-local/,
  );
});

function streamChunk(text) {
  return { data: Buffer.from(text, 'utf8') };
}

function preludeChunk(payload = '') {
  const metadata = JSON.stringify({ statusCode: 200, headers: { 'content-type': ['text/html; charset=utf-8'] } });
  return streamChunk(`${metadata}${'\u0000'.repeat(8)}${payload}`);
}

test('incremental streaming passes only when a first chunk precedes the document end', () => {
  const headFirst = assertIncrementalStream({
    chunks: [
      preludeChunk(),
      streamChunk('<!doctype html><html><head><title>Home</title></head>'),
      streamChunk('<body><h1>Hello</h1><!-- streamed:tail --></body></html>'),
    ],
    label: 'self-test head-first stream',
    laterMarker: '<!-- streamed:tail -->',
  });
  assert.equal(headFirst.metadata.statusCode, 200);
  assert.equal(headFirst.chunks, 3);
  assert.match(headFirst.body, /<\/html>$/);

  // A buffered response arrives as one payload chunk that already carries the
  // document end. This is the negative control: the same assertion a real row
  // uses must fail closed, so a future runner regression to buffering cannot
  // pass the row.
  assert.throws(
    () =>
      assertIncrementalStream({
        chunks: [preludeChunk('<!doctype html><html><body>Hello</body></html>')],
        label: 'self-test buffered stream',
      }),
    /the first payload chunk already contains <\/html>; the response was fully buffered/,
  );

  assert.throws(
    () => assertIncrementalStream({ chunks: [], label: 'self-test no-chunk stream' }),
    /no chunk event crossed the runner before the result; the response was buffered/,
  );
});

test('a pending row missing from the ledger fails', async () => {
  const root = await createFixture();
  const rows = [
    {
      id: 'alpha#serve',
      directory: 'ts/examples/alpha',
      pending: 'FT2',
      gap: 'missing capability',
      class: 'L3',
      runner: 'pending',
    },
  ];
  const result = validateLedger({ version: 1, rows: [] }, rows);
  assert.match(result.errors.join('\n'), /pending row alpha#serve is missing from the ledger/);
});

test('a ledger row for a non-pending row is stale and fails', async () => {
  const rows = [
    {
      id: 'alpha#serve',
      directory: 'ts/examples/alpha',
      class: 'L1',
      runner: 'alpha',
    },
  ];
  const result = validateLedger(
    {
      version: 1,
      rows: [
        {
          row: 'alpha#serve',
          capability: 'not needed',
          owner: 'nobody',
          resolution: 'none',
        },
      ],
    },
    rows,
  );
  assert.match(
    result.errors.join('\n'),
    /is not a pending manifest row; delete it/,
  );
});

test('a record ledger row is retired and fails by name', async () => {
  const rows = [
    {
      id: 'alpha#serve',
      directory: 'ts/examples/alpha',
      class: 'L1',
      runner: 'alpha',
    },
  ];
  const result = validateLedger(
    {
      version: 1,
      rows: [{ row: 'alpha#serve', kind: 'record', capability: 'released runner' }],
    },
    rows,
  );
  assert.match(
    result.errors.join('\n'),
    /is a record; record entries are retired with the released runner and must be deleted/,
  );
});

test('a row that still declares unreleasedProducer fails as retired', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  const row = manifest.entries['ts/examples/alpha'].rows[0];
  row.unreleasedProducer = true;
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /unreleasedProducer is retired/);
});

function storageProfileFixture() {
  return {
    ports: { dynamodb: 8250, s3: 8251 },
    containers: {
      'dynamodb-local': {
        image: `amazon/dynamodb-local@sha256:${'a'.repeat(64)}`,
        containerPort: 8000,
        command: ['-jar', 'DynamoDBLocal.jar', '-sharedDb', '-inMemory'],
      },
      s3proxy: {
        image: `andrewgaul/s3proxy@sha256:${'b'.repeat(64)}`,
        containerPort: 80,
        environment: { S3PROXY_IDENTITY: 'dummy', S3PROXY_CREDENTIAL: 'dummy' },
      },
    },
  };
}

test('the checked-in FT3 storage profile pins both backend images by digest', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, 'scripts/local/examples-local.json'), 'utf8'),
  );
  const storage = manifest.profile.storage;
  assert.ok(storage, 'profile.storage is required');
  assert.deepEqual(Object.keys(storage.containers).sort(), ['dynamodb-local', 's3proxy']);
  for (const container of Object.values(storage.containers)) {
    assert.match(container.image, /@sha256:[0-9a-f]{64}$/);
  }
  assert.deepEqual(storage.ports, { dynamodb: 8250, s3: 8251 });
});

test('a storage row requires profile.storage', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.entries['ts/examples/alpha'].rows[0].storage = { kind: 'isr' };
  manifest.entries['ts/examples/alpha'].rows[0].runner = 'isr-real-storage';
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /declare storage but profile\.storage is missing/);
});

test('a tag-only storage image fails validation', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.profile.storage = storageProfileFixture();
  manifest.profile.storage.containers.s3proxy.image = 'andrewgaul/s3proxy:latest';
  manifest.entries['ts/examples/alpha'].rows[0].storage = { kind: 'isr' };
  manifest.entries['ts/examples/alpha'].rows[0].runner = 'isr-real-storage';
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /s3proxy\.image must be pinned by digest/);
});

test('a storage row must use the runner for its kind', async () => {
  const root = await createFixture();
  const manifest = baseManifest();
  manifest.profile.storage = storageProfileFixture();
  const row = manifest.entries['ts/examples/alpha'].rows[0];
  row.storage = { kind: 'sidecar' };
  row.runner = 'isr-real-storage';
  const result = validateManifest(root, manifest, await discoverTree(root));
  assert.match(messages(result), /storage kind sidecar must use runner strict-csp-real-storage/);
});
