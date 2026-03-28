import type { FaceAttributes, FaceHydration } from './types.js';

export const DEFAULT_FACE_VIEW_SELECTOR = '[data-facetheory-view]';

const HYDRATION_DATA_SCRIPT_ID = '__FACETHEORY_DATA__';
const NAVIGATION_CACHE_BUST_PARAM = 'facetheory-nav';

export interface FaceNavigationSnapshot {
  url: string;
  title: string | null;
  htmlAttrs: FaceAttributes;
  bodyAttrs: FaceAttributes;
  headHtml: string;
  bodyHtml: string;
  viewHtml: string | null;
  hydration: FaceHydration | null;
}

export interface SnapshotFaceDocumentOptions {
  url?: string | URL;
  viewSelector?: string;
}

export interface ParseFaceNavigationSnapshotOptions extends SnapshotFaceDocumentOptions {
  parser?: Pick<DOMParser, 'parseFromString'>;
}

export interface FetchFaceNavigationSnapshotOptions extends ParseFaceNavigationSnapshotOptions {
  fetcher?: typeof fetch;
  requestInit?: RequestInit;
}

export interface ApplyFaceNavigationSnapshotOptions {
  document?: Document;
  syncHead?: boolean;
  viewSelector?: string;
}

export interface FaceNavigationBootstrapContext {
  data: unknown;
  document: Document;
  snapshot: FaceNavigationSnapshot;
  url: URL;
  view: Element | null;
}

export interface FaceNavigationBootstrapModule {
  hydrateFaceNavigation?: (
    context: FaceNavigationBootstrapContext,
  ) => void | Promise<void>;
}

export interface LoadFaceNavigationModuleOptions {
  document?: Document;
  importModule?: (specifier: string) => Promise<FaceNavigationBootstrapModule>;
  reloadOnMissingHook?: boolean;
  viewSelector?: string;
}

export interface StartFaceNavigationOptions
  extends Omit<FetchFaceNavigationSnapshotOptions, 'url'>,
    Pick<ApplyFaceNavigationSnapshotOptions, 'syncHead'>,
    Pick<LoadFaceNavigationModuleOptions, 'importModule' | 'reloadOnMissingHook'> {
  document?: Document;
  onError?: (
    error: unknown,
    context: { source: 'link' | 'popstate' | 'programmatic'; url: URL },
  ) => void;
  render?: (
    snapshot: FaceNavigationSnapshot,
    context: FaceNavigationBootstrapContext,
  ) => void | Promise<void>;
  scroll?: 'preserve' | 'top';
  shouldHandleUrl?: (url: URL, anchor: HTMLAnchorElement | null) => boolean;
  viewSelector?: string;
  window?: Window;
}

export interface FaceNavigationController {
  navigate: (
    url: string | URL,
    options?: { replace?: boolean },
  ) => Promise<FaceNavigationSnapshot>;
  stop: () => void;
}

