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
import { faces } from './app.js';

await buildSsgSite({
  faces,
  outDir: './dist-static',
});
```

The CLI form is `npm run ssg` (defined in `ts/package.json` as `tsx src/ssg-cli.ts`). See `ts/examples/ssg-basic/` for a working end-to-end build + serve.

## Throughput and route failures

SSG builds are serial by default (`concurrency: 1`) to preserve the historical build shape. Raise the bounded route-render concurrency when a build has many independent pages:

```typescript
await buildSsgSite({
  faces,
  outDir: './dist-static',
  concurrency: 4,
});
```

The CLI equivalent is:

```bash
npm run ssg -- --entry ./ssg.config.ts --out ./dist-static --concurrency 4
```

When one route fails, FaceTheory continues rendering the remaining planned routes. Successful pages and the manifest for those pages are still written, then the build reports the failed routes and exits non-zero (or `buildSsgSite` rejects with `SsgBuildFailedError` for programmatic callers).

## Incremental builds

Full clean output remains the default: `buildSsgSite` removes the output directory before writing so removed routes or stale assets do not linger.

Use incremental builds when a local or CI cache already holds the previous SSG output and you want unchanged route files to keep their existing bytes and mtimes:

```typescript
await buildSsgSite({
  faces,
  outDir: './dist-static',
  incremental: true,
});
```

The CLI flag is:

```bash
npm run ssg -- --entry ./ssg.config.ts --out ./dist-static --incremental
```

Incremental mode does not run `rm -rf` on the output directory. Each route is still rendered so FaceTheory can compute a SHA-256 content hash over the rendered HTML and any emitted hydration sidecar. If the hash matches the previous `.facetheory/ssg-manifest.json` entry and the expected files are still present with matching bytes, FaceTheory skips rewriting that route and reports it in `skippedRoutes`. Run a full clean build when you need to prune routes or files that no longer exist.

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

- [AWS Deployment Shape]({{ '/aws-deployment-shape/' | relative_url }})
- [CDK Integration Guide]({{ '/cdk/' | relative_url }})
- [FaceModule API reference](../reference/face-module.md)
