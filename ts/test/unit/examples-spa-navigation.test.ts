import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import { DEFAULT_FACE_VIEW_SELECTOR } from '@theory-cloud/facetheory/spa';

import { createSpaNavigationExampleApp } from '../../examples/spa-navigation/server.js';

type SpaExampleApp = ReturnType<typeof createSpaNavigationExampleApp>;
import {
  hydrateFaceNavigation,
  hydrateSpaNavigationInitial,
  startSpaNavigationExample,
} from '../../examples/spa-navigation/entry-client.js';

async function flushEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function collectBody(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// Fetcher backed by the real example app so navigation loads Face HTML and each
// Face's sidecar JSON from the same origin the server serves.
function createAppFetcher(app: SpaExampleApp): {
  fetcher: typeof fetch;
  requests: string[];
} {
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost/');
    requests.push(url.toString());
    const resp = await app.handle({
      method: init?.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
    });
    const headers = new Headers();
    for (const [key, values] of Object.entries(resp.headers)) {
      for (const value of values) headers.append(key, value);
    }
    return new Response(new TextDecoder().decode(await collectBody(resp.body)), {
      status: resp.status,
      headers,
    });
  }) as typeof fetch;
  return { fetcher, requests };
}

async function renderHtml(app: SpaExampleApp, path: string): Promise<string> {
  const resp = await app.handle({ method: 'GET', path });
  return new TextDecoder().decode(await collectBody(resp.body));
}

test(
  'examples integrity: SPA navigation swaps Faces and loads each Face sidecar',
  { concurrency: false },
  async () => {
    const app = createSpaNavigationExampleApp();
    const homeHtml = await renderHtml(app, '/');

    // The two Faces render into a persistent shell + swappable view with an
    // external sidecar link rather than inline hydration data.
    assert.ok(homeHtml.includes('data-facetheory-view'));
    assert.ok(homeHtml.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.ok(homeHtml.includes('/spa-data/home.json'));
    assert.equal(/id="__FACETHEORY_DATA__"/.test(homeHtml), false);
    assert.ok(homeHtml.includes('/assets/spa-navigation-entry.js'));

    const dom = new JSDOM(homeHtml, { url: 'http://localhost/' });
    dom.window.scrollTo = (() => {}) as typeof dom.window.scrollTo;
    const { fetcher, requests } = createAppFetcher(app);

    try {
      // Initial-load hydration reads the current Face's sidecar.
      const initial = await hydrateSpaNavigationInitial({
        document: dom.window.document,
        fetcher,
      });
      assert.equal(initial?.page, 'home');
      assert.deepEqual(requests, ['http://localhost/spa-data/home.json']);
      assert.equal(
        dom.window.document
          .querySelector('[data-hydration-source]')
          ?.textContent,
        'client-hydrated',
      );
      assert.equal(
        dom.window.document.querySelector('[data-cart-count]')?.textContent,
        '1',
      );

      const controllers = startSpaNavigationExample({
        document: dom.window.document,
        window: dom.window as unknown as Window,
        fetcher,
        importModule: async () => ({ hydrateFaceNavigation }),
      });

      try {
        const link = dom.window.document.querySelector(
          'a[href="/details"]',
        );
        assert.ok(link instanceof dom.window.HTMLAnchorElement);

        link.dispatchEvent(
          new dom.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );

        // navigation-pending marks pending synchronously on the click.
        assert.equal(controllers.pending.isPending(), true);

        await flushEventLoop();

        // Navigated to /details and loaded its sidecar JSON.
        assert.ok(requests.includes('http://localhost/details'));
        assert.ok(requests.includes('http://localhost/spa-data/details.json'));
        assert.equal(dom.window.location.pathname, '/details');
        assert.equal(dom.window.document.title, 'Order details');
        // The persistent view element keeps its identity; only its inner content
        // is swapped to the navigated Face's rendered HTML.
        const view = dom.window.document.querySelector(DEFAULT_FACE_VIEW_SELECTOR);
        assert.ok(view?.textContent?.includes('Order details'));
        assert.ok(
          view?.textContent?.includes(
            'Line items and totals loaded from the details Face sidecar.',
          ),
        );

        // hydrateFaceNavigation ran after the swap with the sidecar data.
        assert.equal(
          dom.window.document
            .querySelector('[data-hydration-source]')
            ?.textContent,
          'client-navigated',
        );
        assert.equal(
          dom.window.document.querySelector('[data-cart-count]')?.textContent,
          '3',
        );
        assert.equal(dom.window.__FACETHEORY_SPA_NAVIGATED__, 1);

        // The completion hook cleared the navigation-pending indicator.
        assert.equal(controllers.pending.isPending(), false);
      } finally {
        controllers.navigation.stop();
        controllers.pending.stop();
      }
    } finally {
      dom.window.close();
    }
  },
);
