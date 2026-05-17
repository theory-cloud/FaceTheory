import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

import {
  startFaceNavigation,
  type FaceNavigationBootstrapContext,
} from '../../src/spa.js';

export interface StrictCspDocumentAssertionOptions {
  allowedOrigin?: string | URL;
  scopeSelector?: string;
  url?: string | URL;
}

export interface StrictCspFetchFixture {
  body: string;
  contentType?: string;
  status?: number;
  url?: string;
}

export interface StrictCspFixtureFetchResult {
  fetcher: typeof fetch;
  requests: string[];
}

export interface StrictCspNavigationExerciseOptions {
  currentHtml: string;
  currentUrl?: string | URL;
  dataByUrl: Record<string, unknown>;
  importModule?: (
    specifier: string,
  ) => Promise<{
    hydrateFaceNavigation?: (
      context: FaceNavigationBootstrapContext,
    ) => void | Promise<void>;
  }>;
  nextHtml: string;
  nextUrl: string | URL;
}

export interface StrictCspNavigationExerciseResult {
  dom: JSDOM;
  fetched: string[];
  hydrated: Array<{ data: unknown; text: string | null; url: string }>;
}

const DEFAULT_URL = 'http://localhost/';
const RAW_HEAD_ALLOWED_TAGS = new Set(['link', 'meta', 'script', 'title']);

export function assertStrictCspDocument(
  html: string,
  options: StrictCspDocumentAssertionOptions = {},
): void {
  const dom = new JSDOM(html, { url: String(options.url ?? DEFAULT_URL) });
  try {
    assertStrictCspDom(dom.window.document, options);
  } finally {
    dom.window.close();
  }
}

export function assertStrictCspDom(
  doc: Document,
  options: StrictCspDocumentAssertionOptions = {},
): void {
  const allowedOrigin = new URL(
    String(
      options.allowedOrigin ?? doc.defaultView?.location.origin ?? DEFAULT_URL,
    ),
  ).origin;
  assertNoInlineHeadOrBodyTags(doc, allowedOrigin);
  assertNoRawHeadNodes(doc);
  assertNoUnsafeAttributes(doc, options.scopeSelector ?? 'html');
}

export function createStrictCspFixtureFetch(
  fixtures: Record<string, StrictCspFetchFixture | string | unknown>,
  options: { baseUrl?: string | URL } = {},
): StrictCspFixtureFetchResult {
  const baseUrl = String(options.baseUrl ?? DEFAULT_URL);
  const normalized = new Map<string, StrictCspFetchFixture>();

  for (const [key, value] of Object.entries(fixtures)) {
    const url = new URL(key, baseUrl).toString();
    if (typeof value === 'string') {
      normalized.set(url, { body: value, contentType: contentTypeForUrl(url) });
    } else if (isFetchFixture(value)) {
      normalized.set(url, value);
    } else {
      normalized.set(url, {
        body: JSON.stringify(value),
        contentType: 'application/json; charset=utf-8',
      });
    }
  }

  const requests: string[] = [];
  const fetcher = (async (input) => {
    const url = new URL(String(input), baseUrl).toString();
    requests.push(url);
    const fixture = normalized.get(url);
    if (!fixture) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return new Response(fixture.body, {
      status: fixture.status ?? 200,
      headers: {
        'content-type': fixture.contentType ?? contentTypeForUrl(url),
      },
    });
  }) as typeof fetch;

  return { fetcher, requests };
}

export async function exerciseStrictCspExternalNavigation(
  options: StrictCspNavigationExerciseOptions,
): Promise<StrictCspNavigationExerciseResult> {
  const currentUrl = String(options.currentUrl ?? DEFAULT_URL);
  const nextUrl = new URL(String(options.nextUrl), currentUrl).toString();

  assertStrictCspDocument(options.currentHtml, { url: currentUrl });
  assertStrictCspDocument(options.nextHtml, { url: nextUrl });

  const dom = new JSDOM(options.currentHtml, { url: currentUrl });
  dom.window.scrollTo = (() => {}) as typeof dom.window.scrollTo;

  const { fetcher, requests } = createStrictCspFixtureFetch(
    {
      [nextUrl]: {
        body: options.nextHtml,
        contentType: 'text/html; charset=utf-8',
      },
      ...Object.fromEntries(
        Object.entries(options.dataByUrl).map(([url, data]) => [
          url,
          {
            body: JSON.stringify(data),
            contentType: 'application/json; charset=utf-8',
          },
        ]),
      ),
    },
    { baseUrl: currentUrl },
  );

  const hydrated: Array<{ data: unknown; text: string | null; url: string }> =
    [];
  const controller = startFaceNavigation({
    document: dom.window.document,
    window: dom.window as unknown as Window,
    fetcher,
    importModule:
      options.importModule ??
      (async () => ({
        hydrateFaceNavigation: (context) => {
          hydrated.push({
            data: context.data,
            text: context.view?.textContent?.trim() ?? null,
            url: context.url.toString(),
          });
        },
      })),
  });

  try {
    await controller.navigate(nextUrl);
    assertStrictCspDom(dom.window.document);
    return { dom, fetched: requests, hydrated };
  } catch (error) {
    dom.window.close();
    throw error;
  } finally {
    controller.stop();
  }
}

