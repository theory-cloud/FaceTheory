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

  ROOT_DIR="${ROOT_DIR}" PROJECT="${project}" AUDIT_STATUS="${audit_status}" REPORT="${report}" node <<'NODE'
const fs = require('node:fs');

const project = process.env.PROJECT;
const auditStatus = Number(process.env.AUDIT_STATUS || '0');
const reportPath = process.env.REPORT;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulnerabilities = report.vulnerabilities || {};
const entries = Object.entries(vulnerabilities);

// GHSA-3jxr-9vmj-r5cp remains in the brace-expansion@5.0.6 copy bundled
// inside aws-cdk-lib@2.261.0. AppTheory CDK v1.17.1 requires that exact CDK
// peer, and npm overrides cannot replace dependencies bundled in the AWS
// tarball. Keep this exception exact, visible, and short-lived: it applies to
// the AWS CDK nested node only, never to another brace-expansion installation.
const braceExpansionException = {
  advisory: 'https://github.com/advisories/GHSA-3jxr-9vmj-r5cp',
  node: 'node_modules/aws-cdk-lib/node_modules/brace-expansion',
  version: '5.0.6',
  awsCdkVersion: '2.261.0',
  expiresOn: '2026-08-05',
  projects: new Set([
    'ts',
    'infra/apptheory-ssr-site',
    'infra/apptheory-ssg-isr-site',
  ]),
};

function isAllowedBundledBraceExpansion(name, vulnerability) {
  if (name !== 'brace-expansion' || vulnerability?.name !== 'brace-expansion') return false;
  if (!braceExpansionException.projects.has(project)) return false;

  const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
  if (nodes.length !== 1 || nodes[0] !== braceExpansionException.node) return false;

  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  if (via.length === 0) return false;
  return via.every(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      entry.name === 'brace-expansion' &&
      entry.url === braceExpansionException.advisory,
  );
}

function validateBundledBraceExpansionException() {
  const today = new Date().toISOString().slice(0, 10);
  if (today > braceExpansionException.expiresOn) {
    throw new Error(
      `brace-expansion exception expired on ${braceExpansionException.expiresOn}; re-review the AWS CDK bundle`,
    );
  }

  const lock = JSON.parse(fs.readFileSync(`${process.env.ROOT_DIR}/${project}/package-lock.json`, 'utf8'));
  const bundled = lock.packages?.[braceExpansionException.node];
  const awsCdk = lock.packages?.['node_modules/aws-cdk-lib'];
  if (awsCdk?.version !== braceExpansionException.awsCdkVersion) {
    throw new Error(
      `expected aws-cdk-lib ${braceExpansionException.awsCdkVersion}, got ${awsCdk?.version || 'missing'}; remove or revise the exception`,
    );
  }
  if (bundled?.version !== braceExpansionException.version || bundled?.inBundle !== true) {
    throw new Error(
      `expected AWS CDK bundled brace-expansion ${braceExpansionException.version}, got ${bundled?.version || 'missing'} (inBundle=${String(bundled?.inBundle)}); remove or revise the exception`,
    );
  }
}

try {
  // Validate the exception even when npm reports a clean audit so an upstream
  // bundle change cannot leave stale policy behind silently.
  validateBundledBraceExpansionException();
} catch (error) {
  console.error(`npm-audit: FAIL (${project}) ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const unexpected = [];
const allowed = [];
for (const [name, vulnerability] of entries) {
  if (isAllowedBundledBraceExpansion(name, vulnerability)) {
    allowed.push({ name, vulnerability });
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
  console.log(
    `npm-audit: ALLOW (${project}) brace-expansion@${braceExpansionException.version} at ${braceExpansionException.node}; AWS CDK bundled dependency pending upstream fix (expires ${braceExpansionException.expiresOn})`,
  );
  process.exit(0);
}

if (auditStatus !== 0) {
  console.error(`npm-audit: FAIL (${project}) audit exited ${auditStatus}`);
  process.exit(1);
}

console.log(`npm-audit: PASS (${project})`);
NODE
done
