import { loadFaceHydrationData } from '@theory-cloud/facetheory/client';
import {
  startNavigationPending,
  type NavigationPendingController,
} from '@theory-cloud/facetheory/navigation-pending';
import {
  startFaceNavigation,
  type FaceNavigationBootstrapContext,
  type FaceNavigationController,
} from '@theory-cloud/facetheory/spa';

import type { SpaPageData } from './faces.js';

declare global {
  interface Window {
    __FACETHEORY_SPA_DATA__?: unknown;
    __FACETHEORY_SPA_HYDRATED__?: number;
    __FACETHEORY_SPA_NAVIGATED__?: number;
  }
}

// `startNavigationPending` shows the indicator on link click but only auto-clears
// on MPA lifecycle events; for same-document SPA navigation the consumer clears it
// when navigation completes. This module-shared handle lets the per-Face
// `hydrateFaceNavigation` completion hook clear the indicator the wiring created.
let activePending: NavigationPendingController | null = null;

function applyHydration(
  doc: Document,
  data: Partial<SpaPageData>,
  navigation: boolean,
): void {
  const view = doc.querySelector('[data-facetheory-view]');
  const source = view?.querySelector('[data-hydration-source]');
  if (source) {
    source.textContent = navigation ? 'client-navigated' : 'client-hydrated';
  }
  if (typeof data.cartCount === 'number') {
    const cart = doc.querySelector('[data-cart-count]');
    if (cart) cart.textContent = String(data.cartCount);
  }

  const win = doc.defaultView ?? window;
  win.__FACETHEORY_SPA_DATA__ = data;
  win.__FACETHEORY_SPA_HYDRATED__ = (win.__FACETHEORY_SPA_HYDRATED__ ?? 0) + 1;
  if (navigation) {
    win.__FACETHEORY_SPA_NAVIGATED__ =
      (win.__FACETHEORY_SPA_NAVIGATED__ ?? 0) + 1;
  }
}

// Per-Face bootstrap hook. `startFaceNavigation` calls it after swapping the view
// with `context.data` loaded from the navigated Face's sidecar.
export async function hydrateFaceNavigation(
  context: FaceNavigationBootstrapContext,
): Promise<void> {
  applyHydration(context.document, (context.data ?? {}) as Partial<SpaPageData>, true);
  activePending?.clear();
}

// Initial-load hydration: read the current Face's sidecar link and load its data.
export async function hydrateSpaNavigationInitial(
  options: { document?: Document; fetcher?: typeof fetch } = {},
): Promise<SpaPageData | null> {
  const doc = options.document ?? document;
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const data = await loadFaceHydrationData<SpaPageData>({
    document: doc,
    fetcher,
  });
  if (data) applyHydration(doc, data, false);
  return data;
}

export interface StartSpaNavigationExampleOptions {
  document?: Document;
  window?: Window;
  fetcher?: typeof fetch;
  importModule?: (
    specifier: string,
  ) => Promise<{
    hydrateFaceNavigation?: (
      context: FaceNavigationBootstrapContext,
    ) => void | Promise<void>;
  }>;
}

export interface SpaNavigationExampleControllers {
  navigation: FaceNavigationController;
  pending: NavigationPendingController;
}

export function startSpaNavigationExample(
  options: StartSpaNavigationExampleOptions = {},
): SpaNavigationExampleControllers {
  const doc = options.document ?? document;
  const win = options.window ?? doc.defaultView ?? window;

  const pending = startNavigationPending({ document: doc, window: win });
  activePending = pending;

  const navigation = startFaceNavigation({
    document: doc,
    window: win,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.importModule ? { importModule: options.importModule } : {}),
    onError: () => {
      pending.clear();
    },
  });

  return { navigation, pending };
}

if (typeof document !== 'undefined') {
  const controllers = startSpaNavigationExample();
  void hydrateSpaNavigationInitial().catch((error) => {
    console.error('FaceTheory SPA initial hydration failed', error);
  });
  window.addEventListener('beforeunload', () => {
    controllers.navigation.stop();
    controllers.pending.stop();
  });
}
