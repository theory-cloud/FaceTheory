import assert from 'node:assert/strict';
import { inspect } from 'node:util';

import { createFaceApp, type FaceAppOptions } from '../app.js';
import { validateStrictCspDocument } from '../security.js';
import type {
  CookieMap,
  FaceBody,
  FaceHeaders,
  FaceModule,
  FaceRequest,
  FaceResponse,
  Query,
} from '../types.js';
import {
  canonicalizeHeaders,
  cloneCookies,
  cloneQuery,
  normalizePath,
  parseQueryString,
} from '../types.js';

export interface BuildFaceRequestOptions {
  method?: string;
  path?: string;
  url?: string | URL;
  query?: Query;
  headers?: FaceTestHeaders;
  cookies?: CookieMap;
  body?: string | Uint8Array;
  isBase64?: boolean;
  cspNonce?: string | null;
  requestId?: string;
}

export type FaceTestHeaders = Record<
  string,
  string | number | boolean | readonly (string | number | boolean)[]
>;

export interface RenderFaceOptions extends BuildFaceRequestOptions {
  request?: FaceRequest | BuildFaceRequestOptions;
  app?: Omit<FaceAppOptions, 'faces'>;
}

export interface RenderedFace {
  request: FaceRequest;
  response: FaceResponse;
  body: Uint8Array;
  html: string;
  text: string;
  status: number;
  headers: FaceHeaders;
}

export interface FaceAppLike {
  handle: (request: FaceRequest) => Promise<FaceResponse> | FaceResponse;
}

export type RenderFaceTarget = FaceModule | readonly FaceModule[] | FaceAppLike;

export interface HydrationEquivalentConsoleMessage {
  level: 'error' | 'warn';
  args: readonly unknown[];
  text: string;
}

export type FaceTestWindow = Window &
  Record<PropertyKey, unknown> & {
    cancelAnimationFrame: (handle: number) => void;
    close?: () => void;
    console: Pick<Console, 'error' | 'warn'>;
    document: Document;
    getComputedStyle: typeof getComputedStyle;
    location: Location;
    navigator: Navigator;
    requestAnimationFrame: (callback: FrameRequestCallback) => number;
  };

export interface HydrationEquivalentContext {
  window: FaceTestWindow;
  document: Document;
  container: Element;
  htmlBefore: string;
}

export interface HydrationEquivalentResult {
  htmlBefore: string;
  htmlAfter: string;
  consoleMessages: HydrationEquivalentConsoleMessage[];
}

export interface HydrationEquivalentOptions {
  html: string;
  hydrate: (context: HydrationEquivalentContext) => Promise<void> | void;
  selector?: string;
  url?: string | URL;
  fetcher?: typeof fetch;
  failOnUnexpectedFetch?: boolean;
  flush?: (context: HydrationEquivalentContext) => Promise<void> | void;
  normalizeHtml?: (html: string) => string;
  allowConsoleMessage?: (message: HydrationEquivalentConsoleMessage) => boolean;
}

