#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

projects=(
  "ts"
  "infra/apptheory-ssr-site"
  "infra/apptheory-ssg-isr-site"
)

tmp_files=()
cleanup() {
  if (( ${#tmp_files[@]} > 0 )); then
    rm -f "${tmp_files[@]}"
  fi
}
trap cleanup EXIT

for project in "${projects[@]}"; do
  report="$(mktemp)"
  tmp_files+=("${report}")

  set +e
  (cd "${ROOT_DIR}/${project}" && npm audit --package-lock-only --json > "${report}")
  audit_status=$?
  set -e

  PROJECT="${project}" AUDIT_STATUS="${audit_status}" REPORT="${report}" node <<'NODE'
const fs = require('node:fs');

const project = process.env.PROJECT;
const auditStatus = Number(process.env.AUDIT_STATUS || '0');
const reportPath = process.env.REPORT;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulnerabilities = report.vulnerabilities || {};
const entries = Object.entries(vulnerabilities);

// Known-allowed audit exceptions for upstream AWS CDK bundled transitives.
//
// FaceTheory does not repackage AWS dependencies. The `ts` workspace keeps
// `aws-cdk-lib@2.257.0` only to satisfy the exact `@theory-cloud/apptheory-cdk`
// peer used by reference constructs, and the `infra/apptheory-*` workspaces are
// reference / example deployment shapes that consumer applications reproduce
// themselves. The `aws-cdk-lib` tarball bundles its own `node_modules/` for some
// transitives, and FaceTheory cannot ship a patched version of those without
// forking AWS CDK or breaking the AppTheory CDK peer. Each exception below is
// narrowly scoped to (a) one specific package name, (b) one nested path inside
// `aws-cdk-lib/node_modules/`, (c) one set of advisory URLs that upstream has
// classified as scoped to that bundled copy, and (d) the explicitly named
// workspaces. Anything outside those gates is still treated as `FAIL`.
//
// Cross-reference: `docs/UPSTREAM_RELEASE_PINS.md` — "Known Audit
// Exception" section documents the same boundary in product terms.

const allowedFastUriAdvisories = new Set([
  'https://github.com/advisories/GHSA-q3j6-qgpj-74h6',
  'https://github.com/advisories/GHSA-v39h-62p7-jpjc',
]);

// brace-expansion: Large numeric range defeats documented `max` DoS
// protection (moderate). Present transitively in aws-cdk-lib's bundled
// node_modules. AWS CDK has not yet shipped a fix; FaceTheory cannot
// repackage. Exception will be removed when an aws-cdk-lib release
// vendors a patched brace-expansion (>= 5.0.6) on the AppTheory-compatible CDK
// line.
const allowedBraceExpansionAdvisories = new Set([
  'https://github.com/advisories/GHSA-jxxr-4gwj-5jf2',
]);

function isAllowedAwsCdkBundled(
  packageName,
  vulnerability,
  expectedNode,
  allowedAdvisories,
  allowedProjects,
) {
  if (vulnerability?.name !== packageName) return false;
  const projectAllowed = allowedProjects.some((allowedProject) => {
    if (allowedProject.endsWith('*')) {
      return project.startsWith(allowedProject.slice(0, -1));
    }
    return project === allowedProject;
  });
  if (!projectAllowed) return false;

  const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
  if (nodes.length !== 1 || nodes[0] !== expectedNode) {
    return false;
  }

  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  if (via.length === 0) return false;
  return via.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return entry.name === packageName && allowedAdvisories.has(entry.url);
  });
}

function isAllowedFastUri(name, vulnerability) {
  if (name !== 'fast-uri') return false;
  return isAllowedAwsCdkBundled(
    'fast-uri',
    vulnerability,
    'node_modules/aws-cdk-lib/node_modules/fast-uri',
    allowedFastUriAdvisories,
    ['infra/apptheory-*'],
  );
}

function isAllowedBraceExpansion(name, vulnerability) {
  if (name !== 'brace-expansion') return false;
  return isAllowedAwsCdkBundled(
    'brace-expansion',
    vulnerability,
    'node_modules/aws-cdk-lib/node_modules/brace-expansion',
    allowedBraceExpansionAdvisories,
    ['ts', 'infra/apptheory-*'],
  );
}

const unexpected = [];
const allowed = [];
for (const [name, vulnerability] of entries) {
  if (isAllowedFastUri(name, vulnerability)) {
    allowed.push({ name, reason: 'fast-uri' });
  } else if (isAllowedBraceExpansion(name, vulnerability)) {
    allowed.push({ name, reason: 'brace-expansion' });
  } else {
    unexpected.push({ name, vulnerability });
  }
}

if (unexpected.length > 0) {
  console.error(`npm-audit: FAIL (${project})`);
  for (const { name, vulnerability } of unexpected) {
    console.error(`  unexpected ${name}: severity=${vulnerability.severity || 'unknown'} nodes=${(vulnerability.nodes || []).join(',')}`);
  }
  process.exit(1);
}

if (allowed.length > 0) {
  for (const { name } of allowed) {
    console.log(
      `npm-audit: ALLOW (${project}) ${name} via bundled aws-cdk-lib tarball; no custom CDK tarball is maintained`,
    );
  }
  process.exit(0);
}

if (auditStatus !== 0) {
  console.error(`npm-audit: FAIL (${project}) audit exited ${auditStatus} without an allowed vulnerability`);
  process.exit(1);
}

console.log(`npm-audit: PASS (${project})`);
NODE
done
