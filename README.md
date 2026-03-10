# FaceTheory

FaceTheory is a TypeScript runtime for AWS-first SSR, SSG, and blocking ISR with deterministic head and style rendering plus adapter surfaces for React, Vue, and Svelte.

Canonical documentation lives under [docs/README.md](./docs/README.md).

## Quickstart

```bash
cd ts
npm ci
npm run typecheck
npm test
```

High-signal examples:
- React streaming: `npm run example:streaming:serve`
- Vue Vite SSR: `npm run example:vite:vue:build && npm run example:vite:vue:serve`
- Svelte Vite SSR: `npm run example:vite:svelte:build && npm run example:vite:svelte:serve`
- SSG: `npm run example:ssg:build && npm run example:ssg:serve`

## Repository Layout

- `docs/` canonical documentation
- `ts/` runtime package, tests, and local examples
- `infra/` reference CloudFront and Lambda deployment stacks

## Documentation Pointers

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api-reference.md)
- [Core Patterns](./docs/core-patterns.md)
- [Testing Guide](./docs/testing-guide.md)
- [CDK And AWS Notes](./docs/cdk/README.md)
