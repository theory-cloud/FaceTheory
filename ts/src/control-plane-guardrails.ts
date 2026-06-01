import type { ControlPlaneCspMode } from './control-plane.js';

export interface ControlPlaneDeliveryGuardrailInput {
  csp: {
    mode?: ControlPlaneCspMode | undefined;
    strict_csp_supported?: boolean | undefined;
    inline_scripts?: boolean | undefined;
    inline_styles?: boolean | undefined;
    nonce?: 'per_request_single_source' | 'regenerated' | 'missing' | (string & {}) | undefined;
  };
  streamed_sections_styling?:
    | 'external_css'
    | 'antd_cssinjs'
    | 'inline_style'
    | (string & {})
    | undefined;
  asset_serving: {
    content_type?: string | undefined;
    nosniff?: boolean | undefined;
    head_mirrors_get?: boolean | undefined;
  };
  nav_pending: {
    indicator_id_collision_proof?: boolean | undefined;
  };
  tests: {
    exercise_real_serving_path?: boolean | undefined;
  };
}

export function assertControlPlaneDeliveryGuardrails(
  input: ControlPlaneDeliveryGuardrailInput,
): void {
  const mode = input.csp.mode ?? 'relaxed';
  if (input.csp.strict_csp_supported !== true) {
    throw new Error('I-floor: control-plane preset must support strict CSP');
  }

  assertUnconditionalGuardrails(input);

  if (mode === 'strict') {
    assertStrictOnlyGuardrails(input);
    return;
  }

  if (mode !== 'relaxed') {
    throw new Error('control-plane csp.mode must be "relaxed" or "strict"');
  }
}

function assertUnconditionalGuardrails(
  input: ControlPlaneDeliveryGuardrailInput,
): void {
  const contentType = normalizeContentType(input.asset_serving.content_type);
  if (contentType !== 'text/javascript') {
    throw new Error('I4: browser-helper assets must be served as text/javascript');
  }
  if (input.asset_serving.nosniff !== true) {
    throw new Error('I4: browser-helper assets must send x-content-type-options nosniff');
  }
  if (input.asset_serving.head_mirrors_get !== true) {
    throw new Error('I4: browser-helper asset HEAD responses must mirror GET headers');
  }
  if (input.nav_pending.indicator_id_collision_proof !== true) {
    throw new Error('I5: nav-pending indicator id must be collision-proof');
  }
  if (input.tests.exercise_real_serving_path !== true) {
    throw new Error('I10: control-plane tests must exercise the actual served output');
  }
}

function assertStrictOnlyGuardrails(
  input: ControlPlaneDeliveryGuardrailInput,
): void {
  if (input.csp.inline_scripts !== false || input.csp.inline_styles !== false) {
    throw new Error('I1: strict CSP mode rejects inline script/style');
  }
  if (input.streamed_sections_styling !== 'external_css') {
    throw new Error('I2: strict CSP streamed sections must use external CSS');
  }
  if (input.csp.nonce !== 'per_request_single_source') {
    throw new Error('I6: strict CSP mode requires a single per-request nonce source');
  }
}

function normalizeContentType(value: string | undefined): string {
  return String(value ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase() ?? '';
}
