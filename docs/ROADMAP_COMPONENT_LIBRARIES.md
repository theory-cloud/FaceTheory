# FaceTheory Component Library Roadmap (React-first)

This roadmap complements `docs/ROADMAP.md` by focusing specifically on **component library + design system support**.
The first target is the PayTheory standard reference app: `reference/paytheory-portal` (React + Ant Design + Emotion).

## Guiding principles (cross-framework)

- **Framework-neutral core**: keep “UI integration” concepts (style collection, head tags, theming) independent of React so
  they can be reused for Vue and Svelte.
- **Deterministic SSR output**: stable head/style ordering and repeatable output for contract tests.
- **Streaming-compatible**: designs should not force full-buffer rendering, even if early milestones start buffered.
- **Security-aware**: support CSP nonces and safe serialization for hydration payloads.

## Scope (for this roadmap)

- React adapter + a reusable UI integration layer
- Ant Design SSR + theming (based on PayTheory portal patterns)
- Emotion SSR (CSS extraction + theming)
- Vite SSR build/manifest integration as the recommended build pipeline
- Parity plan for Vue/Svelte (concept reuse + validation criteria)

Non-goals (initially): full Portal SSR migration, ISR/SSG caching semantics, and CloudFront/S3 deployment automation.

## Component targets (what “support” means)

To avoid “it SSRs hello world” success, each milestone is validated against **real UI components**.

### Component libraries (React)

- **Ant Design** (core UI kit): Layout, Typography, Flex, Button, Form controls, Table, Drawer/Modal, Upload, Date inputs.
- **Emotion** (custom styling): `css(...)` styles and the `css` prop used throughout the PayTheory portal.

### PayTheory portal components (representative subset)

These come from `reference/paytheory-portal/src/components` and are used as the “standard” integration baseline:

- **Layout + navigation**: `NavigationMenu`, `layout/ScreenHeader`, `Logo`, `Title`, `Card`.
- **Data display**: `FilteredTable`, `CollapseDetails`, `AmountDisplay`, `MoneyDisplay`, `IdDisplay`, `PaymentMethod`.
- **Overlays**: `Drawer`, `DetailsDrawer`, `QRCodeModal`, selected `Modals/*`.
- **Filters + inputs**: `Filter*` family, `SearchSelect`, `UploadDragger`, `SdkForm`.
- **Resilience**: `ErrorBoundary`.

For Vue/Svelte later, the *components themselves* will be reimplemented, but the **concepts must carry over**:
design tokens, theming, head/style collection, asset injection, SSR/hydration invariants.

---

## CL0 — Define framework-neutral “UI integration” contracts

Goal: introduce a small set of primitives that can represent the needs of component libraries regardless of framework.

Deliverables

- A `UIIntegration` (or similar) interface that can:
  - wrap an app render with provider(s) (theme, style collectors, i18n)
  - collect **head tags** (title/meta/link/script/style) deterministically
  - collect **styles** produced during SSR (as `<style>` tags or equivalent)
  - support **CSP nonces** for inline styles/scripts
- A structured head model (or documented conventions) that avoids “stringly-typed” head concatenation where possible.
- Contract tests for ordering/deduplication and safe hydration serialization.

Acceptance criteria

- A single Face render can return: `{ headTags, styleTags, html, hydration }` (names TBD) with stable ordering.
- CSP nonce can be applied to all inline `<style>` and hydration `<script>` tags without app changes.
- Unit tests cover:
  - deterministic ordering (same input → same output)
  - safe JSON escaping (no raw `<script>` injection)
  - dedupe rules (e.g., repeated meta tags / preloads).

---

## CL1 — React adapter baseline (buffered SSR + hydration)

Goal: a React adapter that can render a Face in buffered mode, using the CL0 contracts.

Deliverables

- A React adapter that can:
  - render `ReactNode` to HTML
  - integrate with FaceTheory’s `FaceModule` (`load` → `render`)
  - embed hydration payload and bootstrap module reference
- A minimal “hello world” React example Face.

Acceptance criteria

- A Face can SSR-render a React component and return a valid HTML document.
- Hydration payload is embedded with `safeJson`-equivalent escaping and is accessible to the client bootstrap.
- Unit tests validate:
  - server HTML contains expected content and head tags
  - hydration payload round-trips for typical objects (strings, arrays, nested data).

---

## CL2 — Vite SSR build + manifest-based asset injection (React)

Goal: establish the PayTheory-standard toolchain shape (Vite) for SSR + client asset emission, and deterministic runtime
asset injection.

Deliverables

- A Vite SSR build example that emits:
  - server bundle entrypoint
  - client assets + manifest
- Runtime helpers to inject:
  - `<script type="module" ...>` bootstrap
  - `<link rel="modulepreload" ...>` and CSS links based on manifest

Acceptance criteria

- `vite build` (or repo-equivalent) produces server + client artifacts and a manifest.
- Server render injects correct asset tags for a given entrypoint, with stable ordering.
- Example can be deployed to a basic Node runner (local) and render without missing assets.

---

## CL3 — Ant Design SSR integration (PayTheory standard)

Goal: “first-class Ant Design” support for SSR, including theme token injection and style extraction.

Deliverables

