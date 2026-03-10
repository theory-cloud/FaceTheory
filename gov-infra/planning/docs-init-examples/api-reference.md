# FaceTheory API Reference

This example document is the target shape for `docs/api-reference.md`.

## Overview

FaceTheory provides a TypeScript runtime for SSR, SSG, and ISR delivery patterns.

- Runtime: Node.js `>=24`
- Primary package: `@theory-cloud/facetheory`
- Primary sources: `ts/src/**`

## Interface Map

| Interface | Type | Entry point | Notes |
|---|---|---|---|
| `@theory-cloud/facetheory` | package root | `ts/src/index.ts` | Re-exports core app/runtime modules. |
| `createFaceApp(options)` | function | `ts/src/app.ts` | Creates the application runtime from `FaceModule[]`. |
| `runSsgCli(argv?)` | function | `ts/src/ssg-cli.ts` | Programmatic CLI runner used by `npm run ssg`. |
| `@theory-cloud/facetheory/apptheory` | adapter export | `ts/src/apptheory/index.ts` | AppTheory request/response adapter surface. |
| `@theory-cloud/facetheory/aws-s3` | adapter export | `ts/src/aws-s3/index.ts` | ISR HTML object storage adapter surface. |
| `@theory-cloud/facetheory/tabletheory` | adapter export | `ts/src/tabletheory/index.ts` | ISR metadata/table adapter surface. |

## Usage Examples

### Minimal runtime usage

```ts
import { createFaceApp, type FaceModule } from '@theory-cloud/facetheory';

const faces: FaceModule[] = [
  {
    route: '/',
    mode: 'ssr',
    render: async () => ({ html: '<h1>Hello FaceTheory</h1>' }),
  },
];

const app = createFaceApp({ faces });
```

### Static generation CLI usage

```bash
cd ts
npm run ssg -- --entry ./examples/ssg/src/faces.ts --out ./dist/ssg
```

## Related Docs

- [Getting Started](./getting-started.md)
- [Core Patterns](./core-patterns.md)
- [Testing Guide](./testing-guide.md)
