# PayTheory Portal SSR Readiness Checklist

This checklist is used by FaceTheory’s component-library roadmap fixture harness to keep the PayTheory portal (or a
representative subset of it) “SSR-safe”.

## Import-time safety

- [ ] No `window`/`document`/`localStorage` access at module import time.
- [ ] Any browser-only code is guarded (`typeof window !== 'undefined'`) and runs in effects/event handlers.
- [ ] No side-effectful singletons created on import that assume DOM APIs (e.g. `ResizeObserver`, `matchMedia`).

## Render-time safety

- [ ] No non-deterministic output during SSR (random IDs, `Date.now()`, `Math.random()`) unless seeded/stabilized.
- [ ] No direct DOM access in render paths; move to `useEffect` or a client-only boundary.
- [ ] Avoid relying on layout measurements during initial render.

## Styling + theming (React baseline)

- [ ] Ant Design SSR style extraction enabled (css-in-js collector) and emitted in `<head>` before body.
- [ ] Emotion SSR extraction enabled; extracted styles emitted in `<head>` before body.
- [ ] Theme tokens are derived from a single source of truth (tenant overrides merge predictably).
- [ ] CSP nonce propagation: inline styles + hydration scripts receive nonce without app changes.

## Hydration stability

- [ ] No React hydration warnings for representative pages (className mismatch, missing styles, invalid nesting).
- [ ] Provider order matches client and server (ConfigProvider/Theme/Router/etc).
- [ ] Any client-only components are explicitly deferred (dynamic import, `useEffect` gate, or adapter-level boundary).

## Data + side effects

- [ ] SSR does not trigger network calls; all data is injected via `load()` or mocked in tests.
- [ ] No timers/intervals started during SSR.
- [ ] Analytics/telemetry is disabled or client-only.

## Streaming SSR constraints

- [ ] Head + critical styles can be emitted before the first streamed body chunk.
- [ ] Errors after streaming begins have a defined behavior (abort vs fallback footer), and do not corrupt HTML.

