import assert from 'node:assert/strict';
import test from 'node:test';

import { createConnection, type AddressInfo } from 'node:net';

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

function rawPostStatus(
  url: URL,
  headers: string[],
  body: Buffer[] = [],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port),
    });
    let head = '';
    let settled = false;
    const finish = (status?: number, err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(status ?? 0);
    };

    socket.setTimeout(5_000, () =>
      finish(undefined, new Error('timed out waiting for the 413 response')),
    );
    socket.on('error', (err) => finish(undefined, err));
    socket.on('close', () =>
      finish(
        undefined,
        new Error(`dev server closed before responding: ${head.trim()}`),
      ),
    );
    socket.on('connect', () => {
      socket.write(
        `POST / HTTP/1.1\r\nHost: ${url.host}\r\n${headers.join('\r\n')}\r\n\r\n`,
      );
      for (const chunk of body) socket.write(chunk);
    });
    socket.on('data', (chunk) => {
      head += chunk.toString('utf8');
      const match = /^HTTP\/1\.1 (\d{3})/.exec(head);
      if (match) finish(Number(match[1]));
    });
  });
}

test('vite dev server: rejects request bodies above the size limit', async () => {
  const devServer = await createDevServer();
  const { url } = await devServer.listen({ port: 0 });
  const bodyLimit = 1024 * 1024;
  try {
    const declared = await rawPostStatus(new URL(url), [
      'Content-Type: text/plain',
      `Content-Length: ${bodyLimit + 1}`,
      'Connection: close',
    ]);
    assert.equal(declared, 413);

    const chunk = Buffer.alloc(bodyLimit + 1, 0x78);
    const streamed = await rawPostStatus(
      new URL(url),
      [
        'Content-Type: text/plain',
        'Transfer-Encoding: chunked',
        'Connection: close',
      ],
      [
        Buffer.from(`${chunk.byteLength.toString(16)}\r\n`),
        chunk,
        Buffer.from('\r\n0\r\n\r\n'),
      ],
    );
    assert.equal(streamed, 413);
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
