import { hydrate } from 'svelte';

import { loadFaceHydrationData } from '@theory-cloud/facetheory/client';
import type { FaceNavigationBootstrapContext } from '@theory-cloud/facetheory/spa';

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
    __FACETHEORY_STRICT_CSP_SVELTE_DATA__?: unknown;
    __FACETHEORY_STRICT_CSP_SVELTE_HYDRATED__?: number;
    __FACETHEORY_STRICT_CSP_SVELTE_NAVIGATED__?: number;
  }
}

async function loadExternalHydrationData(
  doc: Document,
  fetcher: typeof fetch,
): Promise<StrictCspSvelteExampleData> {
  const data = await loadFaceHydrationData<StrictCspSvelteExampleData>({
    document: doc,
    fetcher,
  });

  if (data === null) {
    throw new Error('missing FaceTheory strict CSP hydration data link');
  }

  return data;
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
