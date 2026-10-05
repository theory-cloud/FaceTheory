#!/usr/bin/env bash
# Purpose: prove the npm-audit security gate (a) retries only unusable registry
# results, (b) stays bounded and fails closed when the registry never answers,
# (c) still fails on a real, non-allowlisted finding without retrying, and
# (d) honours a scoped, self-expiring allowlist exception ONLY for the exact
# bundled package, version, node path, advisory set, and project it names.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/verify-npm-audit.sh"

fail() {
  echo "test-verify-npm-audit: FAIL ($*)"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

# A scratch repository root so the gate under test scans fake lockfiles and a
# fake allowlist, never the real ones.
fake_root="${tmpdir}/root"
mkdir -p \
  "${fake_root}/scripts" \
  "${fake_root}/gov-infra/planning" \
  "${fake_root}/ts" \
  "${fake_root}/infra/apptheory-ssr-site" \
  "${fake_root}/infra/apptheory-ssg-isr-site"
cp "${script_path}" "${fake_root}/scripts/verify-npm-audit.sh"
printf '%s\n' '# no allowlist entries in this scratch root' > \
  "${fake_root}/gov-infra/planning/facetheory-supply-chain-allowlist.txt"
for project in ts infra/apptheory-ssr-site infra/apptheory-ssg-isr-site; do
  printf '%s\n' '{"name":"scratch","lockfileVersion":3}' > "${fake_root}/${project}/package-lock.json"
done

bin_dir="${tmpdir}/bin"
mkdir -p "${bin_dir}"
cat > "${bin_dir}/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
# One counter per scanned project, keyed by the directory the gate cds into.
count_file="${FAKE_NPM_STATE}-$(basename "${PWD}")"
attempt=0
if [[ -f "${count_file}" ]]; then
  attempt="$(cat "${count_file}")"
fi
attempt=$((attempt + 1))
printf '%s\n' "${attempt}" > "${count_file}"
case "${FAKE_NPM_MODE}" in
  flaky)
    if (( attempt < 2 )); then
      printf '%s\n' 'not-json: registry unavailable'
      exit 1
    fi
    printf '%s\n' '{"vulnerabilities":{}}'
    ;;
  dead)
    printf '%s\n' 'not-json: registry unavailable'
    exit 1
    ;;
  vulnerable)
    printf '%s\n' '{"vulnerabilities":{"evil-pkg":{"severity":"high","via":[{"url":"https://github.com/advisories/GHSA-9999-9999-9999"}]}}}'
    exit 1
    ;;
  bundled-ok|bundled-version-drift|bundled-project-scope|bundled-expired)
    printf '%s\n' '{"vulnerabilities":{"brace-expansion":{"name":"brace-expansion","severity":"high","via":[{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-q2hr-2g5m-vwhr"},{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-qhr7-859c-m2p7"},{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-6j4f-fj2g-mc7p"}],"nodes":["node_modules/aws-cdk-lib/node_modules/brace-expansion"]}}}'
    exit 1
    ;;
  bundled-nonbundled-node)
    printf '%s\n' '{"vulnerabilities":{"brace-expansion":{"name":"brace-expansion","severity":"high","via":[{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-q2hr-2g5m-vwhr"}],"nodes":["node_modules/brace-expansion"]}}}'
    exit 1
    ;;
  bundled-advisory-drift)
    printf '%s\n' '{"vulnerabilities":{"brace-expansion":{"name":"brace-expansion","severity":"high","via":[{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-q2hr-2g5m-vwhr"},{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-9999-9999-9999"}],"nodes":["node_modules/aws-cdk-lib/node_modules/brace-expansion"]}}}'
    exit 1
    ;;
  bundled-other-package)
    printf '%s\n' '{"vulnerabilities":{"minimatch":{"name":"minimatch","severity":"high","via":[{"name":"brace-expansion","url":"https://github.com/advisories/GHSA-q2hr-2g5m-vwhr"}],"nodes":["node_modules/aws-cdk-lib/node_modules/brace-expansion"]}}}'
    exit 1
    ;;
  *)
    echo "unknown FAKE_NPM_MODE ${FAKE_NPM_MODE}" >&2
    exit 1
    ;;
esac
SH
chmod +x "${bin_dir}/npm"

# Overwrite the scratch allowlist and the three scratch lockfiles so a scoped
# exception can be exercised against the exact bundled finding it targets.
write_allowlist() {
  printf '%s\n' "$1" > "${fake_root}/gov-infra/planning/facetheory-supply-chain-allowlist.txt"
}

write_bundled_locks() {
  local version="$1" project
  for project in ts infra/apptheory-ssr-site infra/apptheory-ssg-isr-site; do
    printf '{"name":"scratch","lockfileVersion":3,"packages":{"node_modules/aws-cdk-lib/node_modules/brace-expansion":{"version":"%s","inBundle":true}}}\n' \
      "${version}" > "${fake_root}/${project}/package-lock.json"
  done
}

run_gate() {
  local mode="$1"
  set +e
  FAKE_NPM_STATE="${tmpdir}/${mode}.count" \
  FAKE_NPM_MODE="${mode}" \
  PATH="${bin_dir}:${PATH}" \
  FACETHEORY_NPM_AUDIT_ATTEMPTS="3" \
  FACETHEORY_NPM_AUDIT_BACKOFF_SECONDS="0" \
  bash "${fake_root}/scripts/verify-npm-audit.sh" > "${tmpdir}/${mode}.out" 2> "${tmpdir}/${mode}.err"
  local status=$?
  set -e
  printf '%s\n' "${status}"
}

