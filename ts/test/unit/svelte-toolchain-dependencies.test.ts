import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  renderCreateTemplate,
  type CreateTemplateContext,
} from '../../src/create-templates/index.js';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const OLD_PLUGIN = '@sveltejs/vite-plugin-svelte';
const SELECTED_VERSIONS = {
  rollup: '4.65.0',
  'rollup-plugin-svelte': '7.2.3',
} as const;
const SVELTE_VITE_CONFIGS = [
  'examples/vite-ssr-svelte/vite.config.ts',
  'examples/vite-ssr-svelte-library/vite.config.ts',
  'examples/vite-strict-csp-svelte/vite.config.ts',
] as const;

interface LockPackage {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface Lockfile {
  packages?: Record<string, LockPackage>;
  dependencies?: Record<string, LegacyLockPackage>;
}

interface LegacyLockPackage {
  dependencies?: Record<string, LegacyLockPackage>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackageManifest {
  version: string;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(path.resolve(packageRoot, relativePath), 'utf8'),
  ) as T;
}

function dependencyMaps(
  lockPackage: LockPackage,
): Array<[string, Record<string, string>]> {
  return (
    [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const
  )
    .filter((field) => lockPackage[field] !== undefined)
    .map((field) => [field, lockPackage[field] as Record<string, string>]);
}

function packagePathSegments(key: string): string[] {
  return key.split('/node_modules/').flatMap((part) => part.split('/'));
}

function legacyEdgeMaps(
  lockPackage: LegacyLockPackage,
): Array<[string, Record<string, string>]> {
  return (
    ['devDependencies', 'optionalDependencies', 'peerDependencies'] as const
  )
    .filter((field) => lockPackage[field] !== undefined)
    .map((field) => [field, lockPackage[field] as Record<string, string>]);
}

function collectDeepmergeViolations(lockfile: Lockfile): string[] {
  const violations: string[] = [];

  for (const [key, lockPackage] of Object.entries(lockfile.packages ?? {})) {
    if (packagePathSegments(key).includes('deepmerge')) {
      violations.push(`package key ${key}`);
    }
    for (const [field, edges] of dependencyMaps(lockPackage)) {
      for (const [name, spec] of Object.entries(edges)) {
        if (name === 'deepmerge') {
          violations.push(`${key} ${field} ${name}`);
        }
        if (/^npm:(?:@[^/]+\/)?deepmerge(?:@|$)/.test(spec)) {
          violations.push(`${key} ${field} ${name}=${spec}`);
        }
      }
    }
  }

  function walkLegacy(
    dependencies: Record<string, LegacyLockPackage>,
    trail: string,
  ): void {
    for (const [name, lockPackage] of Object.entries(dependencies)) {
      const location = `${trail}/${name}`;
      if (name === 'deepmerge') {
        violations.push(`legacy dependency ${location}`);
      }
      for (const [field, edges] of legacyEdgeMaps(lockPackage)) {
        for (const [edgeName, spec] of Object.entries(edges)) {
          if (edgeName === 'deepmerge') {
            violations.push(
              `legacy dependency ${location} ${field} ${edgeName}`,
            );
          }
          if (/^npm:(?:@[^/]+\/)?deepmerge(?:@|$)/.test(spec)) {
            violations.push(
              `legacy dependency ${location} ${field} ${edgeName}=${spec}`,
            );
          }
        }
      }
      const nested = lockPackage.dependencies;
      if (nested !== undefined) {
        walkLegacy(nested, location);
      }
    }
  }

  walkLegacy(lockfile.dependencies ?? {}, 'dependencies');
  return violations;
}

function selectedPlugin(lockfile: Lockfile): LockPackage {
  const plugin = lockfile.packages?.['node_modules/rollup-plugin-svelte'];
  assert.ok(plugin, 'rollup-plugin-svelte lock package is missing');
  return plugin;
}

function svelteTemplateContext(): CreateTemplateContext {
  return {
    adapter: 'svelte',
    appName: 'svelte-app',
    packageName: 'svelte-app',
    nodeEngine: '>=22',
    facetheoryTarball:
      'https://github.com/theory-cloud/FaceTheory/releases/download/v5.0.3/theory-cloud-facetheory-5.0.3.tgz',
    appTheoryTarball:
      'https://github.com/theory-cloud/AppTheory/releases/download/v6.4.0/theory-cloud-apptheory-6.4.0.tgz',
    appTheoryCdkTarball:
      'https://github.com/theory-cloud/AppTheory/releases/download/v6.4.0/theory-cloud-apptheory-cdk-6.4.0.tgz',
    tableTheoryTarball:
      'https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz',
    dependencyVersions: {},
  };
}

function assertSvelteViteConfig(
  content: string,
  generateExpression: string,
): void {
  assert.match(content, /import svelte from 'rollup-plugin-svelte';/);
  assert.equal(content.includes(OLD_PLUGIN), false);
  assert.match(content, /emitCss: true/);
  assert.match(
    content,
    new RegExp(`compilerOptions: \\{ generate: ${generateExpression} \\}`),
  );
}

test('manifest pins the exact replacement toolchain and drops the old plugin', async () => {
  const manifest = await readJson<PackageManifest>('package.json');
  const devDependencies = manifest.devDependencies ?? {};

  assert.equal(manifest.version, '5.0.3');
  assert.equal(devDependencies.rollup, SELECTED_VERSIONS.rollup);
  assert.equal(
    devDependencies['rollup-plugin-svelte'],
    SELECTED_VERSIONS['rollup-plugin-svelte'],
  );
  assert.equal(devDependencies[OLD_PLUGIN], undefined);
  assert.equal(devDependencies.svelte, '^5.57.2');
  assert.equal(devDependencies.vite, '^8.3.5');
});

test('lockfile locks the exact replacement versions and drops the old plugin', async () => {
  const lockfile = await readJson<Lockfile>('package-lock.json');
  const packages = lockfile.packages ?? {};
  const root = packages[''];

  assert.ok(root, 'lockfile root package is missing');
  assert.equal(root.devDependencies?.rollup, SELECTED_VERSIONS.rollup);
  assert.equal(
    root.devDependencies?.['rollup-plugin-svelte'],
    SELECTED_VERSIONS['rollup-plugin-svelte'],
  );
  assert.equal(root.devDependencies?.[OLD_PLUGIN], undefined);

  for (const key of Object.keys(packages)) {
    assert.equal(
      key.includes(`node_modules/${OLD_PLUGIN}`),
      false,
      `old plugin package remains in lock: ${key}`,
    );
  }

  const plugin = selectedPlugin(lockfile);
  assert.equal(plugin.version, SELECTED_VERSIONS['rollup-plugin-svelte']);
  assert.deepEqual(plugin.dependencies, {
    '@rollup/pluginutils': '^4.1.0',
    'resolve.exports': '^2.0.0',
  });
  assert.deepEqual(plugin.peerDependencies, {
    rollup: '>=2.0.0',
    svelte: '>=3.5.0',
  });
  assert.deepEqual(plugin.optionalDependencies, undefined);
  assert.deepEqual(plugin.devDependencies, undefined);
  assert.equal(
    packages['node_modules/rollup']?.version,
    SELECTED_VERSIONS.rollup,
  );
});

test('lockfile graph has no deepmerge node or aliased edge and the guard rejects synthetic ones', async () => {
  const lockfile = await readJson<Lockfile>('package-lock.json');
  assert.deepEqual(collectDeepmergeViolations(lockfile), []);

  const nested = structuredClone(lockfile);
  const nestedPlugin = selectedPlugin(nested);
  nestedPlugin.dependencies = {
    ...(nestedPlugin.dependencies ?? {}),
    deepmerge: '^4.3.1',
  };
  assert.match(
    collectDeepmergeViolations(nested).join('\n'),
    /rollup-plugin-svelte dependencies deepmerge/,
  );

  const aliased = structuredClone(lockfile);
  const aliasedPlugin = selectedPlugin(aliased);
  aliasedPlugin.peerDependencies = {
    ...(aliasedPlugin.peerDependencies ?? {}),
    merge: 'npm:deepmerge@4.3.1',
  };
  assert.match(
    collectDeepmergeViolations(aliased).join('\n'),
    /merge=npm:deepmerge@4\.3\.1/,
  );

  const aliasedNode = structuredClone(lockfile);
  aliasedNode.packages = {
    ...(aliasedNode.packages ?? {}),
    'node_modules/deepmerge': { version: '4.3.1' },
  };
  assert.match(
    collectDeepmergeViolations(aliasedNode).join('\n'),
    /package key node_modules\/deepmerge/,
  );
});

test('example Svelte Vite configs use the replacement compiler plugin', async () => {
  for (const relativePath of SVELTE_VITE_CONFIGS) {
    const content = await readFile(
      path.resolve(packageRoot, relativePath),
      'utf8',
    );
    assertSvelteViteConfig(content, "ssr \\? 'server' : 'client'");
  }
});

test('generated Svelte starter uses only the replacement toolchain', () => {
  const files = renderCreateTemplate(svelteTemplateContext());
  const viteConfig = files.find((file) => file.path === 'vite.config.ts');
  const packageJson = files.find((file) => file.path === 'package.json');

  assert.notEqual(viteConfig, undefined);
  assert.notEqual(packageJson, undefined);
  assertSvelteViteConfig(viteConfig?.content ?? '', "'client'");

  const manifest = JSON.parse(packageJson?.content ?? '{}') as PackageManifest;
  assert.equal(manifest.devDependencies?.rollup, SELECTED_VERSIONS.rollup);
  assert.equal(
    manifest.devDependencies?.['rollup-plugin-svelte'],
    SELECTED_VERSIONS['rollup-plugin-svelte'],
  );
  assert.equal(manifest.devDependencies?.[OLD_PLUGIN], undefined);

  for (const file of files) {
    assert.equal(
      file.content.includes(OLD_PLUGIN),
      false,
      `generated starter file still references ${OLD_PLUGIN}: ${file.path}`,
    );
  }
});