- An Ant Design UI integration plugin that:
  - wraps the app with `ConfigProvider` (theme + locale)
  - supports PayTheory theme sources (e.g., `light.json` + tenant override)
  - extracts Ant Design CSS-in-JS output into `<style>` tags during SSR
  - defines a strategy for stable classnames / hashing to prevent hydration mismatch

Component coverage (minimum)

- Layout primitives: `Layout`, `Menu`, `Typography`, `Flex`, `Grid`.
- Data entry: `Form`, `Input`, `Select`, `DatePicker` (or equivalent), `Upload`.
- Data display + overlays: `Table`, `Drawer`, `Modal`, `Tag`, loading/empty states.

Acceptance criteria

- SSR output includes required Ant Design styles in the document head before body content.
- A page with representative Ant Design components (Buttons, Forms, Layout, Typography) renders without FOUC.
- Client hydration produces no “className mismatch” warnings for Ant Design components.
- Tests validate:
  - presence of Ant Design style tags
  - stability across repeated renders (same route/theme → same head/styles).

---

## CL4 — Emotion SSR integration (PayTheory portal patterns)

Goal: support Emotion-based styling used throughout the reference app (`css` from `@emotion/react`) with SSR extraction.

Deliverables

- An Emotion UI integration plugin that:
  - installs an Emotion cache provider suitable for SSR
  - extracts critical CSS into `<style>` tags during SSR
  - supports theming via Ant Design tokens (PayTheory portal uses `theme.useToken()` → Emotion theme)

Component coverage (minimum)

- Components using `css={...}` props (Emotion) combined with Ant Design primitives.
- At least the PayTheory portal components `layout/ScreenHeader` and `NavigationMenu` as fixtures.

Acceptance criteria

- SSR output includes Emotion-generated styles for components using `css(...)`.
- Client hydration does not cause style duplication or missing styles.
- Tests validate:
  - extracted Emotion style tags exist and include expected rules
  - Emotion theme values match Ant Design tokens passed to providers.

---

## CL5 — Component fixture harness (Portal subset)

Goal: validate the integration against PayTheory portal **components** without requiring a full SSR migration.

Deliverables

- A fixture harness that can SSR-render representative components from `reference/paytheory-portal`:
  - `layout/ScreenHeader`, `NavigationMenu`, `FilteredTable`, `Drawer` / `DetailsDrawer`, and at least one `Filter*`.
- A “portal providers” shim for SSR tests:
  - theme tokens + Ant Design `ConfigProvider`
  - Emotion theme bridging (AntD token → Emotion theme)
- Documentation of any required SSR refactors in the reference app (e.g., `window` usage, side effects on import).

Acceptance criteria

- SSR fixtures render without runtime errors and include both Ant Design + Emotion style tags.
- Hydration fixtures run without console warnings/errors (className mismatch, missing styles, etc).
- No network calls are required during SSR tests (all external data is mocked/stubbed).
- A short “Portal SSR readiness checklist” exists and is kept up to date (`docs/PORTAL_SSR_READINESS_CHECKLIST.md`).

---

## CL6 — React streaming SSR with style-safe head emission

Goal: enable streaming SSR for React while ensuring head + critical styles are emitted before streaming the body.

Deliverables

- React streaming renderer integrated with FaceTheory’s streaming body contract.
- A head/style flushing strategy compatible with Ant Design + Emotion:
  - emit `<!doctype>` + `<html><head>...` early
  - finalize and emit critical styles
  - then begin streaming `<body>` content
- Clear error semantics once streaming begins (abort vs error footer).

Acceptance criteria

- A streaming-capable Face shows a measurable TTFB improvement vs buffered SSR locally.
- The first body chunk is never sent before required style tags are emitted.
- Tests cover:
  - chunk ordering invariants (head/styles before body)
  - predictable behavior when render throws after streaming starts.

---

## CL7 — Concept reuse: Vue + Svelte parity plan and “hello UI” PoCs

Goal: prove the CL0 contracts are reusable by implementing minimal Vue and Svelte adapters that can accept the same style
and head collection concepts (even if the UI libraries differ).

Deliverables

- A Vue adapter PoC that produces `{ headTags, styleTags, html, hydration }` using CL0 primitives.
- A Svelte adapter PoC with the same output shape.
- A “parity checklist” mapping React milestones to Vue/Svelte equivalents:
  - style collection
  - theme token propagation
  - asset injection
  - streaming constraints.

Acceptance criteria

- Vue and Svelte PoCs can SSR-render a small component and inject head tags and styles via the same CL0 mechanism.
- The roadmap clearly identifies which React-specific steps are abstracted vs which are adapter-specific.

### Parity checklist (React → Vue/Svelte)

This is the shared contract surface we want to reuse as we add “real UI” support outside React.

- **Head tags**: `headTags` returned from a Face render (framework adapters populate it; core renders deterministically).
- **Critical CSS**: `styleTags` returned from a Face render (adapter/integrations extract; core emits into `<head>`).
- **Theme propagation**: a framework adapter can wrap rendering with providers and pass tokens consistently.
- **Asset injection**: Vite manifest helpers are framework-neutral; adapters only provide hydration bootstrap.
- **Hydration**: hydration payload + bootstrap module are encoded via `FaceHydration` and emitted with CSP-safe escaping.
- **Streaming**: head/styles must be flushed before any streamed body bytes (adapter-specific, but uses core streaming wrapper).