export interface StrictCspDocumentAssertionOptions {
  allowedOrigin?: string | URL;
  cspNonce?: string | null;
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

export interface InstallFaceTestBrowserGlobalsOptions {
  fetcher?: typeof fetch;
  failOnUnexpectedFetch?: boolean;
}

interface TestDom {
  window: FaceTestWindow;
  close: () => void;
}

interface JsdomModule {
  JSDOM: new (
    html?: string,
    options?: { pretendToBeVisual?: boolean; url?: string },
  ) => {
    window: Window & { close: () => void };
  };
}

const DEFAULT_TEST_URL = 'http://localhost/';
const DEFAULT_TEST_REQUEST_ID = 'facetheory-test-request';
const REQUEST_ID_HEADER = 'x-request-id';
const RAW_HEAD_ALLOWED_TAGS = new Set(['link', 'meta', 'script', 'title']);

export function buildFaceRequest(
  options: BuildFaceRequestOptions = {},
): FaceRequest {
  const requestUrl = resolveBuildFaceRequestUrl(options);
  const headers = canonicalizeTestHeaders(options.headers);
  if (!hasFirstHeader(headers, REQUEST_ID_HEADER)) {
    headers[REQUEST_ID_HEADER] = [
      normalizeRequestId(options.requestId ?? DEFAULT_TEST_REQUEST_ID),
    ];
  }

  const request: FaceRequest = {
    method: normalizeTestMethod(options.method),
    path: normalizePath(requestUrl.pathname),
    query:
      options.query !== undefined
        ? cloneQuery(options.query)
        : parseQueryString(requestUrl.search),
    headers,
  };

  if (options.cookies !== undefined)
    request.cookies = cloneCookies(options.cookies);
  if (options.body !== undefined) request.body = toRequestBody(options.body);
  if (options.isBase64 !== undefined)
    request.isBase64 = Boolean(options.isBase64);
  if (options.cspNonce !== undefined) request.cspNonce = options.cspNonce;

  return request;
}

export async function renderFace(
  target: RenderFaceTarget,
  options: RenderFaceOptions = {},
): Promise<RenderedFace> {
  const request = buildFaceRequest(requestOptionsForRender(options));
  const app = resolveFaceAppLike(target, options);
  const response = await app.handle(request);
  const body = await collectFaceBody(response.body);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(body);
  const collectedResponse: FaceResponse = {
    ...response,
    body,
  };

  return {
    request,
    response: collectedResponse,
    body,
    html: text,
    text,
    status: response.status,
    headers: response.headers,
  };
}

export async function assertHydrationEquivalent(
  options: HydrationEquivalentOptions,
): Promise<HydrationEquivalentResult> {
  const dom = await createTestDom(
    options.html,
    String(options.url ?? DEFAULT_TEST_URL),
  );
  const restoreGlobals = installFaceTestBrowserGlobals(dom.window, {
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    failOnUnexpectedFetch: options.failOnUnexpectedFetch ?? true,
  });
  const consoleCapture = captureHydrationConsole(dom.window);

  try {
    const doc = dom.window.document;
    const container = resolveHydrationContainer(
      doc,
      options.selector ?? 'body',
    );
    const normalize = options.normalizeHtml ?? normalizeComparableHtml;
    const htmlBefore = normalize(container.innerHTML);
    const context: HydrationEquivalentContext = {
      window: dom.window,
      document: doc,
      container,
      htmlBefore,
    };

    await options.hydrate(context);
    if (options.flush) {
      await options.flush(context);
    } else {
      await flushFaceTestBrowserTasks();
    }

    const htmlAfter = normalize(container.innerHTML);
    const consoleMessages = consoleCapture.messages();
    const unexpectedHydrationMessages = consoleMessages.filter(
      (message) =>
        isHydrationConsoleMessage(message) &&
        !(options.allowConsoleMessage?.(message) ?? false),
    );

    assert.equal(
      unexpectedHydrationMessages.length,
      0,
      formatHydrationConsoleFailure(unexpectedHydrationMessages),
    );
    assert.equal(
      htmlAfter,
      htmlBefore,
      formatHydrationDomFailure(htmlBefore, htmlAfter),
    );

    return { htmlBefore, htmlAfter, consoleMessages };
  } finally {
    consoleCapture.restore();
    restoreGlobals();
    dom.close();
  }
}

export async function assertStrictCspDocument(
  html: string,
  options: StrictCspDocumentAssertionOptions = {},
): Promise<void> {
  validateStrictCspDocument(String(html), {
    cspNonce: options.cspNonce ?? null,
    policy: { inlineScripts: false, inlineStyles: false, rawHead: false },
  });

  const dom = await createTestDom(
    String(html),
    String(options.url ?? DEFAULT_TEST_URL),
  );
  try {
    assertStrictCspDom(dom.window.document, options);
  } finally {
    dom.close();
  }
}

export function assertStrictCspDom(
  doc: Document,
  options: StrictCspDocumentAssertionOptions = {},
): void {
  const allowedOrigin = new URL(
    String(
      options.allowedOrigin ??
        doc.defaultView?.location.origin ??
        DEFAULT_TEST_URL,
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
  const baseUrl = String(options.baseUrl ?? DEFAULT_TEST_URL);
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

export function installFaceTestBrowserGlobals(
  win: FaceTestWindow,
  options: InstallFaceTestBrowserGlobalsOptions = {},
): () => void {
  const previous = new Map<PropertyKey, unknown>();
  const had = new Map<PropertyKey, boolean>();
  const winRecord = win as FaceTestWindow & Record<PropertyKey, unknown>;

  const setGlobal = (name: PropertyKey, value: unknown): void => {
    had.set(name, Object.prototype.hasOwnProperty.call(globalThis, name));
    previous.set(name, (globalThis as Record<PropertyKey, unknown>)[name]);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  };

  installWindowPolyfills(win);

  setGlobal('window', win);
  setGlobal('document', win.document);
  setGlobal('navigator', win.navigator);
  setGlobal('HTMLElement', winRecord.HTMLElement);
  setGlobal('SVGElement', winRecord.SVGElement);
  setGlobal('Element', winRecord.Element);
  setGlobal('Node', winRecord.Node);
  setGlobal('Text', winRecord.Text);
  setGlobal('Comment', winRecord.Comment);
  setGlobal('CustomEvent', winRecord.CustomEvent);
  setGlobal('Event', winRecord.Event);
  setGlobal('MutationObserver', winRecord.MutationObserver);
  setGlobal('getComputedStyle', win.getComputedStyle.bind(win));
  if ('ResizeObserver' in win) {
    setGlobal('ResizeObserver', winRecord.ResizeObserver);
  }
  setGlobal('requestAnimationFrame', win.requestAnimationFrame.bind(win));
  setGlobal('cancelAnimationFrame', win.cancelAnimationFrame.bind(win));

  if (options.fetcher) {
    setGlobal('fetch', options.fetcher);
  } else if (options.failOnUnexpectedFetch) {
    setGlobal('fetch', unexpectedHydrationFetch);
  }

  return () => {
    for (const [name, existed] of had) {
      if (existed) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          value: previous.get(name),
          writable: true,
        });
      } else {
        Reflect.deleteProperty(
          globalThis as Record<PropertyKey, unknown>,
          name,
        );
      }
    }
  };
}

export async function flushFaceTestBrowserTasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createTestDom(html: string, url: string): Promise<TestDom> {
  let jsdom: JsdomModule;
  try {
    jsdom = (await import('jsdom')) as unknown as JsdomModule;
  } catch (error) {
    throw new Error(
      'FaceTheory testing helpers require jsdom. Install jsdom in the consumer test workspace before using @theory-cloud/facetheory/testing DOM helpers.',
      { cause: error },
    );
  }

  const dom = new jsdom.JSDOM(html, { pretendToBeVisual: true, url });
  const win = dom.window as FaceTestWindow & { close: () => void };
  return {
    window: win,
    close: () => win.close(),
  };
}

function resolveBuildFaceRequestUrl(options: BuildFaceRequestOptions): URL {
  const raw = String(options.url ?? options.path ?? '/');
  return new URL(raw, DEFAULT_TEST_URL);
}

function normalizeTestMethod(method: string | undefined): string {
  const normalized = String(method ?? 'GET')
    .trim()
    .toUpperCase();
  return normalized || 'GET';
}

function normalizeRequestId(value: string): string {
  const normalized = String(value ?? '').trim();
  return normalized || DEFAULT_TEST_REQUEST_ID;
}

function canonicalizeTestHeaders(
  headers: FaceTestHeaders | undefined,
): FaceHeaders {
  const converted: FaceHeaders = {};
  for (const [name, rawValues] of Object.entries(headers ?? {})) {
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    converted[name] = values.map((value) => String(value));
  }
  return canonicalizeHeaders(converted);
}

function hasFirstHeader(headers: FaceHeaders, name: string): boolean {
  return String(headers[name]?.[0] ?? '').trim() !== '';
}

function toRequestBody(body: string | Uint8Array): Uint8Array {
  return body instanceof Uint8Array
    ? Uint8Array.from(body)
    : new TextEncoder().encode(body);
}

function requestOptionsForRender(
  options: RenderFaceOptions,
): FaceRequest | BuildFaceRequestOptions {
  return options.request ?? options;
}

function resolveFaceAppLike(
  target: RenderFaceTarget,
  options: RenderFaceOptions,
): FaceAppLike {
  if (
    isFaceAppLike(target) &&
    !isFaceModule(target) &&
    !Array.isArray(target)
  ) {
    return target;
  }

  const faces = Array.isArray(target) ? [...target] : [target];
  return createFaceApp({
    ...(options.app ?? {}),
    faces,
  });
}

function isFaceAppLike(value: unknown): value is FaceAppLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { handle?: unknown }).handle === 'function'
  );
}

