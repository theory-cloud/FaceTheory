#!/usr/bin/env bash
#
# verify-svelte-runes.sh
#
# Structural gate: fail if any Svelte component under ts/src/ still uses legacy
# (Svelte 4) authoring syntax. FaceTheory requires svelte >=5.55.7 (see item 47)
# and every bundled Stitch/responsive-primitive component is authored with
# Svelte 5 runes. This gate prevents legacy syntax from regressing back in.
#
# Forbidden constructs (Svelte 5 replacement in parentheses):
#   export let      -> $props()
#   $: reactive     -> $derived / $derived.by ($effect only for client effects)
#   <slot>          -> snippets + {@render}
#   $$slots         -> snippet-prop presence checks
#   $$restProps     -> ...rest of $props()
#   on:event=       -> onevent= event attributes
#
# Runnable standalone: `bash ts/scripts/verify-svelte-runes.sh`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "${SCRIPT_DIR}/../src" && pwd)"

usage() {
  cat <<'USAGE'
Usage: bash ts/scripts/verify-svelte-runes.sh [--self-test]

Without arguments, verifies every *.svelte component under ts/src uses Svelte 5
runes-only authoring. With --self-test, runs committed positive and negative
fixtures against the verifier itself so the gate proves it fails closed.
USAGE
}

report() {
  local label="$1" pattern="$2" matches grep_status
  shift 2

  set +e
  matches="$(grep -nHE -- "$pattern" "$@" 2>&1)"
  grep_status=$?
  set -e

  if [ "$grep_status" -eq 0 ]; then
    echo "✖ Legacy Svelte syntax found — ${label}:"
    echo "$matches"
    echo ""
    return 1
  fi

  if [ "$grep_status" -gt 1 ]; then
    echo "✖ verify-svelte-runes: grep failed while checking ${label}:"
    echo "$matches"
    echo ""
    return 1
  fi

  return 0
}

verify_svelte_runes_dir() {
  local src_dir="$1"
  local -a svelte_files=()
  local file status=0

  if [ ! -d "$src_dir" ]; then
    echo "✖ verify-svelte-runes: source directory not found: ${src_dir}"
    return 1
  fi

  while IFS= read -r -d '' file; do
    svelte_files+=("$file")
  done < <(find "$src_dir" -type f -name '*.svelte' -print0 | sort -z)

  if [ "${#svelte_files[@]}" -eq 0 ]; then
    echo "✖ verify-svelte-runes: no .svelte files found under ${src_dir}; failing closed."
    return 1
  fi

  report "use \$props() instead of 'export let'" 'export[[:space:]]+let[[:space:]]' "${svelte_files[@]}" || status=1
  report "use \$derived/\$effect instead of '\$:' reactive statements" '^[[:space:]]*\$:' "${svelte_files[@]}" || status=1
  report "use snippets + {@render} instead of <slot>" '<slot[[:space:]/>]' "${svelte_files[@]}" || status=1
  report "use snippet-prop presence checks instead of \$\$slots" '\$\$slots' "${svelte_files[@]}" || status=1
  report "use ...rest of \$props() instead of \$\$restProps" '\$\$restProps' "${svelte_files[@]}" || status=1
  # Trailing [=|] keeps CSS values (text-decoration:none, flex-direction:column)
  # from being mistaken for on:none / on:column event directives.
  report "use onevent= attributes instead of 'on:' directives" 'on:[a-zA-Z]+[=|]' "${svelte_files[@]}" || status=1

  if [ "$status" -ne 0 ]; then
    echo "Svelte components under ${src_dir} must use Svelte 5 runes only (FaceTheory requires svelte >=5.55.7)."
    return 1
  fi

  echo "✓ verify-svelte-runes: all Svelte components under ${src_dir} use Svelte 5 runes (no legacy syntax)."
}

