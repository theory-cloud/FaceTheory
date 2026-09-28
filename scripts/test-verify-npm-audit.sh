#!/usr/bin/env bash
# Purpose: prove the npm-audit security gate (a) retries only unusable registry
# results, (b) stays bounded and fails closed when the registry never answers,
# and (c) still fails on a real, non-allowlisted finding without retrying.
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
  *)
    echo "unknown FAKE_NPM_MODE ${FAKE_NPM_MODE}" >&2
    exit 1
    ;;
esac
SH
chmod +x "${bin_dir}/npm"

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

echo "test-verify-npm-audit: PASS"
