import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  applyFaceNavigationSnapshot,
  DEFAULT_FACE_VIEW_SELECTOR,
  loadFaceNavigationModule,
  parseFaceNavigationSnapshot,
  readFaceHydrationData,
  startFaceNavigation,
} from '../../src/spa.js';

async function flushEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('spa helpers: parse FaceTheory documents into navigation snapshots', () => {
  const html = `<!doctype html>
    <html data-theme="night" lang="fr">
      <head>
        <title>Next</title>
        <meta content="next page" name="description">
        <script id="__FACETHEORY_DATA__" type="application/json">{"page":"next"}</script>
        <script src="/assets/entry-client.js" type="module"></script>
      </head>
      <body class="page-shell">
        <main data-facetheory-view><h1>Next Page</h1></main>
      </body>
    </html>`;

  const dom = new JSDOM(html, { url: 'http://localhost/next' });

  try {
    assert.deepEqual(readFaceHydrationData(dom.window.document), { page: 'next' });

    const snapshot = parseFaceNavigationSnapshot(html, {
      parser: new dom.window.DOMParser(),
      url: 'http://localhost/next',
      viewSelector: DEFAULT_FACE_VIEW_SELECTOR,
    });

    assert.equal(snapshot.url, 'http://localhost/next');
    assert.equal(snapshot.title, 'Next');
    assert.deepEqual(snapshot.htmlAttrs, { 'data-theme': 'night', lang: 'fr' });
    assert.deepEqual(snapshot.bodyAttrs, { class: 'page-shell' });
    assert.equal(snapshot.viewHtml?.trim(), '<h1>Next Page</h1>');
    assert.deepEqual(snapshot.hydration, {
      bootstrapModule: '/assets/entry-client.js',
      data: { page: 'next' },
    });
  } finally {
    dom.window.close();
  }
});

test('spa helpers: apply snapshots preserves the shell when a view container exists', () => {
  const currentDom = new JSDOM(
    `<!doctype html>
      <html lang="en">
        <head>
          <title>Home</title>
          <meta content="home" name="description">
        </head>
        <body class="home-shell">
          <nav id="nav">Persistent Nav</nav>
          <main data-facetheory-view><p>Home</p></main>
        </body>
      </html>`,
    { url: 'http://localhost/' },
  );

  try {
    const nextSnapshot = parseFaceNavigationSnapshot(
      `<!doctype html>
        <html data-theme="night" lang="fr">
          <head>
            <title>Next</title>
            <link href="/assets/next.css" rel="stylesheet">
            <script id="__FACETHEORY_DATA__" type="application/json">{"page":"next"}</script>
            <script src="/assets/entry-client.js" type="module"></script>
          </head>
          <body class="next-shell">
            <header>Fresh shell that should not replace current nav</header>
            <main data-facetheory-view><p>Next</p></main>
          </body>
        </html>`,
      {
        parser: new currentDom.window.DOMParser(),
        url: 'http://localhost/next',
        viewSelector: DEFAULT_FACE_VIEW_SELECTOR,
      },
    );

    applyFaceNavigationSnapshot(nextSnapshot, {
      document: currentDom.window.document,
      viewSelector: DEFAULT_FACE_VIEW_SELECTOR,
    });

    assert.equal(currentDom.window.document.title, 'Next');
    assert.equal(currentDom.window.document.documentElement.getAttribute('data-theme'), 'night');
    assert.equal(currentDom.window.document.body.getAttribute('class'), 'next-shell');
    assert.equal(currentDom.window.document.getElementById('nav')?.textContent, 'Persistent Nav');
    assert.equal(
      currentDom.window.document.querySelector(DEFAULT_FACE_VIEW_SELECTOR)?.textContent?.trim(),
      'Next',
    );
    assert.ok(currentDom.window.document.head.innerHTML.includes('/assets/next.css'));
    assert.ok(
      currentDom.window.document.getElementById('__FACETHEORY_DATA__')?.textContent?.includes(
        '"page":"next"',
      ),
    );
    assert.ok(!currentDom.window.document.head.innerHTML.includes('/assets/entry-client.js'));
  } finally {
    currentDom.window.close();
  }
});

test('spa helpers: startFaceNavigation intercepts links and invokes hydration hooks', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html lang="en">
        <head><title>Home</title></head>
        <body class="shell">
          <nav><a href="/next" id="next-link">Next</a></nav>
          <main data-facetheory-view><p>Home</p></main>
        </body>
      </html>`,
    { url: 'http://localhost/' },
  );
  dom.window.scrollTo = (() => {}) as typeof dom.window.scrollTo;

  const fetched: string[] = [];
  const hydrated: Array<{ data: unknown; text: string | null; url: string }> = [];

  const controller = startFaceNavigation({
    document: dom.window.document,
    window: dom.window as unknown as Window,
    viewSelector: DEFAULT_FACE_VIEW_SELECTOR,
    fetcher: async (input) => {
      fetched.push(String(input));
      return new Response(
        `<!doctype html>
          <html data-theme="night" lang="en">
            <head>
              <title>Next</title>
              <script id="__FACETHEORY_DATA__" type="application/json">{"page":"next"}</script>
              <script src="/assets/entry-client.js" type="module"></script>
            </head>
            <body class="shell-next">
              <nav><a href="/next" id="next-link">Next</a></nav>
              <main data-facetheory-view><p>Next Page</p></main>
            </body>
          </html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    },
    importModule: async () => ({
      hydrateFaceNavigation: async (context) => {
        hydrated.push({
          data: context.data,
          text: context.view?.textContent?.trim() ?? null,
          url: context.url.toString(),
        });
      },
    }),
  });

  try {
    const link = dom.window.document.getElementById('next-link');
    assert.ok(link instanceof dom.window.HTMLAnchorElement);

    link.dispatchEvent(
      new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );

    await flushEventLoop();

    assert.deepEqual(fetched, ['http://localhost/next']);
    assert.equal(dom.window.location.pathname, '/next');
    assert.equal(dom.window.document.title, 'Next');
    assert.equal(
      dom.window.document.querySelector(DEFAULT_FACE_VIEW_SELECTOR)?.textContent?.trim(),
      'Next Page',
    );
    assert.deepEqual(hydrated, [
      {
        data: { page: 'next' },
        text: 'Next Page',
        url: 'http://localhost/next',
      },
    ]);
  } finally {
    controller.stop();
    dom.window.close();
  }
});

