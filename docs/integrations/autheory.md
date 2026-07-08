---
title: Autheory integration
---

Autheory is a downstream consumer of FaceTheory. It uses FaceTheory's Stitch primitives — `stitch-hosted-auth` and `stitch-admin` — for its hosted-authentication UI and control-plane surfaces. The integration boundary is asymmetric: FaceTheory does not depend on Autheory, but changes that affect the Stitch primitives Autheory consumes are coordination events.

## Direction

```
Autheory hosted-auth UI / control plane
              │
        FaceTheory
   (Stitch primitives, SSR/SSG/ISR)
```

FaceTheory exposes design-system primitives. Autheory composes them into authenticated experiences. FaceTheory does not authenticate sessions, validate MFA, or know about Autheory's internal state — those concerns live in Autheory.

## What Autheory consumes

- **`@theory-cloud/facetheory/{react,vue,svelte}/stitch-hosted-auth`** — primitives for sign-in flows, MFA challenges, recovery, and account-linking screens.
- **`@theory-cloud/facetheory/{react,vue,svelte}/stitch-admin`** — primitives for the Autheory control-plane (tenant management, audit trail, operator dashboards).
- **`@theory-cloud/facetheory/{react,vue,svelte}/stitch-shell`** — navigation, breadcrumbs, callouts.
- **`@theory-cloud/facetheory/stitch-tokens`** — design tokens shared across all surfaces.

## The operator-visibility boundary

For control-plane dashboards, Autheory derives an `OperatorGuardStatus` from the authenticated session and passes it into FaceTheory for rendering. FaceTheory renders the state; it does not interpret session validity or derive permissions itself.

See [Operator visibility dashboards](../features/operator-visibility.md) for the contract.

## Coordination

Changes to FaceTheory's Stitch shell, hosted-auth, or admin primitives that would break Autheory's bindings are coordination events. The simplest path is:

1. Open a FaceTheory PR with a `feat!:` or `fix!:` commit subject (Conventional Commits — the 3.x line flags breaking changes explicitly).
2. Notify Autheory's steward through the user.
3. Land matching changes in Autheory against the new FaceTheory version.

## Hosted-auth Svelte named-slot readiness

FaceTheory's Svelte hosted-auth primitives are Svelte 5 runes components. Named insertion points are snippet props, not
legacy slots. Autheory Svelte templates that fill hosted-auth chrome must use snippets such as:

```svelte
<AuthPageLayout>
  {#snippet brand()}...{/snippet}
  {#snippet footer()}...{/snippet}

  <AuthCard title="Sign in">
    {#snippet headerAction()}...{/snippet}
    {#snippet footer()}...{/snippet}
    ...
  </AuthCard>
</AuthPageLayout>
```

Legacy `slot="brand"`, `slot="footer"`, or `<svelte:fragment slot="headerAction">` authoring does not bind to these
snippet props and can silently drop content after migration. FaceTheory has not edited or validated Autheory in this
repository; before Autheory pins a FaceTheory release containing the migrated hosted-auth primitives, run Autheory's live
hosted-auth screens or an equivalent SSR fixture with snippet fills for at least `brand`, `footer`, `headerAction`,
`icon`, and `actions`.

## Related docs

- [Operator visibility dashboards](../features/operator-visibility.md)
- [API Reference → Operator Visibility Dashboard Boundary](../api-reference.md#operator-visibility-dashboard-boundary)
- [Core Patterns → Keep Stitch contracts shared and adapter imports matched](../core-patterns.md#pattern-keep-stitch-contracts-shared-and-adapter-imports-matched)