export function readFaceHydrationData<T = unknown>(doc: Document = document): T | null {
  const el = doc.getElementById(HYDRATION_DATA_SCRIPT_ID);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

export function snapshotFaceDocument(
  doc: Document,
  options: SnapshotFaceDocumentOptions = {},
): FaceNavigationSnapshot {
  const viewSelector = options.viewSelector ?? DEFAULT_FACE_VIEW_SELECTOR;
  const bootstrapModule = readHydrationBootstrapModule(doc);
  const data = readFaceHydrationData(doc);
  const view = doc.querySelector(viewSelector);

  return {
    url: resolveSnapshotUrl(doc, options.url),
    title: doc.title || null,
    htmlAttrs: readAttributes(doc.documentElement),
    bodyAttrs: readAttributes(doc.body),
    headHtml: doc.head.innerHTML,
    bodyHtml: doc.body.innerHTML,
    viewHtml: view ? view.innerHTML : null,
    hydration: bootstrapModule ? { bootstrapModule, data } : null,
  };
}

export function parseFaceNavigationSnapshot(
  html: string,
  options: ParseFaceNavigationSnapshotOptions = {},
): FaceNavigationSnapshot {
  const parser = options.parser ?? (typeof DOMParser === 'function' ? new DOMParser() : null);
  if (!parser) {
    throw new Error('FaceTheory SPA helpers require DOMParser in the current environment');
  }

  const parsed = parser.parseFromString(html, 'text/html');
  return snapshotFaceDocument(parsed, options);
}

export async function fetchFaceNavigationSnapshot(
  url: string | URL,
  options: FetchFaceNavigationSnapshotOptions = {},
): Promise<FaceNavigationSnapshot> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new Error('FaceTheory SPA helpers require fetch in the current environment');
  }

  const response = await fetcher(String(url), {
    ...options.requestInit,
    headers: {
      accept: 'text/html,application/xhtml+xml',
      ...(options.requestInit?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `FaceTheory navigation fetch failed (${response.status}) for ${String(url)}`,
    );
  }

  const parseOptions: ParseFaceNavigationSnapshotOptions = {
    url: response.url || String(url),
  };
  if (options.viewSelector !== undefined) {
    parseOptions.viewSelector = options.viewSelector;
  }
  if (options.parser !== undefined) {
    parseOptions.parser = options.parser;
  }

  return parseFaceNavigationSnapshot(await response.text(), parseOptions);
}

export function applyFaceNavigationSnapshot(
  snapshot: FaceNavigationSnapshot,
  options: ApplyFaceNavigationSnapshotOptions = {},
): void {
  const doc = options.document ?? document;
  const viewSelector = options.viewSelector ?? DEFAULT_FACE_VIEW_SELECTOR;

  syncAttributes(doc.documentElement, snapshot.htmlAttrs);

  const currentView = doc.querySelector(viewSelector);
  if (currentView && snapshot.viewHtml !== null) {
    currentView.innerHTML = snapshot.viewHtml;
  } else {
    doc.body.innerHTML = snapshot.bodyHtml;
  }

  syncAttributes(doc.body, snapshot.bodyAttrs);

  if (options.syncHead !== false) {
    syncHead(doc, snapshot);
  } else if (snapshot.title !== null) {
    doc.title = snapshot.title;
  }
}

export async function loadFaceNavigationModule(
  snapshot: FaceNavigationSnapshot,
  options: LoadFaceNavigationModuleOptions = {},
): Promise<void> {
  if (!snapshot.hydration?.bootstrapModule) return;

  const doc = options.document ?? document;
  const importModule = options.importModule ?? importFaceNavigationModule;
  const context = createBootstrapContext(
    snapshot,
    doc,
    options.viewSelector ?? DEFAULT_FACE_VIEW_SELECTOR,
  );

  const initial = await importModule(snapshot.hydration.bootstrapModule);
  if (typeof initial.hydrateFaceNavigation === 'function') {
    await initial.hydrateFaceNavigation(context);
    return;
  }

  if (options.reloadOnMissingHook === false) return;

  const reloaded = await importModule(withNavigationCacheBust(snapshot.hydration.bootstrapModule));
  if (typeof reloaded.hydrateFaceNavigation === 'function') {
    await reloaded.hydrateFaceNavigation(context);
  }
}

export function startFaceNavigation(
  options: StartFaceNavigationOptions = {},
): FaceNavigationController {
  const doc = options.document ?? document;
  const win = options.window ?? doc.defaultView ?? window;
  const viewSelector = options.viewSelector ?? DEFAULT_FACE_VIEW_SELECTOR;

  const reportError = (
    error: unknown,
    source: 'link' | 'popstate' | 'programmatic',
    url: URL,
  ): void => {
    if (options.onError) {
      options.onError(error, { source, url });
      return;
    }
    console.error('FaceTheory SPA navigation failed', error);
  };

  const navigateInternal = async (
    urlInput: string | URL,
    navigateOptions: {
      replace?: boolean;
      source: 'link' | 'popstate' | 'programmatic';
      updateHistory: boolean;
    },
  ): Promise<FaceNavigationSnapshot> => {
    const url = new URL(String(urlInput), win.location.href);
    const winWithParser = win as Window & { DOMParser?: typeof DOMParser };
    const fetchOptions: FetchFaceNavigationSnapshotOptions = { viewSelector };
    if (options.fetcher !== undefined) fetchOptions.fetcher = options.fetcher;
    if (options.requestInit !== undefined) fetchOptions.requestInit = options.requestInit;
    if (options.parser !== undefined) {
      fetchOptions.parser = options.parser;
    } else if (typeof winWithParser.DOMParser === 'function') {
      fetchOptions.parser = new winWithParser.DOMParser();
    }

    const snapshot = await fetchFaceNavigationSnapshot(url, fetchOptions);

    if (options.render) {
      await options.render(
        snapshot,
        createBootstrapContext(snapshot, doc, viewSelector),
      );
    } else {
      const applyOptions: ApplyFaceNavigationSnapshotOptions = {
        document: doc,
        viewSelector,
      };
      if (options.syncHead !== undefined) applyOptions.syncHead = options.syncHead;
      applyFaceNavigationSnapshot(snapshot, applyOptions);

      const loadOptions: LoadFaceNavigationModuleOptions = {
        document: doc,
        viewSelector,
      };
      if (options.importModule !== undefined) loadOptions.importModule = options.importModule;
      if (options.reloadOnMissingHook !== undefined) {
        loadOptions.reloadOnMissingHook = options.reloadOnMissingHook;
      }
      await loadFaceNavigationModule(snapshot, loadOptions);
    }

    if (navigateOptions.updateHistory) {
      if (navigateOptions.replace) {
        win.history.replaceState({}, '', url);
      } else {
        win.history.pushState({}, '', url);
      }
    }

    if (options.scroll !== 'preserve' && navigateOptions.source !== 'popstate') {
      win.scrollTo?.(0, 0);
    }

    return snapshot;
  };

  const handleClick = (event: MouseEvent): void => {
    const anchor = findAnchor(event.target);
    if (!anchor) return;

    const url = new URL(anchor.href, win.location.href);
    if (!shouldHandleAnchorClick(event, anchor, url, win, options.shouldHandleUrl)) return;

    event.preventDefault();
    void navigateInternal(url, {
      source: 'link',
      updateHistory: true,
    }).catch((error) => {
      reportError(error, 'link', url);
    });
  };

  const handlePopState = (): void => {
    const url = new URL(win.location.href);
    void navigateInternal(url, {
      replace: true,
      source: 'popstate',
      updateHistory: false,
    }).catch((error) => {
      reportError(error, 'popstate', url);
    });
  };

  doc.addEventListener('click', handleClick);
  win.addEventListener('popstate', handlePopState);

  return {
    navigate: async (url, navigateOptions = {}) =>
      navigateInternal(
        url,
        navigateOptions.replace === undefined
          ? {
              source: 'programmatic',
              updateHistory: true,
            }
          : {
              replace: navigateOptions.replace,
              source: 'programmatic',
              updateHistory: true,
            },
      ).catch((error) => {
        const resolvedUrl = new URL(String(url), win.location.href);
        reportError(error, 'programmatic', resolvedUrl);
        throw error;
      }),
    stop: () => {
      doc.removeEventListener('click', handleClick);
      win.removeEventListener('popstate', handlePopState);
    },
  };
}

function resolveSnapshotUrl(doc: Document, url: string | URL | undefined): string {
  if (url !== undefined) {
    return new URL(String(url), doc.defaultView?.location.href ?? 'http://localhost/').toString();
  }

  return doc.URL || doc.defaultView?.location.href || '';
}

function readAttributes(element: Element): FaceAttributes {
  const out: FaceAttributes = {};
  for (const name of element.getAttributeNames()) {
    out[name] = element.getAttribute(name) ?? '';
  }
  return out;
}

function syncAttributes(element: Element, nextAttrs: FaceAttributes): void {
  for (const name of element.getAttributeNames()) {
    if (!(name in nextAttrs)) {
      element.removeAttribute(name);
    }
  }

  for (const [name, value] of Object.entries(nextAttrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (value === true) {
      element.setAttribute(name, '');
      continue;
    }
    element.setAttribute(name, String(value));
  }
}

function readHydrationBootstrapModule(doc: Document): string | null {
  const dataScript = doc.getElementById(HYDRATION_DATA_SCRIPT_ID);
  if (!dataScript) return null;

  let current = dataScript.nextElementSibling;
  while (current) {
    if (
      current.tagName.toLowerCase() === 'script' &&
      String(current.getAttribute('type') ?? '').trim().toLowerCase() === 'module'
    ) {
      const src = current.getAttribute('src');
      if (src) return src;
    }
    current = current.nextElementSibling;
  }

  return null;
}

function syncHead(doc: Document, snapshot: FaceNavigationSnapshot): void {
  const template = doc.createElement('template');
  template.innerHTML = snapshot.headHtml;

  doc.head.replaceChildren();
  for (const node of Array.from(template.content.childNodes)) {
    const imported = importHeadNode(doc, node);
    if (imported) doc.head.appendChild(imported);
  }

  if (snapshot.title === null) {
    doc.title = '';
  }
}

function importHeadNode(doc: Document, node: Node): Node | null {
  if (node.nodeType !== 1) {
    return doc.importNode(node, true);
  }

  const element = node as Element;
  if (element.tagName.toLowerCase() !== 'script') {
    return doc.importNode(element, true);
  }

  if (!isInertHeadScript(element)) return null;

  const script = doc.createElement('script');
  for (const name of element.getAttributeNames()) {
    const value = element.getAttribute(name);
    if (value === null) continue;
    script.setAttribute(name, value);
  }
  script.textContent = element.textContent ?? '';
  return script;
}

function isInertHeadScript(element: Element): boolean {
  if (element.id === HYDRATION_DATA_SCRIPT_ID) return true;
  const type = String(element.getAttribute('type') ?? '').trim().toLowerCase();
  return type === 'application/json' || type.endsWith('+json');
}

function createBootstrapContext(
  snapshot: FaceNavigationSnapshot,
  doc: Document,
  viewSelector: string,
): FaceNavigationBootstrapContext {
  return {
    data: snapshot.hydration?.data ?? null,
    document: doc,
    snapshot,
    url: new URL(snapshot.url, doc.defaultView?.location.href ?? 'http://localhost/'),
    view: doc.querySelector(viewSelector),
  };
}

async function importFaceNavigationModule(
  specifier: string,
): Promise<FaceNavigationBootstrapModule> {
  return import(/* @vite-ignore */ specifier) as Promise<FaceNavigationBootstrapModule>;
}

function withNavigationCacheBust(specifier: string): string {
  const delimiter = specifier.includes('?') ? '&' : '?';
  return `${specifier}${delimiter}${NAVIGATION_CACHE_BUST_PARAM}=${Date.now()}`;
}

function shouldHandleAnchorClick(
  event: MouseEvent,
  anchor: HTMLAnchorElement,
  url: URL,
  win: Window,
  shouldHandleUrl: ((url: URL, anchor: HTMLAnchorElement | null) => boolean) | undefined,
): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.getAttribute('rel')?.split(/\s+/).includes('external')) return false;
  if (anchor.hasAttribute('data-facetheory-reload')) return false;
  if (url.origin !== win.location.origin) return false;
  if (url.pathname === win.location.pathname && url.search === win.location.search && url.hash) {
    return false;
  }
  if (shouldHandleUrl && !shouldHandleUrl(url, anchor)) return false;
  return true;
}

function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  let current = target as (Node & Partial<Element> & { href?: string }) | null;
  while (current) {
    if (
      typeof current === 'object' &&
      current !== null &&
      typeof current.tagName === 'string' &&
      current.tagName.toLowerCase() === 'a' &&
      typeof current.href === 'string' &&
      current.href
    ) {
      return current as HTMLAnchorElement;
    }
    current = (current.parentNode ?? null) as (Node & Partial<Element> & { href?: string }) | null;
  }

  return null;
}
