import assert from 'node:assert/strict';
import test from 'node:test';

import type { AddressInfo } from 'node:net';

import { createFaceApp } from '../../src/app.js';
import {
  createViteMiddlewareDevServer,
  type ViteMiddlewareDevServerLike,
} from '../../src/dev.js';

function fakeViteServer(): ViteMiddlewareDevServerLike {
  return {
    middlewares: (_req, _res, next) => {
      next();
    },
    ssrLoadModule: async () => ({}),
    close: async () => {},
  };
}

function createDevServer() {
  return createViteMiddlewareDevServer({
    entry: 'src/entry-server.tsx',
    createServer: async () => fakeViteServer(),
    createApp: () =>
      createFaceApp({
        faces: [
          {
            route: '/',
            mode: 'ssr',
            render: () => ({ html: '<main>dev</main>' }),
          },
        ],
      }),
  });
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.text(),
  };
}

test('vite dev server: Vite middleware serves dev assets before FaceApp routes', async () => {
  let ssrLoads = 0;
  let viteClosed = false;
  const fakeVite: ViteMiddlewareDevServerLike = {
    middlewares: (req, res, next) => {
      if (req.url === '/@vite/client') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        res.end('export const hmr = true;');
        return;
      }
      next();
    },
    ssrLoadModule: async () => {
      ssrLoads += 1;
      return {};
    },
    close: async () => {
      viteClosed = true;
    },
  };

  const devServer = await createViteMiddlewareDevServer({
    entry: 'src/entry-server.tsx',
    createServer: async (config) => {
      assert.equal(config.appType, 'custom');
      assert.equal(config.server?.middlewareMode, true);
      return fakeVite;
    },
    createApp: () =>
      createFaceApp({
        faces: [
          {
            route: '/',
            mode: 'ssr',
            render: () => ({ html: '<main>FaceApp route</main>' }),
          },
        ],
      }),
  });

  const { url } = await devServer.listen({ port: 0 });
  try {
    const response = await fetchText(`${url}@vite/client`);
    assert.equal(response.status, 200);
    assert.equal(response.body, 'export const hmr = true;');
    assert.equal(ssrLoads, 0);
  } finally {
    await devServer.close();
  }

  assert.equal(viteClosed, true);
});

test('vite dev server: loads the SSR entry through Vite for FaceApp requests', async () => {
  const loadedEntries: string[] = [];
  const fakeVite: ViteMiddlewareDevServerLike = {
    middlewares: (_req, _res, next) => {
      next();
    },
    ssrLoadModule: async (id) => {
      loadedEntries.push(id);
      return {};
    },
    close: async () => {},
  };

  const devServer = await createViteMiddlewareDevServer({
    entry: 'src/entry-server.tsx',
    createServer: async () => fakeVite,
    createApp: () =>
      createFaceApp({
        faces: [
          {
            route: '/',
            mode: 'ssr',
            render: () => ({
              headers: { 'x-dev-loop': 'active' },
              html: '<main>Vite SSR dev loop</main>',
            }),
          },
        ],
      }),
  });

  const { url } = await devServer.listen({ port: 0 });
  try {
    const response = await fetchText(url);
    assert.equal(response.status, 200);
    assert.match(response.body, /Vite SSR dev loop/);
  } finally {
    await devServer.close();
  }

  assert.deepEqual(loadedEntries, ['/src/entry-server.tsx']);
});

test('vite dev server: sanitizes error responses without exposing stacks', async () => {
  const renderError = new Error('load failed');
  renderError.stack = 'SECRET_STACK\n    at /tmp/secret-entry.ts:1:1';
  let fixedStacktrace = false;
  const fakeVite: ViteMiddlewareDevServerLike = {
    middlewares: (_req, _res, next) => {
      next();
    },
    ssrLoadModule: async () => {
      throw renderError;
    },
    ssrFixStacktrace: (err) => {
      fixedStacktrace = err === renderError;
    },
    close: async () => {},
  };

  const devServer = await createViteMiddlewareDevServer({
    entry: 'src/entry-server.tsx',
    createServer: async () => fakeVite,
    createApp: () =>
      createFaceApp({
        faces: [
          {
            route: '/',
            mode: 'ssr',
            render: () => ({ html: '<main>unreachable</main>' }),
          },
        ],
      }),
  });

  const { url } = await devServer.listen({ port: 0 });
  try {
    const response = await fetchText(url);
    assert.equal(response.status, 500);
    assert.equal(response.body, 'Error: load failed');
    assert.equal(response.body.includes('SECRET_STACK'), false);
  } finally {
    await devServer.close();
  }

  assert.equal(fixedStacktrace, true);
});

test('vite dev server: binds loopback by default and reports the real address', async () => {
  const devServer = await createDevServer();
  const { address, url } = await devServer.listen({ port: 0 });
  try {
    const info = address as AddressInfo;
    assert.equal(info.address, '127.0.0.1');
    assert.equal(url, `http://127.0.0.1:${info.port}/`);

    const response = await fetchText(url);
    assert.equal(response.status, 200);
  } finally {
    await devServer.close();
  }
});

test('vite dev server: rejects request bodies above the size limit', async () => {
  const devServer = await createDevServer();
  const { url } = await devServer.listen({ port: 0 });
  try {
    const declared = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(1024 * 1024 + 1),
    });
    assert.equal(declared.status, 413);
    assert.equal(await declared.text(), 'Payload Too Large');

    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
    const streamed = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: new ReadableStream({
        start(controller) {
          for (let index = 0; index < 20; index += 1) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    assert.equal(streamed.status, 413);
    assert.equal(await streamed.text(), 'Payload Too Large');
  } finally {
    await devServer.close();
  }
});

test('vite dev server: an explicit host opt-in is honored and shown without masking', async () => {
  const wildcard = await createDevServer();
  const wildcardResult = await wildcard.listen({ port: 0, host: '0.0.0.0' });
  try {
    assert.equal((wildcardResult.address as AddressInfo).address, '0.0.0.0');
    assert.match(wildcardResult.url, /^http:\/\/0\.0\.0\.0:\d+\/$/);
  } finally {
    await wildcard.close();
  }

  const ipv6 = await createDevServer();
  const ipv6Result = await ipv6.listen({ port: 0, host: '::1' });
  try {
    assert.equal((ipv6Result.address as AddressInfo).address, '::1');
    assert.match(ipv6Result.url, /^http:\/\/\[::1\]:\d+\/$/);

    const response = await fetchText(ipv6Result.url);
    assert.equal(response.status, 200);
  } finally {
    await ipv6.close();
  }
});
