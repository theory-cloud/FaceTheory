# FaceTheory wizard primitives (Stitch admin)

Status: pre-1.0. The framework-neutral contract is shared across all adapters.
All wizard primitive families ship with full React + Vue + Svelte parity:
`WizardProgress`, `WizardPackageSummaryPanel`, `WizardFindingListPanel`,
`WizardReconcileSummaryPanel`, `WizardReconciliationPlanPanel`
(alias `WizardDiffListPanel`), `WizardAuthorityContextStripPanel`
(alias `WizardServerResolvedContextBarPanel`),
`WizardCapabilityReviewPanel`, `WizardEnablementChecklistPanel`,
`WizardRecoveryStatusPanel`, `WizardEmptyState`, and
`WizardEditableTokenInputPanel` (alias `WizardChipListPanel`). The THE-1459
corrective parity backfill (Vue + Svelte adapters for the THE-1458 / THE-1448
/ THE-1449 families) completes the contract; future component-request
milestones land with React + Vue + Svelte parity from the start.

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
| Framework-neutral types | `@theory-cloud/facetheory/stitch-admin` | `WizardProgressState`, `WizardPackageSummary`, `WizardFindingList`, `WizardReconcileSummary`, `WizardReconciliationPlan`, `WizardAuthorityContextStrip`, `WizardCapabilityReview`, `WizardEnablementChecklist`, `WizardRecoveryStatus`, `WizardEmptyStateConfig`, `WizardEditableTokenInput`, `WizardSafetyPolicy`, and supporting enums and aliases. |
| React adapter | `@theory-cloud/facetheory/react/stitch-admin` | `WizardProgress`, `WizardPackageSummaryPanel`, `WizardFindingListPanel`, `WizardReconcileSummaryPanel`, `WizardReconciliationPlanPanel` (alias `WizardDiffListPanel`), `WizardAuthorityContextStripPanel` (alias `WizardServerResolvedContextBarPanel`), `WizardEditableTokenInputPanel` (alias `WizardChipListPanel`), `SelectableCardGridPanel`, `ChoiceCard`, `WizardCapabilityReviewPanel`, `WizardEnablementChecklistPanel`, `WizardRecoveryStatusPanel`, `WizardEmptyState`. |
| Vue adapter | `@theory-cloud/facetheory/vue/stitch-admin` | Same primitive set as React, including `SelectableCardGridPanel` and `ChoiceCard`. |
| Svelte adapter | `@theory-cloud/facetheory/svelte/stitch-admin` | Same primitive set, exposed as `.svelte` components with matching component-prop interfaces. |

### Adapter parity status

All wizard primitive families now ship with full **React + Vue + Svelte
parity**. The THE-1459 corrective parity backfill closed the React-only gap
left by THE-1458 / THE-1448 / THE-1449. The unit suites for each adapter
(`ts/test/unit/stitch-admin-wizard*.test.ts`,
`ts/test/unit/vue-stitch-admin.test.ts`, and
`ts/test/unit/svelte-stitch-admin.test.ts`) render every primitive and
assert the same testable contract: class names, `data-*` attributes, ARIA
wiring, `role="alert"` for prominent conflict / blocked / external / failed
states, the safety-policy footnote where required, and deterministic SSR
output for the same input.

Future component-request milestones land with React + Vue + Svelte parity
from the start; the React-only paths are no longer part of the shipped
surface.

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

## Authority / server-resolved context strip

`WizardAuthorityContextStripPanel` (alias `WizardServerResolvedContextBarPanel`)
is the read-only context header that the TheoryMCP control plane renders above
wizard content — the "tenant / namespace / MCP route / operator / partner /
agent scope" surface.

### Trust boundary

This is the most security-relevant primitive in the wizard set, so the trust
boundary is restated explicitly:

- FaceTheory **never** resolves, verifies, derives, or validates tenant,
  namespace, operator, MCP route, partner, agent, account, entitlement,
  mailbox, GitHub, or authority state.
- FaceTheory **never** enforces read-only. The read-only label (when
  supplied) is informational text — it does not lock anything.
- FaceTheory **never** invents copy payloads. Copyable cells use
  `item.copyValue` if supplied, otherwise the rendered string `item.value`
  verbatim. The host pre-resolves whatever should be copied.

### Item contract

Each item is a label/value cell:

```ts
interface WizardAuthorityContextItem {
  key: string;
  label: unknown;
  value: unknown;
  icon?: unknown;
  badge?: unknown;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  copyable?: boolean;
  copyValue?: string;
  title?: string;
  href?: string;
}
```

