# Operator Visibility React SSR Example

## Demonstrates

This example renders a deterministic operator-visibility dashboard through the React adapter. The Face `load()` function injects guard, authority, confidence, staleness, health, correlation, and matrix values; the React tree only displays caller-supplied data.

## Run

From `ts/`:

```bash
npm run example:operator-visibility:build
npm run example:operator-visibility:serve
```

The build command writes `examples/operator-visibility-react/dist/index.html` for inspection. The serve command starts a small Node HTTP server on `PORT` or `4174`.

## Backs

- `docs/features/operator-visibility.md` — operator dashboard boundary.
- `docs/getting-started.md` — operator visibility example walkthrough.
- Public package surfaces: `@theory-cloud/facetheory/stitch-admin` and `@theory-cloud/facetheory/react/stitch-admin`.