function isFaceModule(value: unknown): value is FaceModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { render?: unknown }).render === 'function' &&
    typeof (value as { route?: unknown }).route === 'string' &&
    typeof (value as { mode?: unknown }).mode === 'string'
  );
}

async function collectFaceBody(body: FaceBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return Uint8Array.from(body);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    const normalized =
      chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    chunks.push(normalized);
    total += normalized.byteLength;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function resolveHydrationContainer(doc: Document, selector: string): Element {
  const container = doc.querySelector(selector);
  assert.ok(
    container,
    `FaceTheory hydration test selector not found: ${selector}`,
  );
  return container;
}

function normalizeComparableHtml(html: string): string {
  return html.trim();
}

function captureHydrationConsole(win: FaceTestWindow): {
  messages: () => HydrationEquivalentConsoleMessage[];
  restore: () => void;
} {
  const messages: HydrationEquivalentConsoleMessage[] = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalWindowConsoleError = win.console.error;
  const originalWindowConsoleWarn = win.console.warn;

  const record =
    (level: 'error' | 'warn') =>
    (...args: unknown[]): void => {
      messages.push({ level, args, text: formatConsoleArgs(args) });
    };

  console.error = record('error');
  console.warn = record('warn');
  win.console.error = record('error');
  win.console.warn = record('warn');

  return {
    messages: () => [...messages],
    restore: () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      win.console.error = originalWindowConsoleError;
      win.console.warn = originalWindowConsoleWarn;
    },
  };
}