The cell renders as a real `<dt>` / `<dd>` pair so screen-readers read the
pairing, and `href` is filtered through the Stitch admin safe-href filter
(unsafe schemes like `javascript:` are dropped at render).

### Layout matrix

`layout` controls how items are arranged:

| Value    | Behavior                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| `strip`  | Single horizontal row. `wrap` controls whether items wrap (`true`, default) or scroll (`false`).    |
| `grid`   | CSS Grid `auto-fit, minmax(220px, 1fr)`. Items reflow as the container narrows.                     |
| `stack`  | Vertical stack — preferred in narrow admin sidebars.                                                |
| `auto`   | Default. CSS-only responsive grid that stacks on narrow viewports **without hiding any cell**.      |

Layout is implemented in inline CSS (no media queries inside the component,
no JavaScript layout), so SSR output and hydrated DOM are byte-identical.

### Copyable cells

When `item.copyable` is `true` and a string copy payload is available, the
component renders a real keyboard-accessible button:

- `<button type="button">` (focusable by default, keyboard-operable)
- `aria-label="Copy <label>"` so screen-readers announce the action
- `data-copy-value="<host-supplied>"` carries the deterministic payload
- An optional `onCopyItem(itemKey, copyValue)` prop performs the clipboard
  write; if it's omitted, the markup still renders deterministically and the
  host is expected to wire the action itself (e.g. via global delegation).

The component never resolves what to copy; the host is the authority.

### Read-only / authority cues

Both cues render as **text**, not color-only:

- `authorityLabel` (e.g. `"Server-derived"`, `"Autheory session"`,
  `"Route-resolved"`) renders in the header with its own
  `data-authority-label="true"`.
- `readOnlyLabel` (e.g. `"Read-only"`) renders in the header with
  `data-read-only-label="true"` and an explicit `aria-label`.

The component does not imply enforcement. It is a presentational primitive;
authority and read-only state come from the host.

### Example

```tsx
<WizardAuthorityContextStripPanel
  strip={{
    items: [
      { key: 'tenant', label: 'Tenant', value: 'theory-mcp' },
      { key: 'namespace', label: 'Namespace', value: 'acme', tone: 'info' },
      { key: 'route', label: 'MCP route', value: '/agents/acme',
        copyable: true, copyValue: '/agents/acme' },
      { key: 'operator', label: 'Operator', value: 'aron@equal-to.ai',
        badge: 'session' },
    ],
    authorityLabel: 'Server-derived',
    readOnlyLabel: 'Read-only',
    layout: 'auto',
    size: 'md',
    safetyPolicy: 'no-secret-or-production-like-data',
  }}
  onCopyItem={(itemKey, value) => host.copyToClipboard(itemKey, value)}
/>
```

## Editable token input / chip list

`WizardEditableTokenInputPanel` (alias `WizardChipListPanel`) is the
controlled chip/token entry primitive the TheoryMCP Agent Import &
Completion Wizard uses for steps like "Allowed senders" and "Allowed
domains".

### Trust boundary

- Client validation is **UX only**. FaceTheory never claims a token is
  safe to write.
- TheoryMCP must still **server-validate** allowed senders / domains
  before writing `AgentEmailBinding` policy.
- FaceTheory does not resolve mailbox, tenant, namespace, agent, partner,
  provider credentials, or email policy state.

### Controlled contract

The host owns state. The primitive is purely controlled:

