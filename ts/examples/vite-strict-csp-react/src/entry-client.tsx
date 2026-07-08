import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';

import { loadFaceHydrationData } from '@theory-cloud/facetheory/client';
import type { FaceNavigationBootstrapContext } from '@theory-cloud/facetheory/spa';

import { App } from './App.js';
import logoUrl from './logo.svg';
import './styles.css';

interface StrictCspReactExampleData {
  page?: 'home' | 'next';
  message?: string;
  detail?: string;
}

declare global {
  interface Window {
    __FACETHEORY_STRICT_CSP_REACT_DATA__?: unknown;
    __FACETHEORY_STRICT_CSP_REACT_HYDRATED__?: number;
    __FACETHEORY_STRICT_CSP_REACT_NAVIGATED__?: number;
  }
}

function propsFromData(data: StrictCspReactExampleData) {
  return {
    page: data.page ?? 'home',
    message: data.message ?? 'from client fallback',
    detail: data.detail ?? 'External hydration data was unavailable.',
    logoUrl,
  };
}

function recordHydration(
  doc: Document,
  data: StrictCspReactExampleData,
  navigation: boolean,
): void {
  const win = doc.defaultView ?? window;
  win.__FACETHEORY_STRICT_CSP_REACT_DATA__ = data;
  win.__FACETHEORY_STRICT_CSP_REACT_HYDRATED__ =
    (win.__FACETHEORY_STRICT_CSP_REACT_HYDRATED__ ?? 0) + 1;
  if (navigation) {
    win.__FACETHEORY_STRICT_CSP_REACT_NAVIGATED__ =
      (win.__FACETHEORY_STRICT_CSP_REACT_NAVIGATED__ ?? 0) + 1;
  }
}

export async function hydrateStrictCspReactExample(
  options: {
    document?: Document;
    fetcher?: typeof fetch;
    navigation?: boolean;
    target?: Element;
  } = {},
): Promise<StrictCspReactExampleData> {
  const doc = options.document ?? document;
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const data = await loadFaceHydrationData<StrictCspReactExampleData>({
    document: doc,
    fetcher,
  });

  if (data === null) {
    throw new Error('missing FaceTheory strict CSP hydration data link');
  }

  const target = options.target ?? doc.getElementById('root');
  if (!target) {
    throw new Error('missing FaceTheory strict CSP React mount target #root');
  }

  recordHydration(doc, data, options.navigation === true);
  hydrateRoot(target, React.createElement(App, propsFromData(data)));
  return data;
}

export async function hydrateFaceNavigation(
  context: FaceNavigationBootstrapContext,
): Promise<void> {
  const doc = context.document;
  const data = (context.data ?? {}) as StrictCspReactExampleData;
  recordHydration(doc, data, true);
}

if (typeof document !== 'undefined') {
  void hydrateStrictCspReactExample().catch((error) => {
    console.error('FaceTheory strict CSP React hydration failed', error);
  });
}
