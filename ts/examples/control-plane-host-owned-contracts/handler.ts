import {
  createControlPlaneApp,
  type ControlPlaneGate,
  type ControlPlaneSectionReadContract,
} from '@theory-cloud/facetheory/control-plane';
import type { FaceApp, FaceContext } from '@theory-cloud/facetheory';
import type { OperatorGuardStatus } from '@theory-cloud/facetheory/stitch-admin';

interface HostResolvedControlPlaneAuth {
  readonly guard: OperatorGuardStatus;
  readonly tenantId: string;
  readonly acceptedSectionScope: string;
  readonly claims: unknown;
}

interface HostOwnedSectionReadInput {
  readonly ctx: FaceContext;
  readonly tenantId: string;
  readonly acceptedSectionScope: string;
  readonly externalContract: ControlPlaneSectionReadContract;
}

interface HostOwnedSectionReadResult {
  readonly tenantId: string;
  readonly acceptedSectionScope: string;
  readonly contractId: string;
  readonly rows: readonly HostOwnedSectionRow[];
}

interface HostOwnedSectionRow {
  readonly label: string;
  readonly value: string;
}

export const HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT = {
  contractId: 'host.tabletheory.key-m1.section-read',
  authority: 'host.tabletheory',
  source: 'host.control-plane.section-read',
  bounded: true,
  tenantScoped: true,
} satisfies ControlPlaneSectionReadContract;

const HOST_AUTH_RESULT: HostResolvedControlPlaneAuth = {
  guard: {
    state: 'authorized',
    principalLabel: 'Example host operator',
    requestId: 'req_host_control_plane_001',
  },
  tenantId: 'tenant_example_safe',
  acceptedSectionScope: 'section:operator-summary:read',
  claims: {
    stableSubject: 'operator_example_001',
    accepted: 'host-auth-resolved',
  },
};

async function resolveHostOperatorGuard(
  _ctx: FaceContext,
): Promise<HostResolvedControlPlaneAuth> {
  return HOST_AUTH_RESULT;
}

async function readHostOwnedControlPlaneSection(
  input: HostOwnedSectionReadInput,
): Promise<HostOwnedSectionReadResult> {
  return {
    tenantId: input.tenantId,
    acceptedSectionScope: input.acceptedSectionScope,
    contractId: input.externalContract.contractId ?? 'host.opaque-section-read',
    rows: [
      { label: 'Host accepted tenant', value: input.tenantId },
      { label: 'Host accepted scope', value: input.acceptedSectionScope },
      { label: 'Request path', value: input.ctx.request.path },
    ],
  };
}

const gate: ControlPlaneGate = async (ctx) => {
  const auth = await resolveHostOperatorGuard(ctx);
  if (auth.guard.state !== 'authorized') {
    return {
      ok: false,
      status: 403,
      title: 'Not authorized',
      message: auth.guard.reason ?? 'The host rejected this control-plane request.',
    };
  }

  return {
    ok: true,
    plane: 'staff',
    tenant: auth.tenantId,
    claims: auth,
  };
};

export function createHostOwnedControlPlaneExampleApp(): FaceApp {
  return createControlPlaneApp({
    delivery: { capability: 'streaming' },
    gate,
    faces: [
      {
        route: '/',
        title: 'Host-owned control-plane section reads',
        sections: [
          {
            id: 'operator-summary',
            title: 'Operator summary',
            read: HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT,
            load: async (ctx, acceptedGate) => {
              const auth = acceptedGate.claims as HostResolvedControlPlaneAuth;
              return readHostOwnedControlPlaneSection({
                ctx,
                tenantId: acceptedGate.tenant ?? auth.tenantId,
                acceptedSectionScope: auth.acceptedSectionScope,
                externalContract: HOST_SUPPLIED_TABLETHEORY_SECTION_READ_CONTRACT,
              });
            },
            render: (_ctx, data) =>
              renderOperatorSummary(data as HostOwnedSectionReadResult),
          },
        ],
        renderShell: (_ctx, helpers) => `<main data-facetheory-view>
          <h1>Host-owned control-plane section reads</h1>
          <p>FaceTheory renders the shell; the host owns auth and section data.</p>
          ${helpers.section('operator-summary')}
        </main>`,
      },
    ],
  });
}

function renderOperatorSummary(data: HostOwnedSectionReadResult): string {
  const rows = data.rows
    .map(
      (row) =>
        `<li><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</li>`,
    )
    .join('');

  return `<article data-example="host-owned-section-read" data-contract-id="${escapeHtml(data.contractId)}">
    <p>Section data came from a host-owned bounded read.</p>
    <ul>${rows}</ul>
  </article>`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
