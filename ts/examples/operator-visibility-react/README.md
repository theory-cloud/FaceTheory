# Operator visibility React SSR example

This example renders a deterministic operator visibility dashboard through the React adapter.

The Face `load()` function injects every guard, authority, confidence, staleness, health, and matrix value. The React render path only displays those values; it does not compute freshness from ambient time, browser globals, auth/session state, or network calls.

```bash
npm run example:operator-visibility:build
npm run example:operator-visibility:serve
```

The build command writes `examples/operator-visibility-react/dist/index.html` for inspection. The serve command starts a small Node HTTP server on `PORT` or `4174`.
