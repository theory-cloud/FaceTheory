# FaceTheory wizard primitives (Stitch admin)

Status: pre-1.0, framework-neutral contract plus React Stitch admin exports.

These primitives exist so the TheoryMCP Agent Import & Completion Wizard
(and any future Theory Cloud setup flow) can render deterministic, host-driven
wizard surfaces on top of FaceTheory without each consumer reinventing the
shape.

The contract is deliberately **presentational**:

- FaceTheory *displays* host-supplied data.
- FaceTheory *does not* validate TheoryMCP routes, sessions, entitlements,
  GitHub bindings, mailbox bindings, capability decisions, or secrets.
- FaceTheory *does not* parse, fetch, hash, or open archives, packages, or
  evidence files. Hosts pre-compute those values.

Every primitive renders the same DOM for the same input across server-side
rendering and client-side hydration. Tests in
`ts/test/unit/stitch-admin-wizard.test.ts` pin determinism by rendering each
primitive twice and asserting byte-identical SSR output.

## Where the primitives live

| Layer | Module | What it exports |
| --- | --- | --- |
| Framework-neutral types | `@theory-cloud/facetheory/stitch-admin` | `WizardProgressState`, `WizardPackageSummary`, `WizardFindingList`, `WizardReconcileSummary`, `WizardCapabilityReview`, `WizardEnablementChecklist`, `WizardRecoveryStatus`, `WizardEmptyStateConfig`, `WizardSafetyPolicy`, and supporting enums. |
| React adapter | `@theory-cloud/facetheory/react/stitch-admin` | `WizardProgress`, `WizardPackageSummaryPanel`, `WizardFindingListPanel`, `WizardReconcileSummaryPanel`, `WizardReconciliationPlanPanel` (alias `WizardDiffListPanel`), `WizardCapabilityReviewPanel`, `WizardEnablementChecklistPanel`, `WizardRecoveryStatusPanel`, `WizardEmptyState`. |

Vue and Svelte adapter parity is intentionally deferred for this milestone.
The TheoryMCP control plane that consumes these primitives today is React; the
framework-neutral contract is already in place so a future milestone can wrap
the same types with Vue / Svelte renderers without re-shaping the data.

## Safety policy

Every primitive that could otherwise leak production-looking or secret-like
data carries an explicit `WizardSafetyPolicy` literal:

```ts
type WizardSafetyPolicy = 'no-secret-or-production-like-data';
```

- The host **passes the literal in** to confirm the contract.
- The primitive **renders the literal into the DOM** (e.g. via
  `data-safety-policy="no-secret-or-production-like-data"` and a footnote)
  so reviewers and tests can verify the policy is in effect.
- The primitive **does not** validate the data against the policy; it only
  surfaces the assertion.

`WizardReconcileEntry` and `WizardCapability` have additional redaction levers
the primitive *does* enforce at render time:

- `WizardReconcileEntry.redacted: true` or `kind: 'redacted'` → the entry's
  detail is replaced with `[redacted]`.
- `WizardCapability.sensitivity = 'redacted'` → the description and detail are
  both suppressed and `[redacted]` is rendered in their place.
- `WizardCapability.sensitivity = 'sensitive'` → the description still renders
  but the detail is replaced with the literal label "Detail suppressed
  (sensitive)."

These render-time levers are belt-and-suspenders: the host should still avoid
passing raw secrets into the primitive at all.

## When to use `WizardReconciliationPlanPanel` vs `WizardReconcileSummaryPanel`

These two primitives describe different things and live side by side:

- **`WizardReconcileSummaryPanel`** describes a **before/after diff** with
  kinds `added`, `removed`, `changed`, `unchanged`, `redacted`. Use it when
  you want to show the user what changed between two snapshots.

