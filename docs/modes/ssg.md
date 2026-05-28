---
title: SSG (static site generation)
---

SSG renders HTML at build time. Output is written to disk, uploaded to S3, and served through CloudFront. Pick SSG when content changes only on redeploy and the build-time cost is acceptable.

## Declaring an SSG Face

```typescript
import { createFaceApp, type FaceModule } from '@theory-cloud/facetheory';

const faces: FaceModule[] = [
  {
    route: '/about',
    mode: 'ssg',
    render: async () => ({ html: '<h1>About FaceTheory</h1>' }),
  },
];

export const app = createFaceApp({ faces });
```

Use `generateStaticParams` for parameterized routes:

```typescript
{
  route: '/blog/{slug}',
  mode: 'ssg',
  generateStaticParams: async () => [
    { slug: 'hello-world' },
    { slug: 'second-post' },
  ],
  render: async (ctx) => ({
    html: `<article><h1>${ctx.params.slug}</h1></article>`,
  }),
}
```

## Building the site

`buildSsgSite` walks every SSG Face, expands `generateStaticParams`, calls each `render`, and writes the output:

```typescript
import { buildSsgSite } from '@theory-cloud/facetheory';
import { app } from './app.js';

await buildSsgSite({
  app,
  outDir: './dist-static',
});
```

The CLI form is `npm run ssg` (defined in `ts/package.json` as `tsx src/ssg-cli.ts`). See `ts/examples/ssg-basic/` for a working end-to-end build + serve.

## Related helpers

- `planSsgPages(faces)` — preview the routes and params the build will produce, without writing files.
- `ssgFilePathForRoute(route)` — compute the on-disk path for a given route.
- `ssgHydrationDataFilePathForRoute(route)` — compute the sidecar JSON path for hydration data.

## What SSG guarantees

- Every Face render runs once during the build, never during a user request.
- Output files are immutable until the next build — perfect for `Cache-Control: public, max-age=31536000, immutable` on CloudFront.
- Hydration sidecars live under `/_facetheory/data/*` for S3/CloudFront delivery (caller-managed external hydration uses `externalHydrationForEntry` instead).

## When SSG is wrong

- Content that depends on the request (user, locale, A/B variant) → use [SSR](ssr.md).
- Content that updates on a schedule between deploys → use [blocking ISR](isr.md).

## Related docs

- [AWS Deployment Shape](../aws-deployment-shape.md)
- [CDK Integration Guide](../cdk/)
- [FaceModule API reference](../reference/face-module.md)
