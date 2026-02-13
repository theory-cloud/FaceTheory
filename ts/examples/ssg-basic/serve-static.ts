import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('examples/ssg-basic/dist-static');
const port = Number(process.env.PORT ?? 4175);

function contentTypeForFile(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
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

async function resolveRequestPath(urlPath: string): Promise<string | null> {
  const safePath = urlPath.replaceAll('\\', '/');
  const cleanPath = safePath.split('?')[0] ?? '/';
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
    const absolute = path.resolve(rootDir, `.${candidate}`);
    if (!absolute.startsWith(rootDir)) continue;
    if (await fileExists(absolute)) return absolute;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const urlPath = req.url ?? '/';
  const resolvedFile = await resolveRequestPath(urlPath);
  if (resolvedFile) {
    const body = await readFile(resolvedFile);
    res.writeHead(200, { 'content-type': contentTypeForFile(resolvedFile) });
    res.end(body);
    return;
  }

  const fallback404 = path.resolve(rootDir, '404.html');
  if (await fileExists(fallback404)) {
    const body = await readFile(fallback404);
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Serving SSG output at http://localhost:${port}`);
});
