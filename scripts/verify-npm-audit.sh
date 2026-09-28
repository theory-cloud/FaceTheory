#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST_FILE="${ROOT_DIR}/gov-infra/planning/facetheory-supply-chain-allowlist.txt"

projects=(
  "ts"
  "infra/apptheory-ssr-site"
  "infra/apptheory-ssg-isr-site"
)

# Bounded registry-call retry. The overrides exist so the repo-local test can
# keep the retry path fast; they can only ever shorten the wait, never turn a
# failed audit into a pass.
AUDIT_ATTEMPTS="${FACETHEORY_NPM_AUDIT_ATTEMPTS:-3}"
AUDIT_BACKOFF_SECONDS="${FACETHEORY_NPM_AUDIT_BACKOFF_SECONDS:-5}"

report_is_usable() {
  node -e 'try { JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); } catch (error) { process.exit(1); }' "$1"
}

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

  audit_status=0
  attempt=1
  while true; do
    set +e
    (cd "${ROOT_DIR}/${project}" && npm audit --package-lock-only --json > "${report}")
    audit_status=$?
    set -e

    # A registry or network failure leaves no usable report; retry those with a
    # bounded linear backoff and still fail closed once the attempts run out. A
    # report that parses is a real audit outcome and is never retried.
    if report_is_usable "${report}"; then
      break
    fi
    if (( attempt >= AUDIT_ATTEMPTS )); then
      break
    fi
    echo "npm-audit: retry (${project}) unusable report on attempt ${attempt}/${AUDIT_ATTEMPTS} (exit ${audit_status})" >&2
    sleep "$(( AUDIT_BACKOFF_SECONDS * attempt ))"
    attempt=$(( attempt + 1 ))
  done

  if ! report_is_usable "${report}"; then
    echo "npm-audit: FAIL (${project}) no usable audit report after ${attempt} attempt(s) (exit ${audit_status})" >&2
    exit 1
  fi

  ROOT_DIR="${ROOT_DIR}" ALLOWLIST_FILE="${ALLOWLIST_FILE}" PROJECT="${project}" AUDIT_STATUS="${audit_status}" REPORT="${report}" node <<'NODE'
const fs = require('node:fs');

const project = process.env.PROJECT;
const auditStatus = Number(process.env.AUDIT_STATUS || '0');
const reportPath = process.env.REPORT;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulnerabilities = report.vulnerabilities || {};
const entries = Object.entries(vulnerabilities);
const allowlist = new Set(
  fs
    .readFileSync(process.env.ALLOWLIST_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
);

function advisoryId(url) {
  const match = /^https:\/\/github\.com\/advisories\/(GHSA-[0-9a-z-]+)$/.exec(url || '');
  return match?.[1];
}

function isAllowlisted(vulnerability) {
  const via = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
  return (
    via.length > 0 &&
    via.every((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const id = advisoryId(entry.url);
      return id !== undefined && allowlist.has(id);
    })
  );
}

const unexpected = entries.filter(([, vulnerability]) => !isAllowlisted(vulnerability));
const allowed = entries.filter(([, vulnerability]) => isAllowlisted(vulnerability));

if (unexpected.length > 0) {
  console.error(`npm-audit: FAIL (${project})`);
  for (const [name, vulnerability] of unexpected) {
    console.error(`  ${name}: severity=${vulnerability.severity || 'unknown'} nodes=${(vulnerability.nodes || []).join(',')}`);
  }
  process.exit(1);
}

for (const [name, vulnerability] of allowed) {
  const ids = vulnerability.via.map((entry) => advisoryId(entry.url)).join(',');
  console.log(`npm-audit: ALLOW (${project}) ${name} via ${ids}`);
}

if (auditStatus !== 0 && allowed.length === 0) {
  console.error(`npm-audit: FAIL (${project}) audit exited ${auditStatus}`);
  process.exit(1);
}

console.log(`npm-audit: PASS (${project})`);
NODE
done
