import http from 'node:http';
import path from 'node:path';

import { build } from 'esbuild';

import { createSpaNavigationExampleApp } from './server.js';
import { BOOTSTRAP_MODULE } from './faces.js';

// Bundle the client entry so real browser navigation works. In a consumer app
// this is the normal client build step; here esbuild keeps the example runnable
// without a persistent bundler config.
async function bundleClient(): Promise<string> {
  const result = await build({
    entryPoints: [
      path.resolve('examples/spa-navigation/entry-client.ts'),
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild produced no client bundle');
  return output.text;
}

function parseRequestTarget(
  requestTarget: string,
): { path: string; appPath: string } | null {
  try {
    const parsed = new URL(requestTarget, 'http://localhost');
    return {
      path: parsed.pathname,
      appPath: `${parsed.pathname}${parsed.search}`,
    };
  } catch {
    return null;
  }
}

async function main() {
  const app = createSpaNavigationExampleApp();
  const clientBundle = await bundleClient();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const requestTarget = parseRequestTarget(req.url);
    if (!requestTarget) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (requestTarget.path === BOOTSTRAP_MODULE) {
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
      });
      res.end(clientBundle);
      return;
    }

    const resp = await app.handle({
      method: req.method ?? 'GET',
      path: requestTarget.appPath,
    });
    res.writeHead(
      resp.status,
      Object.fromEntries(
        Object.entries(resp.headers).map(([k, v]) => [k, v.join(', ')]),
      ),
    );

    if (resp.body instanceof Uint8Array) {
      res.end(resp.body);
      return;
    }

    for await (const chunk of resp.body) {
      res.write(chunk);
    }
    res.end();
  });

  const port = Number(process.env.PORT ?? 4181);
  server.listen(port);
  console.log(`listening on http://localhost:${port}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
