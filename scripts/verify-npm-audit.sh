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

const allowedFastUriAdvisories = new Set([
  'https://github.com/advisories/GHSA-q3j6-qgpj-74h6',
  'https://github.com/advisories/GHSA-v39h-62p7-jpjc',
]);

function isAllowedFastUri(name, vulnerability) {
  if (name !== 'fast-uri' || vulnerability?.name !== 'fast-uri') return false;
  if (!project.startsWith('infra/apptheory-')) return false;

  const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
  if (nodes.length !== 1 || nodes[0] !== 'node_modules/aws-cdk-lib/node_modules/fast-uri') {
    return false;
  }

  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  if (via.length === 0) return false;
  return via.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return entry.name === 'fast-uri' && allowedFastUriAdvisories.has(entry.url);
  });
}

const unexpected = [];
const allowed = [];
for (const [name, vulnerability] of entries) {
  if (isAllowedFastUri(name, vulnerability)) {
    allowed.push(name);
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
    `npm-audit: ALLOW (${project}) fast-uri via bundled aws-cdk-lib tarball; no custom CDK tarball is maintained`,
  );
  process.exit(0);
}

if (auditStatus !== 0) {
  console.error(`npm-audit: FAIL (${project}) audit exited ${auditStatus} without an allowed vulnerability`);
  process.exit(1);
}

console.log(`npm-audit: PASS (${project})`);
NODE
done