test('spa helpers: startFaceNavigation rejects cross-origin programmatic navigation', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html lang="en">
        <head><title>Home</title></head>
        <body class="shell">
          <main data-facetheory-view><p>Home</p></main>
        </body>
      </html>`,
    { url: 'http://localhost/' },
  );

  let fetchCalls = 0;
  const errors: string[] = [];
  const controller = startFaceNavigation({
    document: dom.window.document,
    window: dom.window as unknown as Window,
    fetcher: async () => {
      fetchCalls += 1;
      return new Response('<!doctype html><html><head><title>Ignored</title></head><body></body></html>');
    },
    onError: (error) => {
      errors.push(error instanceof Error ? error.message : String(error));
    },
  });

  try {
    await assert.rejects(
      controller.navigate('https://evil.example/next'),
      /FaceTheory SPA navigation requires same-origin URLs/,
    );

    assert.equal(fetchCalls, 0);
    assert.equal(errors.length, 1);
    assert.equal(dom.window.location.href, 'http://localhost/');
    assert.equal(dom.window.document.title, 'Home');
    assert.equal(
      dom.window.document.querySelector(DEFAULT_FACE_VIEW_SELECTOR)?.textContent?.trim(),
      'Home',
    );
  } finally {
    controller.stop();
    dom.window.close();
  }
});

test('spa helpers: startFaceNavigation rejects redirected cross-origin snapshots before DOM mutation', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html lang="en">
        <head><title>Home</title></head>
        <body class="shell">
          <main data-facetheory-view><p>Home</p></main>
        </body>
      </html>`,
    { url: 'http://localhost/' },
  );

  const controller = startFaceNavigation({
    document: dom.window.document,
    window: dom.window as unknown as Window,
    onError: () => {},
    fetcher: async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://evil.example/next',
        text: async () =>
          '<!doctype html><html><head><title>Redirected</title></head><body><main data-facetheory-view><p>Bad</p></main></body></html>',
      }) as Response,
  });

  try {
    await assert.rejects(
      controller.navigate('/next'),
      /FaceTheory SPA navigation fetch resolved cross-origin/,
    );

    assert.equal(dom.window.location.href, 'http://localhost/');
    assert.equal(dom.window.document.title, 'Home');
    assert.equal(
      dom.window.document.querySelector(DEFAULT_FACE_VIEW_SELECTOR)?.textContent?.trim(),
      'Home',
    );
  } finally {
    controller.stop();
    dom.window.close();
  }
});

test('spa helpers: startFaceNavigation rejects remote hydration modules before DOM mutation', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html lang="en">
        <head><title>Home</title></head>
        <body class="shell">
          <main data-facetheory-view><p>Home</p></main>
        </body>
      </html>`,
    { url: 'http://localhost/' },
  );

  const controller = startFaceNavigation({
    document: dom.window.document,
    window: dom.window as unknown as Window,
    onError: () => {},
    fetcher: async () =>
      new Response(
        `<!doctype html>
          <html lang="en">
            <head>
              <title>Next</title>
              <script id="__FACETHEORY_DATA__" type="application/json">{"page":"next"}</script>
              <script src="https://evil.example/assets/entry-client.js" type="module"></script>
            </head>
            <body class="shell-next">
              <main data-facetheory-view><p>Next Page</p></main>
            </body>
          </html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
  });

  try {
    await assert.rejects(
      controller.navigate('/next'),
      /FaceTheory SPA hydration module resolved cross-origin/,
    );

    assert.equal(dom.window.location.href, 'http://localhost/');
    assert.equal(dom.window.document.title, 'Home');
    assert.equal(
      dom.window.document.querySelector(DEFAULT_FACE_VIEW_SELECTOR)?.textContent?.trim(),
      'Home',
    );
  } finally {
    controller.stop();
    dom.window.close();
  }
});

test('spa helpers: loadFaceNavigationModule rejects cross-origin bootstrap modules', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html lang="en">
        <head><title>Home</title></head>
        <body class="shell">
          <main data-facetheory-view><p>Home</p></main>
        </body>
      </html>`,
    { url: 'http://localhost/' },
  );

  try {
    const snapshot = parseFaceNavigationSnapshot(
      `<!doctype html>
        <html lang="en">
          <head>
            <title>Next</title>
            <script id="__FACETHEORY_DATA__" type="application/json">{"page":"next"}</script>
            <script src="https://evil.example/assets/entry-client.js" type="module"></script>
          </head>
          <body class="shell-next">
            <main data-facetheory-view><p>Next Page</p></main>
          </body>
        </html>`,
      {
        parser: new dom.window.DOMParser(),
        url: 'http://localhost/next',
        viewSelector: DEFAULT_FACE_VIEW_SELECTOR,
      },
    );

    await assert.rejects(
      loadFaceNavigationModule(snapshot, { document: dom.window.document }),
      /FaceTheory SPA hydration module resolved cross-origin/,
    );
  } finally {
    dom.window.close();
  }
});
