import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { runDoctorCli } from '../../src/doctor-cli.js';

const FACE_PACKAGE = {
  version: '3.8.1',
  engines: { node: '>=20' },
  peerDependencies: {
    '@emotion/cache': '>=11',
    '@emotion/react': '>=11',
    '@emotion/server': '>=11',
    '@vue/server-renderer': '>=3',
    antd: '>=5',
    react: '>=18',
    'react-dom': '>=18',
    svelte: '>=5.55.7',
    vue: '>=3',
  },
};

const APP_THEORY =
  'https://github.com/theory-cloud/AppTheory/releases/download/v1.13.2/theory-cloud-apptheory-1.13.2.tgz';
const TABLE_THEORY =
  'https://github.com/theory-cloud/TableTheory/releases/download/v1.10.1/theory-cloud-tabletheory-ts-1.10.1.tgz';

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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function stubPackage(appDir: string, name: string, version: string): Promise<void> {
  await writeJson(path.resolve(appDir, 'node_modules', name, 'package.json'), {
    name,
    version,
  });
}

async function writeFacePackage(tempRoot: string, manifest = FACE_PACKAGE): Promise<string> {
  const facePackagePath = path.resolve(tempRoot, 'facetheory-package.json');
  await writeJson(facePackagePath, manifest);
  return facePackagePath;
}

async function writeReactProject(appDir: string): Promise<void> {
  await writeJson(path.resolve(appDir, 'package.json'), {
    name: 'doctor-ok',
    private: true,
    type: 'module',
    dependencies: {
      '@theory-cloud/apptheory': APP_THEORY,
      '@theory-cloud/tabletheory-ts': TABLE_THEORY,
      react: '^19.2.6',
      'react-dom': '^19.2.6',
    },
    overrides: {
      '@theory-cloud/apptheory': {
        '@theory-cloud/tabletheory-ts': TABLE_THEORY,
      },
    },
  });
  await stubPackage(appDir, 'react', '19.2.6');
  await stubPackage(appDir, 'react-dom', '19.2.6');
}

test('facetheory doctor passes for aligned React starter dependencies', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-doctor-ok-'));
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  try {
    const appDir = path.resolve(tempRoot, 'app');
    await writeReactProject(appDir);
    const packageJsonPath = await writeFacePackage(tempRoot);

    const exitCode = await runDoctorCli([], {
      cwd: appDir,
      nodeVersion: '24.12.4',
      packageJsonPath,
      stdout,
      stderr,
    });

    assert.equal(exitCode, 0, stderr.text);
    assert.match(stdout.text, /Node\.js 24\.12\.4 satisfies >=20/);
    assert.match(stdout.text, /React adapter peers are installed/);
    assert.match(stdout.text, /AppTheory\/TableTheory override aligns/);
    assert.match(stdout.text, /FaceTheory doctor passed/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('facetheory doctor reads the Node floor from package engines', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-doctor-node-'));
  const stdout = new CaptureStream();
  try {
    const appDir = path.resolve(tempRoot, 'app');
    await writeReactProject(appDir);
    const packageJsonPath = await writeFacePackage(tempRoot, {
      ...FACE_PACKAGE,
      engines: { node: '>=99' },
    });

    const exitCode = await runDoctorCli([], {
      cwd: appDir,
      nodeVersion: '24.12.4',
      packageJsonPath,
      stdout,
      stderr: new CaptureStream(),
    });

    assert.equal(exitCode, 1);
    assert.match(stdout.text, /does not satisfy FaceTheory engines\.node >=99/);
    assert.match(stdout.text, /Fix: Install a Node\.js version that satisfies >=99/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('facetheory doctor explains the Svelte version floor', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-doctor-svelte-'));
  const stdout = new CaptureStream();
  try {
    const appDir = path.resolve(tempRoot, 'app');
    await writeJson(path.resolve(appDir, 'package.json'), {
      name: 'doctor-svelte-floor',
      private: true,
      dependencies: { svelte: '5.50.0' },
    });
    await stubPackage(appDir, 'svelte', '5.50.0');
    const packageJsonPath = await writeFacePackage(tempRoot);

    const exitCode = await runDoctorCli([], {
      cwd: appDir,
      nodeVersion: '24.12.4',
      packageJsonPath,
      stdout,
      stderr: new CaptureStream(),
    });

    assert.equal(exitCode, 1);
    assert.match(stdout.text, /svelte 5\.50\.0 does not satisfy/);
    assert.match(stdout.text, /FaceTheory requires Svelte >=5\.55\.7/);
    assert.match(stdout.text, /npm install svelte@\^5\.55\.7/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('facetheory doctor reports AppTheory/TableTheory override drift with a fix', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-doctor-overrides-'));
  const stdout = new CaptureStream();
  try {
    const appDir = path.resolve(tempRoot, 'app');
    await writeJson(path.resolve(appDir, 'package.json'), {
      name: 'doctor-overrides',
      private: true,
      dependencies: {
        '@theory-cloud/apptheory': APP_THEORY,
        '@theory-cloud/tabletheory-ts': TABLE_THEORY,
        react: '^19.2.6',
        'react-dom': '^19.2.6',
      },
      overrides: {
        '@theory-cloud/apptheory': {
          '@theory-cloud/tabletheory-ts': 'https://example.invalid/wrong-tabletheory.tgz',
        },
      },
    });
    await stubPackage(appDir, 'react', '19.2.6');
    await stubPackage(appDir, 'react-dom', '19.2.6');
    const packageJsonPath = await writeFacePackage(tempRoot);

    const exitCode = await runDoctorCli([], {
      cwd: appDir,
      nodeVersion: '24.12.4',
      packageJsonPath,
      stdout,
      stderr: new CaptureStream(),
    });

    assert.equal(exitCode, 1);
    assert.match(stdout.text, /AppTheory\/TableTheory override alignment is drifted/);
    assert.match(stdout.text, /Set overrides\["@theory-cloud\/apptheory"\]/);
    assert.match(stdout.text, /theory-cloud-tabletheory-ts-1\.10\.1\.tgz/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
