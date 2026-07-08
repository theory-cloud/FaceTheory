import {
  createFaceApp,
  viteAssetsForEntry,
  viteHydrationForEntry,
  type FaceModule,
  type ViteManifest,
} from '@theory-cloud/facetheory';
import { createVueFace, h } from '@theory-cloud/facetheory/vue';

import { App, type VueSsgAppProps } from './app.js';

const ENTRY = 'src/entry-client.ts';

export interface SsgProduct {
  slug: string;
  name: string;
  blurb: string;
}

export const PRODUCTS: SsgProduct[] = [
  {
    slug: 'aurora-lamp',
    name: 'Aurora Lamp',
    blurb: 'A warm bedside lamp with a dawn-simulation wake cycle.',
  },
  {
    slug: 'nimbus-chair',
    name: 'Nimbus Chair',
    blurb: 'An ergonomic lounge chair with a breathable mesh back.',
  },
  {
    slug: 'zephyr-desk',
    name: 'Zephyr Desk',
    blurb: 'A height-adjustable standing desk with a bamboo surface.',
  },
];

function homeProps(): VueSsgAppProps {
  return {
    heading: 'FaceTheory Vue SSG catalog',
    lede: 'These pages are statically generated from a real Vue tree at build time.',
    links: PRODUCTS.map((product) => ({
      href: `/products/${product.slug}`,
      label: product.name,
    })),
  };
}

function productProps(slug: string): VueSsgAppProps {
  const product = PRODUCTS.find((entry) => entry.slug === slug);
  if (!product) {
    return {
      heading: 'Unknown product',
      lede: 'This product is not part of the generated catalog.',
      links: [{ href: '/', label: '← Back to catalog' }],
    };
  }
  return {
    heading: product.name,
    lede: product.blurb,
    links: [{ href: '/', label: '← Back to catalog' }],
  };
}

function ssgRenderOptions(manifest: ViteManifest, title: string) {
  return async (_ctx: unknown, data: unknown) => {
    const { headTags } = viteAssetsForEntry(manifest, ENTRY, {
      includeAssets: true,
    });
    const hydration = viteHydrationForEntry(manifest, ENTRY, data);
    return {
      headTags: [...headTags, { type: 'title' as const, text: title }],
      hydration,
    };
  };
}

export function createVueSsgFaces(manifest: ViteManifest): FaceModule[] {
  const homeFace = createVueFace<VueSsgAppProps>({
    route: '/',
    mode: 'ssg',
    load: async () => homeProps(),
    render: (_ctx, data) => h('div', { id: 'root' }, [h(App, data)]),
    renderOptions: ssgRenderOptions(manifest, 'Catalog — FaceTheory Vue SSG'),
  });

  const productFace = createVueFace<VueSsgAppProps>({
    route: '/products/{slug}',
    mode: 'ssg',
    load: async (ctx) => productProps(ctx.params.slug ?? ''),
    render: (_ctx, data) => h('div', { id: 'root' }, [h(App, data)]),
    renderOptions: ssgRenderOptions(manifest, 'Product — FaceTheory Vue SSG'),
  });
  // `createVueFace` owns the Vue rendering; SSG's `generateStaticParams` lives on
  // the returned FaceModule and drives which dynamic pages are pre-rendered.
  productFace.generateStaticParams = async () =>
    PRODUCTS.map((product) => ({ slug: product.slug }));

  return [homeFace, productFace];
}

export function createVueSsgExampleApp(manifest: ViteManifest) {
  return createFaceApp({ faces: createVueSsgFaces(manifest) });
}
