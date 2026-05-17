import { hydrate } from 'svelte';

import type { FaceNavigationBootstrapContext } from '../../../src/spa.js';

import App from './App.svelte';
import logoUrl from './logo.svg';
import './styles.css';

interface StrictCspSvelteExampleData {
  page?: string;
  message?: string;
  detail?: string;
}

declare global {
  interface Window {
    __FACETHEORY_STRICT_CSP_SVELTE_DATA__?: StrictCspSvelteExampleData;
    __FACETHEORY_STRICT_CSP_SVELTE_HYDRATED__?: number;
    __FACETHEORY_STRICT_CSP_SVELTE_NAVIGATED__?: number;
  }
}

function dataUrlFromDocument(doc: Document): string {
  const marker = doc.getElementById('__FACETHEORY_DATA_URL__');
  if (marker?.tagName.toLowerCase() === 'link') {
    const href = marker.getAttribute('href');
    if (href) return href;
  }

  const relMarker = doc.querySelector('link[rel="facetheory-hydration"]');
  const href = relMarker?.getAttribute('href');
  if (href) return href;

  throw new Error('missing FaceTheory strict CSP hydration data link');
}

async function loadExternalHydrationData(
  doc: Document,
  fetcher: typeof fetch,
): Promise<StrictCspSvelteExampleData> {
  const win = doc.defaultView ?? window;
  const dataUrl = new URL(dataUrlFromDocument(doc), win.location.href);
  if (dataUrl.origin !== win.location.origin) {
    throw new Error('strict CSP hydration data must be same-origin');
  }

  const response = await fetcher(dataUrl.toString(), {
    headers: { accept: 'application/json' },
  });
  const responseUrl = response.url
    ? new URL(response.url, win.location.href)
    : dataUrl;
  if (responseUrl.origin !== win.location.origin) {
    throw new Error('strict CSP hydration data response must stay same-origin');
  }
  if (!response.ok) {
    throw new Error(`strict CSP hydration data failed (${response.status})`);
  }

  return (await response.json()) as StrictCspSvelteExampleData;
}

function propsFromData(data: StrictCspSvelteExampleData) {
  return {
    page: data.page ?? 'home',
    message: data.message ?? 'from client fallback',
    detail: data.detail ?? 'External hydration data was unavailable.',
    logoUrl,
  };
}

function recordHydration(
  doc: Document,
  data: StrictCspSvelteExampleData,
  navigation: boolean,
): void {
  const win = doc.defaultView ?? window;
  win.__FACETHEORY_STRICT_CSP_SVELTE_DATA__ = data;
  win.__FACETHEORY_STRICT_CSP_SVELTE_HYDRATED__ =
    (win.__FACETHEORY_STRICT_CSP_SVELTE_HYDRATED__ ?? 0) + 1;
  if (navigation) {
    win.__FACETHEORY_STRICT_CSP_SVELTE_NAVIGATED__ =
      (win.__FACETHEORY_STRICT_CSP_SVELTE_NAVIGATED__ ?? 0) + 1;
  }
}

export async function hydrateStrictCspSvelteExample(
  options: {
    document?: Document;
    fetcher?: typeof fetch;
    navigation?: boolean;
    target?: Element;
  } = {},
): Promise<StrictCspSvelteExampleData> {
  const doc = options.document ?? document;
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const data = await loadExternalHydrationData(doc, fetcher);
  const target = options.target ?? doc.body;

  recordHydration(doc, data, options.navigation === true);
  hydrate(App, {
    target,
    props: propsFromData(data),
  });
  return data;
}

export async function hydrateFaceNavigation(
  context: FaceNavigationBootstrapContext,
): Promise<void> {
  const doc = context.document;
  const data = (context.data ?? {}) as StrictCspSvelteExampleData;
  recordHydration(doc, data, true);
}

if (typeof document !== 'undefined') {
  void hydrateStrictCspSvelteExample().catch((error) => {
    console.error('FaceTheory strict CSP Svelte hydration failed', error);
  });
}
