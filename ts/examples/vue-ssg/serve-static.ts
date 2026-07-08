import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const staticRoot = path.resolve('examples/vue-ssg/dist-static');
const clientRoot = path.resolve('examples/vue-ssg/dist/client');
const port = Number(process.env.PORT ?? 4182);

function contentTypeForFile(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const st = await stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function resolveStaticPage(urlPath: string): Promise<string | null> {
  const cleanPath = (urlPath.split('?')[0] ?? '/').replaceAll('\\', '/');
  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  const candidates = new Set<string>();
  if (normalized === '/') {
    candidates.add('/index.html');
  } else if (normalized.endsWith('/')) {
    candidates.add(`${normalized}index.html`);
    candidates.add(`${normalized.slice(0, -1)}.html`);
  } else {
    candidates.add(normalized);
    candidates.add(`${normalized}.html`);
    candidates.add(`${normalized}/index.html`);
  }

  for (const candidate of candidates) {
    const absolute = path.resolve(staticRoot, `.${candidate}`);
    if (!absolute.startsWith(staticRoot)) continue;
    if (await fileExists(absolute)) return absolute;
  }
  return null;
}

async function resolveClientAsset(urlPath: string): Promise<string | null> {
  const cleanPath = (urlPath.split('?')[0] ?? '/').replaceAll('\\', '/');
  if (cleanPath.includes('..')) return null;
  const absolute = path.resolve(clientRoot, `.${cleanPath}`);
  if (!absolute.startsWith(clientRoot)) return null;
  return (await fileExists(absolute)) ? absolute : null;
}

const server = createServer(async (req, res) => {
  const urlPath = req.url ?? '/';

  // Vite-built client assets live under dist/client; SSG HTML lives under dist-static.
  if (urlPath.startsWith('/assets/') || urlPath.startsWith('/.vite/')) {
    const assetFile = await resolveClientAsset(urlPath);
    if (assetFile) {
      res.writeHead(200, { 'content-type': contentTypeForFile(assetFile) });
      res.end(await readFile(assetFile));
      return;
    }
  }

  const pageFile = await resolveStaticPage(urlPath);
  if (pageFile) {
    res.writeHead(200, { 'content-type': contentTypeForFile(pageFile) });
    res.end(await readFile(pageFile));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(port, () => {
  console.log(`Serving Vue SSG output at http://localhost:${port}`);
});
