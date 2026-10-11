import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    throw new Error('Failed to reserve an ephemeral port for the Vue SSG static server');
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

async function startExampleServer(
  cwd: string,
  entryPoint: string,
  port: number,
  readyLine: string,
): Promise<ChildProcess> {
  const tsxBin = path.resolve(cwd, 'node_modules/.bin/tsx');
  const child = spawn(tsxBin, [entryPoint], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  const appendLogs = (chunk: string | Buffer) => {
    logs += chunk.toString();
  };

  child.stdout.on('data', appendLogs);
  child.stderr.on('data', appendLogs);

  await new Promise<void>((resolve, reject) => {
    const onData = () => {
      if (logs.includes(readyLine)) {
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
        resolve();
      }
    };
    const onError = (error: Error) => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('error', onError);
      reject(
        new Error(
          `Vue SSG static server exited before listening (code=${code}, signal=${signal})\n${logs}`,
        ),
      );
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });

  return child;
}

async function stopExampleServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;

  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit').then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

// A raw HTTP request line is used deliberately: WHATWG `fetch` normalizes `..`
// away before the request reaches the server, which would hide the traversal.
async function rawHttpGet(
  port: number,
  target: string,
): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.on('error', reject);
    socket.on('end', () => {
      const separator = data.indexOf('\r\n\r\n');
      const head = separator === -1 ? data : data.slice(0, separator);
      const body = separator === -1 ? '' : data.slice(separator + 4);
      resolve({ status: Number(head.split(' ')[1] ?? NaN), body });
    });
  });
}

test(
  'vue SSG example: statically generates a real Vue tree with Vite assets and generateStaticParams',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');

    await rm(path.resolve('examples/vue-ssg/dist'), {
      recursive: true,
      force: true,
    });
    await rm(path.resolve('examples/vue-ssg/dist-static'), {
      recursive: true,
      force: true,
    });

    await execFileAsync('npm', ['run', 'example:vue:ssg:build'], { cwd });

    const staticRoot = path.resolve('examples/vue-ssg/dist-static');

    // The static route and every generateStaticParams product page are emitted.
    const homePath = path.join(staticRoot, 'index.html');
    assert.ok(await exists(homePath));
    const home = await readFile(homePath, 'utf8');
    assert.ok(home.includes('FaceTheory Vue SSG catalog'));
    for (const slug of ['aurora-lamp', 'nimbus-chair', 'zephyr-desk']) {
      assert.ok(
        home.includes(`href="/products/${slug}"`),
        `home should link to /products/${slug}`,
      );
      assert.ok(
        await exists(path.join(staticRoot, 'products', slug, 'index.html')),
        `missing generated page for ${slug}`,
      );
    }

    // The product page carries the real Vue render plus the Vite asset head tags.
    const productPath = path.join(
      staticRoot,
      'products',
      'aurora-lamp',
      'index.html',
    );
    const product = await readFile(productPath, 'utf8');
    assert.ok(product.includes('<title>Product — FaceTheory Vue SSG</title>'));
    assert.ok(product.includes('Aurora Lamp'));
    assert.ok(product.includes('dawn-simulation'));
    assert.ok(product.includes('id="__FACETHEORY_DATA__"'));

    const cssHref = product.match(
      /<link[^>]+href="(\/assets\/[^"]+\.css)"[^>]*rel="stylesheet"/,
    )?.[1];
    const jsSrc = product.match(
      /<script[^>]+src="(\/assets\/[^"]+\.js)"[^>]*type="module"/,
    )?.[1];
    assert.ok(cssHref, 'product page should link a built Vite stylesheet');
    assert.ok(jsSrc, 'product page should load the built Vite client module');

    // The referenced Vite assets exist in the built client output.
    const clientRoot = path.resolve('examples/vue-ssg/dist/client');
    assert.ok(
      await exists(path.resolve(clientRoot, `.${cssHref}`)),
      `missing built CSS asset: ${cssHref}`,
    );
    assert.ok(
      await exists(path.resolve(clientRoot, `.${jsSrc}`)),
      `missing built JS asset: ${jsSrc}`,
    );

    const port = await reservePort();
    const siblingDir = path.resolve('examples/vue-ssg/dist-staticsibling');
    await mkdir(siblingDir, { recursive: true });
    await writeFile(path.join(siblingDir, 'secret.html'), '<main>escape</main>');

    const server = await startExampleServer(
      cwd,
      'examples/vue-ssg/serve-static.ts',
      port,
      `Serving Vue SSG output at http://localhost:${port}`,
    );
    try {
      // Ordinary static page and its built asset keep serving.
      const homeResp = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(homeResp.status, 200);
      assert.match(await homeResp.text(), /FaceTheory Vue SSG catalog/);

      const assetResp = await fetch(`http://127.0.0.1:${port}${jsSrc}`);
      assert.equal(assetResp.status, 200);

      // A sibling directory sharing the `dist-static` string prefix must not be
      // reachable through `..` segments.
      const traversalResp = await rawHttpGet(port, '/../dist-staticsibling/secret.html');
      assert.equal(traversalResp.status, 404);
      assert.doesNotMatch(traversalResp.body, /escape/);
    } finally {
      await stopExampleServer(server);
      await rm(siblingDir, { recursive: true, force: true });
    }
  },
);
