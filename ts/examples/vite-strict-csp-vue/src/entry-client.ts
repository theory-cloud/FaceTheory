import { createSSRApp, h } from 'vue';

import { loadFaceHydrationData } from '@theory-cloud/facetheory/client';
import type { FaceNavigationBootstrapContext } from '@theory-cloud/facetheory/spa';

import { App } from './app.js';
import logoUrl from './logo.svg';
import './styles.css';

interface StrictCspVueExampleData {
  page?: 'home' | 'next';
  message?: string;
  detail?: string;
}

declare global {
  interface Window {
    __FACETHEORY_STRICT_CSP_VUE_DATA__?: unknown;
    __FACETHEORY_STRICT_CSP_VUE_HYDRATED__?: number;
    __FACETHEORY_STRICT_CSP_VUE_NAVIGATED__?: number;
  }
}

function propsFromData(data: StrictCspVueExampleData) {
  return {
    page: data.page ?? 'home',
    message: data.message ?? 'from client fallback',
    detail: data.detail ?? 'External hydration data was unavailable.',
    logoUrl,
  };
}

function recordHydration(
  doc: Document,
  data: StrictCspVueExampleData,
  navigation: boolean,
): void {
  const win = doc.defaultView ?? window;
  win.__FACETHEORY_STRICT_CSP_VUE_DATA__ = data;
  win.__FACETHEORY_STRICT_CSP_VUE_HYDRATED__ =
    (win.__FACETHEORY_STRICT_CSP_VUE_HYDRATED__ ?? 0) + 1;
  if (navigation) {
    win.__FACETHEORY_STRICT_CSP_VUE_NAVIGATED__ =
      (win.__FACETHEORY_STRICT_CSP_VUE_NAVIGATED__ ?? 0) + 1;
  }
}

export async function hydrateStrictCspVueExample(
  options: {
    document?: Document;
    fetcher?: typeof fetch;
    navigation?: boolean;
    target?: Element;
  } = {},
): Promise<StrictCspVueExampleData> {
  const doc = options.document ?? document;
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const data = await loadFaceHydrationData<StrictCspVueExampleData>({
    document: doc,
    fetcher,
  });

  if (data === null) {
    throw new Error('missing FaceTheory strict CSP hydration data link');
  }

  const target = options.target ?? doc.getElementById('root');
  if (!target) {
    throw new Error('missing FaceTheory strict CSP Vue mount target #root');
  }

  recordHydration(doc, data, options.navigation === true);
  const props = propsFromData(data);
  createSSRApp({ render: () => h(App, props) }).mount(target);
  return data;
}

export async function hydrateFaceNavigation(
  context: FaceNavigationBootstrapContext,
): Promise<void> {
  const doc = context.document;
  const data = (context.data ?? {}) as StrictCspVueExampleData;
  recordHydration(doc, data, true);
}

if (typeof document !== 'undefined') {
  void hydrateStrictCspVueExample().catch((error) => {
    console.error('FaceTheory strict CSP Vue hydration failed', error);
  });
}
