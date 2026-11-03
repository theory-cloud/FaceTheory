import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTree } from './lib/tree.mjs';
import {
  checkProducerAncestor,
  validateLedger,
  validateManifest,
} from './lib/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.homedir(), '.cache', 'facetheory-examples-local', 'selftest-'));
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

function producerRepo(root) {
  const repo = path.join(root, 'producer');
  mkdirSync(repo);
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'selftest@example.test']);
  git(repo, ['config', 'user.name', 'selftest']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'first']);
  const first = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'second']);
  return { repo, first, head: git(repo, ['rev-parse', 'HEAD']) };
}

test('ledger ancestor containment passes for an ancestor and fails for a non-ancestor', async () => {
  const root = await createFixture();
  const { repo, first, head } = producerRepo(root);
  const pass = checkProducerAncestor(root, { checkout: repo, sha: first });
  assert.equal(pass.head, head);

  const detached = path.join(root, 'producer-detached');
  mkdirSync(detached);
  git(detached, ['init', '-q']);
  git(detached, ['config', 'user.email', 'selftest@example.test']);
  git(detached, ['config', 'user.name', 'selftest']);
  git(detached, ['commit', '-q', '--allow-empty', '-m', 'first']);
  const isolated = git(detached, ['rev-parse', 'HEAD']);
  git(detached, ['commit', '-q', '--allow-empty', '-m', 'second']);
  const second = git(detached, ['rev-parse', 'HEAD']);
  git(detached, ['checkout', '-q', '--detach', isolated]);
  assert.throws(
    () => checkProducerAncestor(root, { checkout: detached, sha: second }),
    /is not an ancestor/,
  );
});

test('a missing producer checkout fails with a named error', async () => {
  const root = await createFixture();
  assert.throws(
    () => checkProducerAncestor(root, { checkout: './does-not-exist', sha: 'a'.repeat(40) }),
    /producer checkout missing/,
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
  const result = validateLedger(root, { version: 1, rows: [] }, rows);
  assert.match(result.errors.join('\n'), /pending row alpha#serve is missing from the ledger/);
});

test('a ledger row for a non-pending row fails', async () => {
  const root = await createFixture();
  const rows = [
    {
      id: 'alpha#serve',
      directory: 'ts/examples/alpha',
      class: 'L1',
      runner: 'alpha',
    },
  ];
  const result = validateLedger(
    root,
    {
      version: 1,
      rows: [
        {
          row: 'alpha#serve',
          capability: 'not needed',
          producer: { repo: 'theory-cloud/AppTheory', checkout: '.', staging_sha: 'a'.repeat(40) },
          owner: 'nobody',
          resolution: 'none',
        },
      ],
    },
    rows,
  );
  assert.match(result.errors.join('\n'), /is not a pending manifest row/);
});

test('a ledger row passes only when its producer SHA is contained in the producer HEAD', async () => {
  const root = await createFixture();
  const { repo, first } = producerRepo(root);
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
  const ledger = {
    version: 1,
    rows: [
      {
        row: 'alpha#serve',
        capability: 'AppTheory local runner',
        producer: { repo: 'theory-cloud/AppTheory', checkout: repo, staging_sha: first },
        owner: 'AppTheory steward',
        resolution: 'release cycle',
      },
    ],
  };
  const result = validateLedger(root, ledger, rows);
  assert.deepEqual(result.errors, []);
  assert.equal(result.passes.length, 1);
});
