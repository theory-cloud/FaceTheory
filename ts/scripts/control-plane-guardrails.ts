import type { ControlPlaneCspMode } from '../src/control-plane.js';

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

export interface ControlPlaneBoundaryGuardrailSourceFile {
  path: string;
  content: string;
}

export interface ControlPlaneBoundaryGuardrailViolation {
  path: string;
  line: number;
  message: string;
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

export function findControlPlaneBoundaryGuardrailViolations(
  files: readonly ControlPlaneBoundaryGuardrailSourceFile[],
): ControlPlaneBoundaryGuardrailViolation[] {
  const violations: ControlPlaneBoundaryGuardrailViolation[] = [];
  for (const file of files) {
    const path = normalizeGuardrailPath(file.path);
    const imports = collectModuleImports(file.content);
    const isControlPlaneOrStitch = isControlPlaneOrStitchSurface(path);

    for (const imported of imports) {
      if (
        isControlPlaneOrStitch &&
        isRawDynamoDbClientModule(imported.moduleSpecifier)
      ) {
        violations.push({
          path,
          line: imported.line,
          message:
            'control-plane/Stitch surfaces must not import raw DynamoDB clients; consume host-owned contracts or the TableTheory ISR integration instead',
        });
      }

      if (
        isTableTheoryModule(imported.moduleSpecifier) &&
        !isAllowedTableTheoryImportPath(path)
      ) {
        violations.push({
          path,
          line: imported.line,
          message:
            'TableTheory imports are limited to ts/src/tabletheory/** and ISR-specific tests/docs; control-plane consumers receive opaque host-supplied contracts',
        });
      }
    }

    if (isControlPlaneOrStitch) {
      for (const normalizer of collectEntitlementNormalizers(file.content)) {
        violations.push({
          path,
          line: normalizer.line,
          message:
            'control-plane/Stitch surfaces must not implement entitlement normalization; Autheory or the host resolves guard state before FaceTheory renders',
        });
      }
    }
  }

  return violations;
}

export function assertControlPlaneBoundaryGuardrails(
  files: readonly ControlPlaneBoundaryGuardrailSourceFile[],
): void {
  const violations = findControlPlaneBoundaryGuardrailViolations(files);
  if (violations.length === 0) return;

  const details = violations
    .map((violation) => `${violation.path}:${violation.line}: ${violation.message}`)
    .join('\n');
  throw new Error(`control-plane boundary guardrails failed:\n${details}`);
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

interface ModuleImport {
  moduleSpecifier: string;
  line: number;
}

interface EntitlementNormalizer {
  line: number;
}

function collectModuleImports(content: string): ModuleImport[] {
  const imports: Array<ModuleImport & { index: number }> = [];
  const importExportTokenPattern = /\b(?:import|export)\b/gm;
  const moduleCallPattern = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

  for (const match of content.matchAll(importExportTokenPattern)) {
    const startIndex = match.index ?? 0;
    const keywordEndIndex = startIndex + match[0].length;
    const moduleSpecifier =
      match[0] === 'import'
        ? (readSideEffectImportSpecifier(content, keywordEndIndex) ??
          readFromModuleSpecifier(content, keywordEndIndex))
        : readFromModuleSpecifier(content, keywordEndIndex);

    if (!moduleSpecifier) continue;
    imports.push({
      index: startIndex,
      moduleSpecifier,
      line: lineNumberAt(content, startIndex),
    });
  }

  for (const match of content.matchAll(moduleCallPattern)) {
    const moduleSpecifier = match[1];
    if (!moduleSpecifier) continue;
    const startIndex = match.index ?? 0;
    imports.push({
      index: startIndex,
      moduleSpecifier,
      line: lineNumberAt(content, startIndex),
    });
  }

  return imports
    .sort((left, right) => left.index - right.index)
    .map(({ index: _index, ...moduleImport }) => moduleImport);
}

function collectEntitlementNormalizers(
  content: string,
): EntitlementNormalizer[] {
  const normalizers: EntitlementNormalizer[] = [];
  const normalizerPattern =
    /\b(?:function|const|let|var|class|type|interface)\s+((?:normalize|normalise|derive|resolve|map|coerce|canonicalize|parse)[A-Za-z0-9_]*)/gim;

  for (const match of content.matchAll(normalizerPattern)) {
    if (!match[1]?.toLowerCase().includes('entitlement')) continue;
    normalizers.push({ line: lineNumberAt(content, match.index ?? 0) });
  }

  return normalizers;
}

function readSideEffectImportSpecifier(
  content: string,
  offset: number,
): string | undefined {
  const quoteIndex = skipWhitespace(content, offset);
  return readQuotedModuleSpecifier(content, quoteIndex);
}

function readFromModuleSpecifier(
  content: string,
  offset: number,
): string | undefined {
  for (let index = offset; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 34 || code === 39) return undefined;
    if (!isFromTokenAt(content, index)) continue;

    const afterFromIndex = index + 'from'.length;
    if (!isWhitespaceCode(content.charCodeAt(afterFromIndex))) {
      index = afterFromIndex - 1;
      continue;
    }

    const quoteIndex = skipWhitespace(content, afterFromIndex);
    const moduleSpecifier = readQuotedModuleSpecifier(content, quoteIndex);
    if (moduleSpecifier) return moduleSpecifier;

    index = afterFromIndex - 1;
  }

  return undefined;
}

function readQuotedModuleSpecifier(
  content: string,
  quoteIndex: number,
): string | undefined {
  const quote = content.charCodeAt(quoteIndex);
  if (quote !== 34 && quote !== 39) return undefined;

  for (let index = quoteIndex + 1; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 34 || code === 39) {
      return content.slice(quoteIndex + 1, index);
    }
  }

  return undefined;
}

function skipWhitespace(content: string, offset: number): number {
  let index = offset;
  while (isWhitespaceCode(content.charCodeAt(index))) index += 1;
  return index;
}

function isFromTokenAt(content: string, index: number): boolean {
  if (!content.startsWith('from', index)) return false;
  return (
    !isIdentifierCode(content.charCodeAt(index - 1)) &&
    !isIdentifierCode(content.charCodeAt(index + 'from'.length))
  );
}

function isWhitespaceCode(code: number): boolean {
  return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32;
}

function isIdentifierCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  );
}

function isControlPlaneOrStitchSurface(path: string): boolean {
  return (
    path === 'ts/src/control-plane.ts' ||
    path.startsWith('ts/src/stitch-') ||
    path.startsWith('ts/src/react/stitch-') ||
    path.startsWith('ts/src/vue/stitch-') ||
    path.startsWith('ts/src/svelte/stitch-')
  );
}

function isAllowedTableTheoryImportPath(path: string): boolean {
  if (path.startsWith('ts/src/tabletheory/')) return true;
  if (!path.startsWith('ts/test/')) return false;
  const filename = path.split('/').pop() ?? '';
  return filename.includes('isr') || filename.includes('tabletheory');
}

function isRawDynamoDbClientModule(moduleSpecifier: string): boolean {
  return (
    moduleSpecifier === '@aws-sdk/client-dynamodb' ||
    moduleSpecifier === '@aws-sdk/lib-dynamodb' ||
    moduleSpecifier === 'aws-sdk/clients/dynamodb'
  );
}

function isTableTheoryModule(moduleSpecifier: string): boolean {
  return (
    moduleSpecifier === '@theory-cloud/tabletheory-ts' ||
    moduleSpecifier === '@theory-cloud/facetheory/tabletheory' ||
    /(^|\/)tabletheory(\/|$)/i.test(moduleSpecifier)
  );
}

function normalizeGuardrailPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (content.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}
