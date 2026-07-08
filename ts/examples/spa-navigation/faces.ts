import type { FaceModule } from '@theory-cloud/facetheory';

// The single client bundle both Faces boot from. In a real deployment this is
// the built entry-client asset path; `startFaceNavigation` imports it per Face
// and calls its exported `hydrateFaceNavigation` hook.
export const BOOTSTRAP_MODULE = '/assets/spa-navigation-entry.js';

export interface SpaPageData {
  page: 'home' | 'details';
  title: string;
  body: string;
  cartCount: number;
}

// Same-origin JSON URL each Face's hydration data is loaded from during client
// navigation (the external SSR hydration sidecar for that Face).
export function spaSidecarUrlForPage(page: SpaPageData['page']): string {
  return `/spa-data/${page}.json`;
}

export function spaPageDataForPath(pathname: string): SpaPageData {
  if (pathname === '/details') {
    return {
      page: 'details',
      title: 'Order details',
      body: 'Line items and totals loaded from the details Face sidecar.',
      cartCount: 3,
    };
  }

  return {
    page: 'home',
    title: 'Storefront home',
    body: 'Pick a page to navigate between Faces without a full document reload.',
    cartCount: 1,
  };
}

// The nav lives OUTSIDE `[data-facetheory-view]` so it persists across
// navigations; only the view region and head are swapped by the client.
function renderShell(data: SpaPageData): string {
  return `<header class="spa-nav">
  <span class="spa-brand">FaceTheory SPA</span>
  <nav aria-label="Primary">
    <a class="spa-link" href="/" data-spa-link>Home</a>
    <a class="spa-link" href="/details" data-spa-link>Details</a>
  </nav>
  <span class="spa-cart" data-cart-count>${data.cartCount}</span>
</header>
<main class="spa-view" data-facetheory-view data-page="${data.page}">
  <h1>${data.title}</h1>
  <p>${data.body}</p>
  <p class="spa-hydration" data-hydration-source>server-rendered</p>
</main>`;
}

function spaFace(route: string, pathname: string): FaceModule {
  return {
    route,
    mode: 'ssr',
    load: async () => spaPageDataForPath(pathname),
    render: (_ctx, data) => {
      const page = data as SpaPageData;
      return {
        head: { title: page.title },
        html: renderShell(page),
        // External hydration: the data is not inlined; the client loads it from
        // the Face's sidecar URL during navigation before running the hook.
        hydration: {
          type: 'external',
          data: page,
          dataUrl: spaSidecarUrlForPage(page.page),
          bootstrapModule: BOOTSTRAP_MODULE,
        },
      };
    },
  };
}

export const faces: FaceModule[] = [
  spaFace('/', '/'),
  spaFace('/details', '/details'),
];
