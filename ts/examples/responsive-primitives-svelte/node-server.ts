import http from 'node:http';

import { renderResponsivePrimitivesSveltePages } from './render.js';

async function main() {
  const pages = await renderResponsivePrimitivesSveltePages();
  const byName = new Map(pages.map((page) => [page.name, page.html]));

  const index = `<!doctype html><html lang="en"><head><title>FaceTheory responsive primitives (Svelte)</title></head><body>
<main>
<h1>FaceTheory responsive primitives (Svelte)</h1>
<p>The same shared responsive-primitive contracts rendered by the Svelte adapter.</p>
<ul>
${pages
  .map((page) => `<li><a href="/${page.name}">${page.name === 'shell' ? 'styles-only shell' : page.name}</a></li>`)
  .join('\n')}
</ul>
</main>
</body></html>`;

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const name = urlPath.replace(/^\//, '');
    if (urlPath === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(index);
      return;
    }
    const page = byName.get(name);
    if (page === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
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
