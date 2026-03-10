# FaceTheory TypeScript Workspace

This folder contains the `@theory-cloud/facetheory` package source, tests, and runnable examples.

Canonical product and operator documentation lives under [`../docs/`](../docs/README.md). This README stays focused on workspace-local commands and orientation.

## Local Development

```bash
cd ts
npm ci
npm run typecheck
npm test
```

Build the package:

```bash
npm run build
```

## Local Examples

- Buffered React SSR: `npm run example:buffered:serve`
- Streaming React SSR: `npm run example:streaming:serve`
- React Vite SSR: `npm run example:vite:ssr:build && npm run example:vite:ssr:serve`
- Vue Vite SSR: `npm run example:vite:vue:build && npm run example:vite:vue:serve`
- Svelte Vite SSR: `npm run example:vite:svelte:build && npm run example:vite:svelte:serve`
- SSG: `npm run example:ssg:build && npm run example:ssg:serve`

## Key Workspace Entry Points

- `src/index.ts` core runtime exports
- `src/apptheory/index.ts` AppTheory adapter
- `src/aws-s3/index.ts` AWS SDK S3 adapter
- `src/tabletheory/index.ts` TableTheory ISR adapter
- `src/ssg-cli.ts` repository-local SSG CLI implementation

## Documentation Pointers

- [`../docs/api-reference.md`](../docs/api-reference.md)
- [`../docs/core-patterns.md`](../docs/core-patterns.md)
- [`../docs/testing-guide.md`](../docs/testing-guide.md)
- [`../docs/cdk/README.md`](../docs/cdk/README.md)
