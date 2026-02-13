import type { FaceModule } from '../../src/types.js';

export const faces: FaceModule[] = [
  {
    route: '/',
    mode: 'ssg',
    render: () => ({
      head: { title: 'FaceTheory SSG' },
      html: '<main><h1>FaceTheory SSG</h1><p>Home page</p></main>',
    }),
  },
  {
    route: '/about',
    mode: 'ssg',
    render: () => ({
      head: { title: 'About' },
      html: '<main><h1>About</h1><p>Static about page.</p></main>',
    }),
  },
  {
    route: '/blog/{slug}',
    mode: 'ssg',
    generateStaticParams: async () => [
      { slug: 'hello-ssg' },
      { slug: 'route-params' },
    ],
    load: async (ctx) => ({ slug: ctx.params.slug }),
    render: (_ctx, data) => ({
      head: { title: `Post: ${(data as { slug: string }).slug}` },
      html: `<main><h1>${(data as { slug: string }).slug}</h1><p>Generated at build time.</p></main>`,
    }),
  },
  {
    route: '/404',
    mode: 'ssg',
    render: () => ({
      status: 404,
      head: { title: 'Not Found' },
      html: '<main><h1>Not Found</h1><p>This page does not exist.</p></main>',
    }),
  },
];