# (a) A registry blip is retried and the gate still passes on the retry.
status="$(run_gate flaky)"
[[ "${status}" == "0" ]] || fail "flaky registry should pass after one retry, got status ${status}"
grep -Fq 'npm-audit: PASS (ts)' "${tmpdir}/flaky.out" ||
  fail "flaky registry did not report a passing audit"
grep -Fq 'npm-audit: retry (ts)' "${tmpdir}/flaky.err" ||
  fail "flaky registry did not report a retry"
[[ "$(cat "${tmpdir}/flaky.count-ts")" == "2" ]] ||
  fail "flaky registry should take exactly 2 attempts for ts, got $(cat "${tmpdir}/flaky.count-ts")"

# (b) A registry that never answers is bounded and fails closed.
status="$(run_gate dead)"
[[ "${status}" != "0" ]] || fail "a dead registry must fail the gate closed"
grep -Fq 'npm-audit: FAIL (ts) no usable audit report after 3 attempt(s)' "${tmpdir}/dead.err" ||
  fail "dead registry did not report a bounded, failing audit"
[[ "$(cat "${tmpdir}/dead.count-ts")" == "3" ]] ||
  fail "dead registry should be attempted exactly 3 times for ts, got $(cat "${tmpdir}/dead.count-ts")"

# (c) A real finding still fails, and a usable report is never retried.
status="$(run_gate vulnerable)"
[[ "${status}" != "0" ]] || fail "a non-allowlisted finding must fail the gate"
grep -Fq 'npm-audit: FAIL (ts)' "${tmpdir}/vulnerable.err" ||
  fail "non-allowlisted finding did not report a failing audit"
grep -Fq 'evil-pkg' "${tmpdir}/vulnerable.err" ||
  fail "non-allowlisted finding was not named in the failure"
[[ "$(cat "${tmpdir}/vulnerable.count-ts")" == "1" ]] ||
  fail "a usable audit report must not be retried, got $(cat "${tmpdir}/vulnerable.count-ts") attempts"

# (d) A scoped, self-expiring exception allows ONLY the exact bundled finding.
scoped_prefix='allow ids=GHSA-q2hr-2g5m-vwhr,GHSA-qhr7-859c-m2p7,GHSA-6j4f-fj2g-mc7p package=brace-expansion version=5.0.9 nodes=node_modules/aws-cdk-lib/node_modules/brace-expansion'
all_projects='ts,infra/apptheory-ssr-site,infra/apptheory-ssg-isr-site'

write_allowlist "${scoped_prefix} projects=${all_projects} expires=2999-01-01"
write_bundled_locks 5.0.9
status="$(run_gate bundled-ok)"
[[ "${status}" == "0" ]] || fail "scoped exception should allow the exact bundled finding, got status ${status}"
grep -Fq 'npm-audit: ALLOW (ts) brace-expansion' "${tmpdir}/bundled-ok.out" ||
  fail "scoped pass did not report the ts allowance"
grep -Fq 'scoped exception, expires 2999-01-01' "${tmpdir}/bundled-ok.out" ||
  fail "scoped pass did not identify the scoped exception"

# (e) A bundled copy at a different installed version is NOT covered.
write_bundled_locks 5.0.11
status="$(run_gate bundled-version-drift)"
[[ "${status}" != "0" ]] || fail "a different bundled version must fail the scoped exception"
grep -Fq 'npm-audit: FAIL (ts)' "${tmpdir}/bundled-version-drift.err" ||
  fail "version drift did not fail the gate"

# (f) A non-bundled copy is NOT covered.
write_bundled_locks 5.0.9
status="$(run_gate bundled-nonbundled-node)"
[[ "${status}" != "0" ]] || fail "a non-bundled node path must fail the scoped exception"

# (g) An advisory id outside the exception's set is NOT covered.
status="$(run_gate bundled-advisory-drift)"
[[ "${status}" != "0" ]] || fail "an unlisted advisory id must fail the scoped exception"

# (h) A different package is NOT covered.
status="$(run_gate bundled-other-package)"
[[ "${status}" != "0" ]] || fail "another package must fail the scoped exception"

# (i) A project outside the exception's project list is NOT covered.
write_allowlist "${scoped_prefix} projects=ts expires=2999-01-01"
write_bundled_locks 5.0.9
status="$(run_gate bundled-project-scope)"
[[ "${status}" != "0" ]] || fail "a project outside the scoped projects must fail"
grep -Fq 'npm-audit: ALLOW (ts) brace-expansion' "${tmpdir}/bundled-project-scope.out" ||
  fail "the in-scope project should have been allowed"
grep -Fq 'npm-audit: FAIL (infra/apptheory-ssr-site)' "${tmpdir}/bundled-project-scope.err" ||
  fail "the out-of-scope project should have failed"

# (j) An expired exception is ignored.
write_allowlist "${scoped_prefix} projects=${all_projects} expires=2020-01-01"
write_bundled_locks 5.0.9
status="$(run_gate bundled-expired)"
[[ "${status}" != "0" ]] || fail "an expired scoped exception must fail the gate"
grep -Fq 'npm-audit: FAIL (ts)' "${tmpdir}/bundled-expired.err" ||
  fail "expired exception did not fail the gate"

echo "test-verify-npm-audit: PASS"