- `input.value: string[]` — current token list.
- `onChange(next: string[])` — required. The primitive calls this whenever
  it proposes a new token list (commit on Enter/comma, Backspace removes
  the previous when the draft is empty, or the chip's Remove button is
  clicked). The host accepts the new list (or doesn't).
- `input.draftValue?: string` — controlled current draft text.
- `onDraftChange?(next: string)` — called whenever the draft text changes.

There is **no hidden state** inside the primitive. SSR and hydrated DOM
are byte-identical for the same props.

### Key handling

| Key       | Behavior                                                                  |
| --------- | ------------------------------------------------------------------------- |
| Enter     | Commit draft. Calls `onChange([...value, normalizedDraft])` and clears.   |
| Comma     | Same as Enter.                                                            |
| Backspace | If draft is empty and there is at least one token, remove the last one.   |

Commit is suppressed when the draft is empty, when `validateToken` returns
`{ valid: false }`, when the resulting token would be a duplicate and
`allowDuplicates !== true`, or when `value.length >= maxTokens`. The
primitive never enforces these limits beyond suppressing its own commit
proposal; the host can still pass any list back via `onChange`.

### Per-token metadata

Optional `input.items` carries `{ value, tone?, title?, disabled?,
removable? }` per token. Tokens without an `items` entry render with
`neutral` tone and remain removable.

### Validation feedback

Feedback below the input is computed deterministically and announced via
`role="alert"` and `aria-live="polite"`. The priority order is:

1. Caller-supplied `feedbackMessage` (highest — surfaces server messages).
2. `validateToken(draft)` returning `{ valid: false }`.
3. Duplicate of an existing token (only when `allowDuplicates !== true`).
4. `value.length >= maxTokens` (when `maxTokens` is supplied).
5. No feedback.

The current source is exposed via `data-feedback-source` for testing and
debugging.

### Disabled / read-only

`disabled` and `readOnly` render text labels in the header (with explicit
`aria-label`), set the standard HTML attributes, and suppress the
draft `<input>` plus the chip Remove buttons. They are **never**
color-only cues.

### Example

```tsx
<WizardEditableTokenInputPanel
  input={{
    inputId: 'allowed-senders',
    value: ['qa@example.com', 'ops@example.com'],
    label: 'Allowed senders',
    description: 'Server validation remains authoritative.',
    placeholder: 'Add another address…',
    removeLabelKind: 'sender',
    validateToken: (token) =>
      token.includes('@') ? { valid: true } : { valid: false, message: 'Address must contain @' },
    safetyPolicy: 'no-secret-or-production-like-data',
    draftValue: host.draft,
  }}
  onChange={(next) => host.setAllowedSenders(next)}
  onDraftChange={(next) => host.setDraft(next)}
/>
```

## Selectable card grid / choice card

`SelectableCardGridPanel` (with the lower-level `ChoiceCard` primitive) is the
card-grid choice surface the TheoryMCP Agent Import & Completion Wizard
renders for "pick an action / target / environment" steps. It supports both
single-select and multi-select selection modes and three layouts (responsive
grid, compact stacked list, two-column wizard panels).

### Trust boundary

- Presentation-only. FaceTheory does not decide whether a choice is
  authorized.
- theory-mcp-server (the host) supplies `allowed` / `disabled` / `blocked`
  state from route-resolved server policy and TableTheory-backed state.
- FaceTheory makes no authorization inference from option labels, package
  fields, repository names, or action-family strings.
- `recommended`, `riskLabel`, `disabledReason`, `blocked`, and
  `blockedReason` fields are caller-supplied display values, never computed
  by the primitive.

### Option contract

```ts
interface SelectableCardOption {
  key: string;
  title: unknown;
  description?: unknown;
  icon?: unknown;
  badge?: unknown;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'recommended';
  riskLabel?: string;
  disabledReason?: string;
  recommended?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  metadata?: OperatorVisibilityMetadata;
}
```

### Accessibility contract

- Single-select grids render the outer container as `role="radiogroup"` and
  each card as `role="radio"` with `aria-checked` and a tab index driven by
  selection.
- Multi-select grids render the outer container as `role="group"` and each
  card as `role="checkbox"` with `aria-checked`.
- Disabled options (those carrying `disabledReason` or `blocked: true`)
  carry `aria-disabled="true"`; the host-supplied `disabledReason` is
  rendered as text and wired via `aria-describedby` to the card.
- `recommended`, `Blocked`, and risk states render as **text pills** (not
  color-only) so high-contrast viewers see the cue.
- Keyboard activation: `Space` or `Enter` calls the host's `onChange`
  with the proposed next selected-key set. The primitive never toggles
  state internally.

### Selection model

- `single`: `onChange([option.key])` on activate.
- `multi`: `onChange([...selectedKeys, option.key])` or
  `onChange(selectedKeys.filter(k => k !== option.key))` depending on whether
  the option is currently selected.

The host owns acceptance — passing back a different list is fine.

### Example

```tsx
<SelectableCardGridPanel
  grid={{
    groupId: 'allowed-action',
    selection: 'single',
    selectedKeys: ['create'],
    options: [
      { key: 'create', title: 'Create new namespace', tone: 'success', recommended: true },
      { key: 'reuse', title: 'Reuse existing namespace', tone: 'info' },
      { key: 'replace', title: 'Replace existing namespace',
        tone: 'warning', riskLabel: 'High blast radius' },
      { key: 'archive', title: 'Archive without binding',
        disabledReason: 'Requires operator review before archival.' },
      { key: 'forbidden', title: 'Forbidden namespace',
        blocked: true, blockedReason: 'Server policy blocks this option.' },
    ],
    label: 'Allowed action',
    description: 'TheoryMCP resolves which of these are available per route.',
    layout: 'grid',
    safetyPolicy: 'no-secret-or-production-like-data',
  }}
  onChange={(next) => host.setAllowedAction(next[0])}
/>
```

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