export function installStrictCspBrowserGlobals(dom: JSDOM): () => void {
  const previous = new Map<PropertyKey, unknown>();
  const had = new Map<PropertyKey, boolean>();

  const setGlobal = (name: PropertyKey, value: unknown): void => {
    had.set(name, Object.prototype.hasOwnProperty.call(globalThis, name));
    previous.set(name, (globalThis as Record<PropertyKey, unknown>)[name]);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  };

  const win = dom.window;
  setGlobal('window', win);
  setGlobal('document', win.document);
  setGlobal('navigator', win.navigator);
  setGlobal('HTMLElement', win.HTMLElement);
  setGlobal('SVGElement', win.SVGElement);
  setGlobal('Element', win.Element);
  setGlobal('Node', win.Node);
  setGlobal('Text', win.Text);
  setGlobal('Comment', win.Comment);
  setGlobal('CustomEvent', win.CustomEvent);
  setGlobal('Event', win.Event);
  setGlobal('MutationObserver', win.MutationObserver);

  win.requestAnimationFrame =
    win.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0));
  win.cancelAnimationFrame =
    win.cancelAnimationFrame ?? ((id) => clearTimeout(id));
  setGlobal('requestAnimationFrame', win.requestAnimationFrame.bind(win));
  setGlobal('cancelAnimationFrame', win.cancelAnimationFrame.bind(win));

  return () => {
    for (const [name, existed] of had) {
      if (existed) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          value: previous.get(name),
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  };
}

export async function flushStrictCspBrowserTasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function assertNoRawHeadNodes(doc: Document): void {
  for (const node of Array.from(doc.head.childNodes)) {
    if (node.nodeType === doc.TEXT_NODE) {
      assert.equal(
        node.textContent?.trim() ?? '',
        '',
        `strict CSP raw head text node: ${node.textContent ?? ''}`,
      );
      continue;
    }

    assert.notEqual(
      node.nodeType,
      doc.COMMENT_NODE,
      'strict CSP raw head comment node',
    );

    if (node.nodeType === doc.ELEMENT_NODE) {
      const tagName = (node as Element).tagName.toLowerCase();
      assert.ok(
        RAW_HEAD_ALLOWED_TAGS.has(tagName),
        `strict CSP unexpected raw head element: ${(node as Element).outerHTML}`,
      );
    }
  }
}

function assertNoInlineHeadOrBodyTags(
  doc: Document,
  allowedOrigin: string,
): void {
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const src = script.getAttribute('src');
    assert.ok(src, `strict CSP inline script tag: ${script.outerHTML}`);
    assert.equal(
      script.textContent?.trim() ?? '',
      '',
      `strict CSP script body: ${script.outerHTML}`,
    );
    assertSameOriginUrl(src, allowedOrigin, doc.URL, 'strict CSP script src');
  }

  const styleTag = doc.querySelector('style');
  assert.equal(
    styleTag,
    null,
    `strict CSP inline style tag: ${styleTag?.outerHTML ?? ''}`,
  );

  for (const link of Array.from(doc.querySelectorAll('link[href]'))) {
    const href = link.getAttribute('href');
    if (href)
      assertSameOriginUrl(href, allowedOrigin, doc.URL, 'strict CSP link href');
  }
}

function assertNoUnsafeAttributes(doc: Document, scopeSelector: string): void {
  const scopes = Array.from(doc.querySelectorAll(scopeSelector));
  assert.ok(
    scopes.length > 0,
    `strict CSP validation scope not found: ${scopeSelector}`,
  );

  for (const scope of scopes) {
    const elements = [scope, ...Array.from(scope.querySelectorAll('*'))];
    for (const element of elements) {
      for (const name of element.getAttributeNames()) {
        assert.ok(
          !/^on[a-z]/i.test(name),
          `strict CSP inline event handler attribute ${name}: ${element.outerHTML}`,
        );
        assert.notEqual(
          name.toLowerCase(),
          'style',
          `strict CSP inline style attribute: ${element.outerHTML}`,
        );
      }
    }
  }
}

function assertSameOriginUrl(
  value: string,
  allowedOrigin: string,
  baseUrl: string,
  label: string,
): void {
  const url = new URL(value, baseUrl);
  assert.equal(
    url.origin,
    allowedOrigin,
    `${label} must be same-origin: ${url.toString()}`,
  );
}

function contentTypeForUrl(url: string): string {
  const pathname = new URL(url, DEFAULT_URL).pathname;
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
  if (
    pathname.endsWith('.html') ||
    pathname === '/' ||
    !pathname.includes('.')
  ) {
    return 'text/html; charset=utf-8';
  }
  return 'text/plain; charset=utf-8';
}

function isFetchFixture(value: unknown): value is StrictCspFetchFixture {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'body' in value &&
    typeof (value as StrictCspFetchFixture).body === 'string',
  );
}
