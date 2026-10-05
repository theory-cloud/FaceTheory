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
// The governed allowlist supports two entry forms: a bare advisory id, and a
// scoped `allow` directive whose every field (advisory ids, package, version,
// node paths, project dirs, expiry) must match the finding. Scoped entries are
// self-expiring so a stale exception fails the gate and is forced back onto the
// review path.
const bareIds = new Set();
const scoped = [];
for (const raw of fs.readFileSync(process.env.ALLOWLIST_FILE, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (!line.startsWith('allow ')) {
    bareIds.add(line);
    continue;
  }
  const fields = {};
  for (const token of line.slice('allow '.length).trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq > 0) fields[token.slice(0, eq)] = token.slice(eq + 1);
  }
  scoped.push({
    ids: (fields.ids || '').split(',').filter(Boolean),
    package: fields.package,
    version: fields.version,
    nodes: (fields.nodes || '').split(',').filter(Boolean),
    projects: (fields.projects || '').split(',').filter(Boolean),
    expires: fields.expires || '',
  });
}

function advisoryId(url) {
  const match = /^https:\/\/github\.com\/advisories\/(GHSA-[0-9a-z-]+)$/.exec(url || '');
  return match?.[1];
}

function viaAdvisories(vulnerability) {
  return Array.isArray(vulnerability?.via)
    ? vulnerability.via.map((entry) =>
        entry && typeof entry === 'object'
          ? { name: entry.name, id: advisoryId(entry.url) }
          : { name: undefined, id: undefined },
      )
    : [];
}

function isBareAllowlisted(vulnerability) {
  const via = viaAdvisories(vulnerability);
  return via.length > 0 && via.every((entry) => entry.id !== undefined && bareIds.has(entry.id));
}

const today = new Date().toISOString().slice(0, 10);

const lockPackages = (() => {
  try {
    return (
      JSON.parse(fs.readFileSync(`${process.env.ROOT_DIR}/${project}/package-lock.json`, 'utf8')).packages || {}
    );
  } catch (error) {
    return {};
  }
})();

function isScopedAllowlisted(exception, name, vulnerability) {
  if (!exception.expires || today >= exception.expires) return false;
  if (name !== exception.package || vulnerability?.name !== exception.package) return false;
  if (!exception.projects.includes(project)) return false;

  const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
  if (nodes.length === 0 || !nodes.every((node) => exception.nodes.includes(node))) return false;
  if (!nodes.every((node) => lockPackages[node]?.version === exception.version)) return false;

  const via = viaAdvisories(vulnerability);
  if (via.length === 0) return false;
  return via.every(
    (entry) => entry.name === exception.package && entry.id !== undefined && exception.ids.includes(entry.id),
  );
}

const allowed = [];
const unexpected = [];
for (const [name, vulnerability] of entries) {
  const advisoryIds = viaAdvisories(vulnerability)
    .map((entry) => entry.id)
    .join(',');
  if (isBareAllowlisted(vulnerability)) {
    allowed.push(`npm-audit: ALLOW (${project}) ${name} via ${advisoryIds} [allowlist id]`);
    continue;
  }
  const match = scoped.find((exception) => isScopedAllowlisted(exception, name, vulnerability));
  if (match) {
    allowed.push(
      `npm-audit: ALLOW (${project}) ${name} via ${advisoryIds} [scoped exception, expires ${match.expires}]`,
    );
  } else {
    unexpected.push([name, vulnerability]);
  }
}

if (unexpected.length > 0) {
  console.error(`npm-audit: FAIL (${project})`);
  for (const [name, vulnerability] of unexpected) {
    console.error(`  ${name}: severity=${vulnerability.severity || 'unknown'} nodes=${(vulnerability.nodes || []).join(',')}`);
  }
  process.exit(1);
}

for (const line of allowed) {
  console.log(line);
}

if (auditStatus !== 0 && allowed.length === 0) {
  console.error(`npm-audit: FAIL (${project}) audit exited ${auditStatus}`);
  process.exit(1);
}

console.log(`npm-audit: PASS (${project})`);
NODE
done
