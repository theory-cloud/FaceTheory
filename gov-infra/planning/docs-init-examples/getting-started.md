# Getting Started with FaceTheory

This example document is the target shape for `docs/getting-started.md`.

## Prerequisites

**Required**
- Node.js `>=24` (`ts/package.json` engines)
- npm
- Access to this repository and ability to run local TypeScript tooling

**Recommended**
- Familiarity with AWS Lambda Function URL concepts for production deployment
- Familiarity with one supported UI framework adapter: React, Vue, or Svelte

## Installation

### Step 1: Install and validate the TypeScript workspace

```bash
cd ts
npm ci
npm run typecheck
npm test
```

What this does:
- Installs dependencies for `@theory-cloud/facetheory`
- Verifies the compile-time contract (`npm run typecheck`)
- Runs unit test coverage for runtime behaviors (`npm test`)

### Step 2: Run a first local SSR example

```bash
cd ts
npm run example:streaming:serve
```

Then open `http://localhost:4173/`.

## Verification

Run the baseline verification commands:

```bash
cd ts
npm run typecheck
npm test
```

Expected result:
- Typecheck exits successfully with no errors.
- Unit tests pass (includes SSR/streaming/ISR related tests referenced in root `README.md`).

Optional runtime verification:

```bash
cd ts
npm run example:vite:vue:build && npm run example:vite:vue:serve
```

Expected result:
- Local server starts and serves SSR output for the Vue adapter path.

## Next Steps

- Read [API Reference](./api-reference.md) for module exports, CLI, and environment surfaces.
- Read [Core Patterns](./core-patterns.md) for `CORRECT` and `INCORRECT` integration patterns.
- Read [Troubleshooting](./troubleshooting.md) if setup or runtime verification fails.
