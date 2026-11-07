import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { build } from 'esbuild';

const HOST_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FaceTheory navigation pending host</title>
</head>
<body>
  <main>
    <h1>Navigation pending host page</h1>
    <p>Accepted same-origin link clicks and form submissions show the pending indicator.</p>
    <nav>
      <a href="/next" id="same-origin-link">Next page</a>
      <a href="https://example.com/" id="external-link" rel="external">External page</a>
    </nav>
    <form method="post" action="/submit">
      <button type="submit">Submit</button>
    </form>
  </main>
  <script type="module" src="/navigation-pending.js"></script>
  <script type="module" src="/navigation-pending-entry.js"></script>
</body>
</html>`;

async function bundleEntry(): Promise<string> {
  const result = await build({
    entryPoints: [path.resolve('examples/navigation-pending/navigation-pending-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild produced no navigation-pending bundle');
  return output.text;
}

async function main() {
  const entryBundle = await bundleEntry();
  const [helper, spa, domGuards] = await Promise.all([
    readFile(path.resolve('dist/navigation-pending.js'), 'utf8'),
    readFile(path.resolve('dist/spa.js'), 'utf8'),
    readFile(path.resolve('dist/dom-guards.js'), 'utf8'),
  ]);

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    if (urlPath === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HOST_PAGE);
      return;
    }
    const modules = new Map([
      ['/navigation-pending.js', helper],
      ['/navigation-pending-entry.js', entryBundle],
      ['/spa.js', spa],
      ['/dom-guards.js', domGuards],
    ]);
    const module = modules.get(urlPath);
    if (module !== undefined) {
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'x-content-type-options': 'nosniff',
      });
      res.end(module);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  const port = Number(process.env.PORT ?? 4174);
  server.listen(port, '127.0.0.1', () => {
    console.log(`listening on http://localhost:${port}/`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