run_self_test() {
  local tmp_dir clean_dir output self_status=0

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/facetheory-svelte-runes-self-test.XXXXXX")"
  FACETHEORY_SVELTE_RUNES_SELF_TEST_TMP_DIR="$tmp_dir"
  trap 'rm -rf -- "$FACETHEORY_SVELTE_RUNES_SELF_TEST_TMP_DIR"' EXIT

  write_fixture() {
    local dir="$1" content="$2"
    mkdir -p "$dir"
    printf '%s\n' "$content" >"${dir}/Fixture.svelte"
  }

  fail_self_test() {
    local message="$1"
    echo "✖ verify-svelte-runes self-test: ${message}"
    if [ "${2:-}" != "" ]; then
      echo "$2"
    fi
    self_status=1
  }

  expect_failure() {
    local name="$1" expected="$2" content="$3" dir
    dir="${tmp_dir}/${name}"
    write_fixture "$dir" "$content"
    if output="$(verify_svelte_runes_dir "$dir" 2>&1)"; then
      fail_self_test "expected ${name} fixture to fail"
      return
    fi
    if ! grep -Fq -- "$expected" <<<"$output"; then
      fail_self_test "expected ${name} failure to mention '${expected}'" "$output"
    fi
  }

  expect_failure_dir() {
    local name="$1" expected="$2" dir="$3"
    if output="$(verify_svelte_runes_dir "$dir" 2>&1)"; then
      fail_self_test "expected ${name} to fail"
      return
    fi
    if ! grep -Fq -- "$expected" <<<"$output"; then
      fail_self_test "expected ${name} failure to mention '${expected}'" "$output"
    fi
  }

  clean_dir="${tmp_dir}/clean"
  mkdir -p "$clean_dir"
  cat >"${clean_dir}/RunesOnly.svelte" <<'SVELTE'
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    onclick,
  }: {
    children?: Snippet;
    onclick?: () => void;
  } = $props();

  const label = $derived('Runes only');
</script>

<button {onclick} style="text-decoration:none; flex-direction:column">
  {label}
  {@render children?.()}
</button>
SVELTE
  if ! output="$(verify_svelte_runes_dir "$clean_dir" 2>&1)"; then
    fail_self_test "expected clean runes fixture to pass" "$output"
  fi

  expect_failure "legacy-export-let" "export let" $'<script>\n  export let label = \'legacy\';\n</script>\n<p>{label}</p>'
  expect_failure "legacy-reactive-label" "\$:" $'<script>\n  let count = 1;\n  $: doubled = count * 2;\n</script>\n<p>{doubled}</p>'
  expect_failure "legacy-slot" "<slot>" $'<article>\n  <slot name="actions" />\n</article>'
  expect_failure "legacy-slots-object" "\$\$slots" $'<script>\n  const hasActions = Boolean($$slots.actions);\n</script>\n{#if hasActions}<p>Actions</p>{/if}'
  expect_failure "legacy-rest-props" "\$\$restProps" $'<script>\n  const props = $$restProps;\n</script>\n<div {...props}>Legacy rest</div>'
  expect_failure "legacy-on-directive" "on:" $'<button on:click={() => undefined}>Legacy event</button>'

  mkdir -p "${tmp_dir}/empty"
  expect_failure_dir "empty source tree" "no .svelte files found" "${tmp_dir}/empty"
  expect_failure_dir "missing source tree" "source directory not found" "${tmp_dir}/missing"

  if [ "$self_status" -ne 0 ]; then
    rm -rf -- "$tmp_dir"
    unset FACETHEORY_SVELTE_RUNES_SELF_TEST_TMP_DIR
    trap - EXIT
    return 1
  fi

  rm -rf -- "$tmp_dir"
  unset FACETHEORY_SVELTE_RUNES_SELF_TEST_TMP_DIR
  trap - EXIT
  echo "✓ verify-svelte-runes self-test: pass fixture, all legacy syntax failures, and fail-closed source discovery are covered."
}

case "${1:-}" in
  "")
    verify_svelte_runes_dir "$SRC_DIR"
    ;;
  --self-test)
    run_self_test
    ;;
  -h | --help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
