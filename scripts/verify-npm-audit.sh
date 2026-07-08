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

const unexpected = [];
for (const [name, vulnerability] of entries) {
  unexpected.push({ name, vulnerability });
}

if (unexpected.length > 0) {
  console.error(`npm-audit: FAIL (${project})`);
  for (const { name, vulnerability } of unexpected) {
    console.error(`  unexpected ${name}: severity=${vulnerability.severity || 'unknown'} nodes=${(vulnerability.nodes || []).join(',')}`);
  }
  process.exit(1);
}

if (auditStatus !== 0) {
  console.error(`npm-audit: FAIL (${project}) audit exited ${auditStatus}`);
  process.exit(1);
}

console.log(`npm-audit: PASS (${project})`);
NODE
done
