#!/usr/bin/env bash
# Purpose: prove the install-hardening guard fails closed on the bypass form
# reproduced in review (SAN-FW503-F2: the required flag hidden behind a shell
# `#` comment) and on a second, unprotected install later on the same line.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-ci-install-hardening.sh"

fail() {
  echo "test-verify-ci-install-hardening: FAIL ($*)" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

root="${tmpdir}/root"
mkdir -p "${root}/.github/workflows" "${root}/scripts"
cp "${guard}" "${root}/scripts/verify-ci-install-hardening.sh"
cp "${repo_root}/.github/workflows/pages.yml" "${root}/.github/workflows/pages.yml"
printf 'all:\n\t@true\n' > "${root}/Makefile"

write_probe() {
  cat > "${root}/.github/workflows/probe.yml" <<YAML
jobs:
  probe:
    steps:
      - run: ${1}
YAML
}

run_guard() {
  set +e
  bash "${root}/scripts/verify-ci-install-hardening.sh" > "${tmpdir}/out" 2>&1
  local status=$?
  set -e
  printf '%s' "${status}"
}

expect_pass() {
  local label="$1"
  local status
  status="$(run_guard)"
  if [[ "${status}" != "0" ]]; then
    cat "${tmpdir}/out" >&2
    fail "${label}: guard must PASS"
  fi
}

expect_fail() {
  local label="$1"
  local status
  status="$(run_guard)"
  if [[ "${status}" == "0" ]]; then
    cat "${tmpdir}/out" >&2
    fail "${label}: guard must FAIL"
  fi
}

# Baseline: a hardened install passes.
write_probe "cd ts && npm ci --ignore-scripts"
expect_pass "hardened npm ci"

# SAN-FW503-F2: the flag lives only in a shell comment, so npm runs with scripts
# enabled. The guard must read the command, not the whole line.
write_probe "cd ts && npm ci # --ignore-scripts"
expect_fail "flag hidden behind a shell comment"

# ADV-503-R0-01: a second install later on the line is unprotected even though
# the first one carries the flag.
write_probe "npm ci --ignore-scripts && npm ci"
expect_fail "second unprotected install after &&"

# Controls: the plain regression and the unfrozen Ruby install still fail.
write_probe "cd ts && npm ci"
expect_fail "bare npm ci"

write_probe "bundle install"
expect_fail "unfrozen bundle install"

write_probe "bundle install --deployment"
expect_pass "deployment-frozen bundle install"

# The deprecated flag's replacement, the frozen setting, is the form the docs
# deploy now uses: an assignment on the same simple command freezes that run.
write_probe "BUNDLE_FROZEN=true bundle install"
expect_pass "frozen setting on the bundle install command"

# A falsy or empty setting is not a freeze; the guard must not credit it.
write_probe "BUNDLE_FROZEN=false bundle install"
expect_fail "falsy frozen setting"

write_probe "BUNDLE_FROZEN= bundle install"
expect_fail "empty frozen setting"

# ADV-503-R0-01: an npx-prefixed install is still an unprotected install.
write_probe "npx npm ci"
expect_fail "npx-prefixed unprotected npm ci"

write_probe "cd ts && npm ci --ignore-scripts"
expect_pass "restored hardened npm ci"

# Row 25: an escaped quote leaves the double-quoted string open, so the `#`
# after it stays inside the string and the trailing install must still be read.
write_probe 'echo "literal \" # quoted" && cd ts && npm ci'
expect_fail "escaped quote masks an unprotected npm ci"

# Ordinary control: the same escaped-quote line with a hardened install passes.
write_probe 'echo "literal \" # quoted" && cd ts && npm ci --ignore-scripts'
expect_pass "escaped quote with hardened npm ci"

echo "test-verify-ci-install-hardening: PASS"
