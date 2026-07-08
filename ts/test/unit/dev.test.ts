import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import {
  createViteMiddlewareDevServer,
  type ViteMiddlewareDevServerLike,
} from '../../src/dev.js';

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