function formatConsoleArgs(args: readonly unknown[]): string {
  return args.map((arg) => inspect(arg, { depth: 5 })).join(' ');
}

function isHydrationConsoleMessage(
  message: HydrationEquivalentConsoleMessage,
): boolean {
  return /hydrat|server-rendered html|server rendered html|expected server html|text content did not match|did not match/i.test(
    message.text,
  );
}

function formatHydrationConsoleFailure(
  messages: readonly HydrationEquivalentConsoleMessage[],
): string {
  if (messages.length === 0)
    return 'FaceTheory hydration emitted no mismatch warnings';
  return [
    'FaceTheory hydration emitted framework mismatch warnings:',
    ...messages.map((message) => `- ${message.level}: ${message.text}`),
  ].join('\n');
}

function formatHydrationDomFailure(before: string, after: string): string {
  return [
    'FaceTheory hydration changed the tested DOM subtree.',
    'Server HTML:',
    before,
    'Client HTML:',
    after,
  ].join('\n');
}

function installWindowPolyfills(win: FaceTestWindow): void {
  const winRecord = win as FaceTestWindow & Record<PropertyKey, unknown>;
  const originalGetComputedStyle = win.getComputedStyle.bind(win);
  win.getComputedStyle = ((elt: Element) =>
    originalGetComputedStyle(elt)) as typeof win.getComputedStyle;

  if (typeof win.matchMedia !== 'function') {
    winRecord.matchMedia = () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
  }

  if (!('ResizeObserver' in win)) {
    winRecord.ResizeObserver = class FaceTheoryTestResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }

  if (typeof win.requestAnimationFrame !== 'function') {
    let nextFrameId = 1;
    const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();
    winRecord.requestAnimationFrame = (
      callback: FrameRequestCallback,
    ): number => {
      const id = nextFrameId++;
      const timer = setTimeout(() => {
        frameTimers.delete(id);
        callback(Date.now());
      }, 0);
      frameTimers.set(id, timer);
      return id;
    };
    winRecord.cancelAnimationFrame = (id: number): void => {
      const timer = frameTimers.get(id);
      if (timer) clearTimeout(timer);
      frameTimers.delete(id);
    };
  }
}

function unexpectedHydrationFetch(input: RequestInfo | URL): Promise<Response> {
  return Promise.reject(
    new Error(
      `FaceTheory hydration test attempted an unexpected fetch for ${String(input)}`,
    ),
  );
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
  const pathname = new URL(url, DEFAULT_TEST_URL).pathname;
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