- **`WizardReconciliationPlanPanel`** (alias `WizardDiffListPanel`) describes
  the **plan** the host intends to execute next, with the richer operation
  kinds:

  | Canonical kind | Stable alias              | Meaning                                                 |
  | -------------- | ------------------------- | ------------------------------------------------------- |
  | `create`       | —                         | Will create a new resource                              |
  | `update`       | —                         | Will update an existing resource                        |
  | `satisfied`    | `already_satisfied`       | Desired state already matches; no work                  |
  | `conflict`     | —                         | Incompatible with another row or external state         |
  | `blocked`      | —                         | Cannot proceed; the host explains why in `reason`       |
  | `external`     | `external_step_required`  | Will be completed outside this wizard                   |
  | `noop`         | `not_requested`           | Explicitly requested as a no-op                         |

  Aliases are accepted on input and normalized to the canonical kind at
  render time. The canonical kind appears in `data-row-kind`; the original
  alias is preserved in `data-row-kind-input` so callers can grep either
  form during regression debugging.

### Accessible expand/collapse contract

`WizardReconciliationPlanPanel` rows may carry an optional list of structured
`details`. When they do, the primitive renders an expand/collapse affordance
that follows these rules:

- The toggle is a real `<button type="button">` (keyboard-operable, focusable
  by default; no custom div-with-onClick).
- `aria-expanded="true|false"` mirrors `row.expanded`. The primitive never
  toggles state itself — it is a controlled surface.
- `aria-controls` points at the detail panel id; the detail panel uses the
  matching `id` plus `role="region"` and the standard `hidden` attribute when
  not expanded.
- The toggle's `aria-label` is text — "Show details for &lt;status label&gt;"
  / "Hide details for &lt;status label&gt;" — so screen-readers and
  high-contrast viewers see the same information independent of color.
- The status pill exposes its label via `aria-label="Status: …"`.

The host wires an `onToggleRow(rowKey, nextExpanded)` callback to update its
own state. On the next render, the row's `expanded` value updates and the
primitive renders the new state. There is no client-side `useState` inside
the primitive, which is what keeps SSR and hydrated DOM byte-identical.

### Redaction levers

The reconciliation plan primitive shares the redaction model with the rest of
the wizard contracts. Two levers, both enforced at render time:

- `WizardReconciliationPlanDetail.redacted = true` — that one detail's value
  renders as `[redacted]`.
- `WizardReconciliationPlanRow.redacted = true` — every detail value in that
  row renders as `[redacted]`. The row's `summary` and `reason` still render
  so reviewers can see why the row exists, but the values do not leak.

The row's safety policy literal is still required and is still rendered into
the DOM (`data-safety-policy`, plus the footnote).

## Consuming the primitives from TheoryMCP

The TheoryMCP control plane is the first consumer. Suggested integration shape:

```tsx
import {
  WizardProgress,
  WizardPackageSummaryPanel,
  WizardFindingListPanel,
  WizardReconcileSummaryPanel,
  WizardReconciliationPlanPanel,
  // alias of WizardReconciliationPlanPanel — same component, "DiffList" naming
  WizardDiffListPanel,
  WizardCapabilityReviewPanel,
  WizardEnablementChecklistPanel,
  WizardRecoveryStatusPanel,
  WizardEmptyState,
} from '@theory-cloud/facetheory/react/stitch-admin';
```

A typical reconciliation step in the TheoryMCP Agent Import & Completion
Wizard:

```tsx
<WizardReconciliationPlanPanel
  plan={{
    rows: [
      { key: 'ns', label: 'Create namespace acme', kind: 'create',
        summary: 'Will create namespace acme in tenant theory-mcp' },
      { key: 'agent', label: 'Update agent acme', kind: 'update',
        summary: 'Bump declared capabilities' },
      { key: 'binding', label: 'Mailbox binding', kind: 'already_satisfied',
        summary: 'Mailbox allowlist already includes the agent' },
      { key: 'github', label: 'GitHub binding', kind: 'conflict',
        reason: 'Existing binding targets theory-cloud/Other; resolve before continuing.' },
      { key: 'policy', label: 'Enforcement policy', kind: 'blocked',
        reason: 'Operator review record not present.' },
      { key: 'secret', label: 'Rotate signing secret', kind: 'external_step_required',
        reason: 'Cannot rotate from this wizard; complete in the rotation tool.' },
      { key: 'deploy', label: 'Deployment', kind: 'not_requested',
        summary: 'Deployment intentionally not part of this run' },
    ],
    totals: { create: 1, update: 1, satisfied: 1, conflict: 1, blocked: 1, external: 1, noop: 1 },
    safetyPolicy: 'no-secret-or-production-like-data',
  }}
  onToggleRow={(rowKey, nextExpanded) => host.setRowExpanded(rowKey, nextExpanded)}
/>
```

