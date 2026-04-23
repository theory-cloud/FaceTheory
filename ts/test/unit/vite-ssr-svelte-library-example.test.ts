import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { JSDOM } from 'jsdom';

import type { ViteManifest } from '../../src/vite.js';

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
    throw new Error('Failed to reserve an ephemeral port for the Vite Svelte library example');
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

async function startExampleServer(
  cwd: string,
  entryPoint: string,
  port: number,
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
    const readyLine = `listening on http://localhost:${port}/`;

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
          `Vite Svelte library example server exited before listening (code=${code}, signal=${signal})\n${logs}`,
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

async function flushEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installDomGlobals(dom: JSDOM): void {
  function setGlobal(name: string, value: unknown): void {
    try {
      (globalThis as Record<string, unknown>)[name] = value;
    } catch {
      Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true,
      });
    }
  }

  setGlobal('window', dom.window);
  setGlobal('document', dom.window.document);
  setGlobal('navigator', dom.window.navigator);
  setGlobal('HTMLElement', dom.window.HTMLElement);
  setGlobal('SVGElement', dom.window.SVGElement);
  setGlobal('Element', dom.window.Element);
  setGlobal('Node', dom.window.Node);
  setGlobal('Text', dom.window.Text);
  setGlobal('Comment', dom.window.Comment);
  setGlobal('DocumentFragment', dom.window.DocumentFragment);
  setGlobal('Event', dom.window.Event);
  setGlobal('CustomEvent', dom.window.CustomEvent);
  setGlobal('MutationObserver', dom.window.MutationObserver);
  setGlobal('HTMLAnchorElement', dom.window.HTMLAnchorElement);
  setGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  setGlobal('HTMLFormElement', dom.window.HTMLFormElement);
  setGlobal('HTMLInputElement', dom.window.HTMLInputElement);
  setGlobal('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
  setGlobal('HTMLImageElement', dom.window.HTMLImageElement);
  setGlobal('HTMLMediaElement', dom.window.HTMLMediaElement);

  dom.window.requestAnimationFrame =
    dom.window.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0));
  dom.window.cancelAnimationFrame =
    dom.window.cancelAnimationFrame ?? ((id) => clearTimeout(id));

  setGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  setGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
  setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
}

test(
  'vite SSR svelte external library example: builds, injects assets, and hydrates interactivity',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');

    const distDir = path.resolve('examples/vite-ssr-svelte-library/dist');
    await rm(distDir, { recursive: true, force: true });

    await execFileAsync('npm', ['run', 'example:vite:svelte:library:build'], { cwd });

    const manifestPath = path.resolve(
      'examples/vite-ssr-svelte-library/dist/client/.vite/manifest.json',
    );
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as ViteManifest;
    const clientEntry = manifest['src/entry-client.ts'];
    assert.ok(clientEntry);

    const serverEntryPath = path.resolve(
      'examples/vite-ssr-svelte-library/dist/server/entry-server.js',
    );
    assert.ok(await exists(serverEntryPath));

    const serverMod = await import(pathToFileURL(serverEntryPath).href);
    const app = serverMod.createViteSvelteLibraryExampleApp(manifest);

    const resp = await app.handle({ method: 'GET', path: '/' });
    const body = new TextDecoder().decode(resp.body as Uint8Array);

    assert.ok(body.includes('FaceTheory Svelte Library Host'), body.slice(0, 320));
    assert.ok(body.includes('Hosted from a packaged library'), body.slice(0, 320));
    assert.ok(body.includes('Library clicks 3'), body.slice(0, 320));
    assert.match(
      body,
      /<meta[^>]*content="external-svelte-library"[^>]*name="example"|<meta[^>]*name="example"[^>]*content="external-svelte-library"/,
    );
    assert.ok(body.includes('id="__FACETHEORY_DATA__"'));
    assert.ok(body.includes('type="module"'));

    const injectedPaths = new Set<string>();
    for (const match of body.matchAll(/<(?:link|script|img)\b[^>]*(?:href|src)="([^"]+)"/g)) {
      const candidate = match[1];
      if (!candidate || !candidate.startsWith('/')) continue;
      injectedPaths.add(candidate);
    }
    assert.ok(injectedPaths.size > 0);

    for (const injectedPath of injectedPaths) {
      const builtPath = path.resolve('examples/vite-ssr-svelte-library/dist/client', `.${injectedPath}`);
      assert.ok(await exists(builtPath), `missing built asset: ${injectedPath}`);
    }

    const dom = new JSDOM(body, { url: 'http://localhost/' });
    installDomGlobals(dom);

    const errors: string[] = [];
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = (...args) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    };
    console.warn = (...args) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      const builtClientPath = path.resolve(
        'examples/vite-ssr-svelte-library/dist/client',
        clientEntry.file,
      );
      await import(pathToFileURL(builtClientPath).href);
      await flushEventLoop();

      const button = dom.window.document.querySelector('[data-library-button]');
      assert.ok(button instanceof dom.window.HTMLButtonElement);
      assert.match(button.textContent ?? '', /Library clicks 3/);

      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await flushEventLoop();

      assert.match(button.textContent ?? '', /Library clicks 4/);
      assert.deepEqual(errors, []);
    } finally {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      dom.window.close();
    }

    const port = await reservePort();
    const server = await startExampleServer(
      cwd,
      'examples/vite-ssr-svelte-library/node-server.ts',
      port,
    );
    try {
      const malformedResp = await fetch(`http://127.0.0.1:${port}/assets/%E0%A4%A`);
      assert.equal(malformedResp.status, 404);
      assert.equal(await malformedResp.text(), 'Not Found');
      assert.equal(server.exitCode, null);

      const healthyResp = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(healthyResp.status, 200);
      assert.match(await healthyResp.text(), /FaceTheory Svelte Library Host/);
    } finally {
      await stopExampleServer(server);
    }
  },
);
