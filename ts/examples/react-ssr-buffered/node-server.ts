import http from 'node:http';

import { faceApp } from './handler.js';

function toNodeHeaders(headers: Record<string, string[]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, values] of Object.entries(headers)) {
    if (!values.length) continue;
    out[name] = values.length === 1 ? values[0] : values;
  }
  return out;
}

async function main() {
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const response = await faceApp.handle({
      method: req.method ?? 'GET',
      path: req.url,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.map(String) : value ? [String(value)] : [],
        ]),
      ),
    });

    res.writeHead(response.status, toNodeHeaders(response.headers));

    if (response.body instanceof Uint8Array) {
      res.end(response.body);
      return;
    }

    for await (const chunk of response.body) {
      res.write(chunk);
    }
    res.end();
  });

  const port = Number(process.env.PORT ?? 4172);
  server.listen(port);
  // eslint-disable-next-line no-console
  console.log(`listening on http://localhost:${port}/`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