A typical wizard page picks the primitive(s) it needs for the current step and
passes host-owned data straight in. For example:

```tsx
<WizardProgress
  state={{
    steps: [
      { key: 'connect', label: 'Connect repository', status: 'complete' },
      { key: 'validate', label: 'Validate manifest', status: 'in-progress' },
      { key: 'review', label: 'Review capabilities', status: 'pending' },
      { key: 'enable', label: 'Enable agent', status: 'pending' },
    ],
    currentStepKey: 'validate',
  }}
/>
```

Empty / error states must declare the wizard safety policy:

```tsx
<WizardEmptyState
  config={{
    intent: 'not-configured',
    title: 'Configure a TheoryMCP binding to begin',
    description: 'Connect a GitHub binding and a mailbox before importing.',
    actionLabel: 'Open binding settings',
    safetyPolicy: 'no-secret-or-production-like-data',
  }}
/>
```

Recovery / resume references must redact tokens before passing them in:

```tsx
<WizardRecoveryStatusPanel
  status={{
    state: 'resumable',
    lastSavedAt: '2026-05-21T03:15:00.000Z',
    ageLabel: 'saved 6 minutes ago',
    resumeTokenReference: {
      label: 'session abc12…', // host-redacted label, never the raw token
      redacted: true,
    },
  }}
/>
```

The host is responsible for producing the redacted label. FaceTheory never
opens, validates, or rotates the underlying session token.

## Temporary local archive (pre-lab handoff)

Until the next FaceTheory release ships, TheoryMCP development can consume an
in-progress build via a temporary local archive produced by:

```bash
scripts/pack-dev-archive.sh
```

By default the archive is written to
`/tmp/theorycloud-facetheory-dev-archives/` and named
`theory-cloud-facetheory-<version>-dev-<short-sha>.tgz` (the `-dev-<sha>`
suffix keeps it visibly distinct from any real release tarball). A
`.sha256` sidecar file is written alongside.

```text
/tmp/theorycloud-facetheory-dev-archives/
├── theory-cloud-facetheory-3.2.1-dev-<sha>.tgz
└── theory-cloud-facetheory-3.2.1-dev-<sha>.tgz.sha256
```

To override the output directory:

```bash
scripts/pack-dev-archive.sh --output-dir /path/you/control
```

If you've already built `ts/dist`, you can skip the rebuild:

```bash
scripts/pack-dev-archive.sh --skip-build
```

To verify the archive — the sidecar stores only the basename, so `cd` into the
output directory before invoking `sha256sum --check`:

```bash
( cd /tmp/theorycloud-facetheory-dev-archives \
    && sha256sum --check theory-cloud-facetheory-3.2.1-dev-<sha>.tgz.sha256 )
```

If you'd rather not `cd`, recompute the digest and compare it to the sidecar
contents directly:

```bash
sha256sum /tmp/theorycloud-facetheory-dev-archives/theory-cloud-facetheory-3.2.1-dev-<sha>.tgz
cat /tmp/theorycloud-facetheory-dev-archives/theory-cloud-facetheory-3.2.1-dev-<sha>.tgz.sha256
```

The script prints the cd-form `sha256sum --check` command in its success
output so you can copy-paste it without retyping the path.

### What the dev archive is NOT

The dev archive is a development handoff convenience and is explicitly **not**:

- a GitHub Release
- a published npm package
- a tagged FaceTheory version
- a Release Please PR or version bump
- an immutable release artifact

It is rebuilt as the milestone branch advances; consumers are expected to
re-pull it as it evolves. Once a real FaceTheory release ships, the dev archive
is discarded and consumers re-pin against the published release tarball.

### What the dev archive must NOT contain

- secrets, credentials, signed URLs, release tokens, or rotation tokens
- production-like partner, tenant, customer, or principal fixtures
- AWS account identifiers, real DNS names, or live IAM principals
- any data that would not be safe to attach to a draft PR

The host (TheoryMCP) is responsible for redacting these before invoking the
wizard primitives; the archive itself only contains the FaceTheory build
output from `npm pack`.
