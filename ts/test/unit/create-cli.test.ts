import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';

import { runCreateCli } from '../../src/create-cli.js';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const tscBin = path.resolve(packageRoot, 'node_modules/typescript/bin/tsc');

class CaptureStream extends Writable {
  public text = '';

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.text += chunk.toString();
    callback();
  }
}

async function readGeneratedJson<T>(
  appDir: string,
  relativePath: string,
): Promise<T> {
  return JSON.parse(
    await readFile(path.resolve(appDir, relativePath), 'utf8'),
  ) as T;
}

async function symlinkPackage(
  appDir: string,
  name: string,
  source: string,
): Promise<void> {
  try {
    const sourceStat = await stat(source);
    assert.equal(
      sourceStat.isDirectory(),
      true,
      `typecheck dependency is not a directory: ${source}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`missing typecheck dependency for ${name}: ${source}`);
    }
    throw error;
  }

  const destination = path.resolve(appDir, 'node_modules', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await symlink(source, destination, 'dir');
}

async function execTsc(
  args: readonly string[],
  cwd: string,
): Promise<{ stderr: string; stdout: string }> {
  return await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [tscBin, ...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `tsc failed for ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
            ),
          );
          return;
        }
        resolve({ stderr, stdout });
      },
    );
  });
}

async function prepareLocalFaceTheoryPackage(appDir: string): Promise<void> {
  const localPackageDir = path.resolve(
    appDir,
    'node_modules/@theory-cloud/facetheory',
  );
  const localDistDir = path.resolve(localPackageDir, 'dist');
  await mkdir(localPackageDir, { recursive: true });
  await copyFile(
    path.resolve(packageRoot, 'package.json'),
    path.resolve(localPackageDir, 'package.json'),
  );
  await execTsc(
    [
      '-p',
      path.resolve(packageRoot, 'tsconfig.build.json'),
      '--outDir',
      localDistDir,
      '--declarationMap',
      'false',
      '--sourceMap',
      'false',
    ],
    packageRoot,
  );
}

function installedPackagePath(name: string): string {
  return path.resolve(packageRoot, 'node_modules', name);
}

async function linkTypecheckDependencies(appDir: string): Promise<void> {
  await prepareLocalFaceTheoryPackage(appDir);

  const packages: Array<[string, string]> = [
    [
      '@theory-cloud/apptheory',
      installedPackagePath('@theory-cloud/apptheory'),
    ],
    [
      '@theory-cloud/apptheory-cdk',
      installedPackagePath('@theory-cloud/apptheory-cdk'),
    ],
    [
      '@theory-cloud/tabletheory-ts',
      installedPackagePath('@theory-cloud/tabletheory-ts'),
    ],
    ['@types/node', installedPackagePath('@types/node')],
    ['@types/react', installedPackagePath('@types/react')],
    ['@types/react-dom', installedPackagePath('@types/react-dom')],
    ['aws-cdk-lib', installedPackagePath('aws-cdk-lib')],
    ['constructs', installedPackagePath('constructs')],
    ['react', installedPackagePath('react')],
    ['react-dom', installedPackagePath('react-dom')],
    ['vite', installedPackagePath('vite')],
  ];

  for (const [name, source] of packages) {
    await symlinkPackage(appDir, name, source);
  }
}

async function runGeneratedTypecheck(
  appDir: string,
): Promise<{ stderr: string; stdout: string }> {
  return await execTsc(['-p', 'tsconfig.json', '--noEmit'], appDir);
}

test('facetheory create emits a React starter that typechecks', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-create-'));
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  try {
    const exitCode = await runCreateCli(
      ['create', 'my-app', '--adapter', 'react'],
      {
        cwd: tempRoot,
        stdout,
        stderr,
      },
    );
    assert.equal(exitCode, 0, stderr.text);
    assert.match(stdout.text, /Created FaceTheory react starter/);

    const appDir = path.resolve(tempRoot, 'my-app');
    const packageJson = await readGeneratedJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      overrides: Record<string, Record<string, string>>;
    }>(appDir, 'package.json');

    assert.match(
      packageJson.dependencies['@theory-cloud/facetheory'] ?? '',
      /^https:\/\/github\.com\/theory-cloud\/FaceTheory\/releases\/download\/v3\.8\.1\/theory-cloud-facetheory-3\.8\.1\.tgz$/,
    );
    assert.equal(packageJson.dependencies.react, '^19.2.6');
    assert.equal(packageJson.dependencies['react-dom'], '^19.2.6');
    assert.equal(
      packageJson.overrides['@theory-cloud/apptheory']?.[
        '@theory-cloud/tabletheory-ts'
      ],
      packageJson.dependencies['@theory-cloud/tabletheory-ts'],
    );

    const clientEntry = await readFile(
      path.resolve(appDir, 'src/client.tsx'),
      'utf8',
    );
    assert.match(clientEntry, /loadFaceHydrationData<HomeData>/);
    assert.match(clientEntry, /hydrateRoot\(/);

    const stack = await readFile(
      path.resolve(appDir, 'infra/stack.ts'),
      'utf8',
    );
    assert.match(stack, /new AppTheorySsrSite/);

    const readme = await readFile(path.resolve(appDir, 'README.md'), 'utf8');
    assert.match(readme, /npm install --save-exact/);
    assert.match(readme, /theory-cloud-facetheory-3\.8\.1\.tgz/);

    await linkTypecheckDependencies(appDir);
    await runGeneratedTypecheck(appDir);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('facetheory create emits per-adapter hydrate entries', async () => {
  const tempRoot = await mkdtemp(
    path.join(tmpdir(), 'facetheory-create-adapters-'),
  );
  try {
    for (const adapter of ['vue', 'svelte'] as const) {
      const stderr = new CaptureStream();
      const exitCode = await runCreateCli(
        [`${adapter}-app`, '--adapter', adapter],
        {
          cwd: tempRoot,
          stderr,
          stdout: new CaptureStream(),
        },
      );
      assert.equal(exitCode, 0, stderr.text);
    }

    const vueClient = await readFile(
      path.resolve(tempRoot, 'vue-app/src/client.ts'),
      'utf8',
    );
    assert.match(vueClient, /createSSRApp/);
    assert.match(vueClient, /\.mount\(root\)/);

    const svelteClient = await readFile(
      path.resolve(tempRoot, 'svelte-app/src/client.ts'),
      'utf8',
    );
    assert.match(svelteClient, /hydrate\(App/);
    assert.match(svelteClient, /loadFaceHydrationData<HomeData>/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('facetheory create rejects non-empty target directories with a fix', async () => {
  const tempRoot = await mkdtemp(
    path.join(tmpdir(), 'facetheory-create-nonempty-'),
  );
  const stderr = new CaptureStream();
  try {
    await mkdir(path.resolve(tempRoot, 'existing'));
    await mkdir(path.resolve(tempRoot, 'existing/child'));
    const exitCode = await runCreateCli(['existing'], {
      cwd: tempRoot,
      stderr,
      stdout: new CaptureStream(),
    });
    assert.equal(exitCode, 1);
    assert.match(stderr.text, /target directory is not empty/);
    assert.match(stderr.text, /Fix: choose a new directory/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
