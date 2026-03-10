import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ViteManifest } from '../../src/vite.js';

async function loadManifest(): Promise<ViteManifest> {
  const manifestPath = path.resolve(
    'examples/vite-ssr-vue/dist/client/.vite/manifest.json',
  );
  const raw = await readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as ViteManifest;
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function readStaticFile(root: string, urlPath: string): Promise<{ body: Uint8Array; type: string } | null> {
  const decoded = decodeURIComponent(urlPath);
  if (!decoded.startsWith('/')) return null;
  if (decoded.includes('\0')) return null;

  const safePath = decoded.replaceAll('\\', '/');
  if (safePath.includes('..')) return null;

  const filePath = path.resolve(root, `.${safePath}`);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) return null;

  try {
    const body = await readFile(filePath);
    return { body, type: contentTypeForPath(filePath) };
  } catch {
    return null;
  }
}

async function main() {
  const manifest = await loadManifest();
  const serverEntryPath = path.resolve(
    'examples/vite-ssr-vue/dist/server/entry-server.js',
  );
  const serverMod = await import(pathToFileURL(serverEntryPath).href);

  const app = serverMod.createViteVueSSRExampleApp(manifest);

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const clientRoot = path.resolve('examples/vite-ssr-vue/dist/client');
    if (req.url.startsWith('/assets/') || req.url.startsWith('/.vite/')) {
      const staticFile = await readStaticFile(clientRoot, req.url);
      if (!staticFile) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'content-type': staticFile.type });
      res.end(staticFile.body);
      return;
    }

    const resp = await app.handle({ method: 'GET', path: req.url });
    res.writeHead(
      resp.status,
      Object.fromEntries(Object.entries(resp.headers).map(([k, v]) => [k, v.join(', ')])),
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

  const port = Number(process.env.PORT ?? 4175);
  server.listen(port);
  console.log(`listening on http://localhost:${port}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
