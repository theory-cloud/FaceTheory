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

status=0

report() {
  local label="$1" pattern="$2" matches
  # `|| true` so grep's "no match" exit 1 does not trip `set -e`.
  matches="$(grep -rnE "$pattern" "$SRC_DIR" --include='*.svelte' || true)"
  if [ -n "$matches" ]; then
    echo "✖ Legacy Svelte syntax found — ${label}:"
    echo "$matches"
    echo ""
    status=1
  fi
}

report "use \$props() instead of 'export let'" 'export[[:space:]]+let[[:space:]]'
report "use \$derived/\$effect instead of '\$:' reactive statements" '^[[:space:]]*\$:'
report "use snippets + {@render} instead of <slot>" '<slot[[:space:]/>]'
report "use snippet-prop presence checks instead of \$\$slots" '\$\$slots'
report "use ...rest of \$props() instead of \$\$restProps" '\$\$restProps'
# Trailing [=|] keeps CSS values (text-decoration:none, flex-direction:column)
# from being mistaken for on:none / on:column event directives.
report "use onevent= attributes instead of 'on:' directives" 'on:[a-zA-Z]+[=|]'

if [ "$status" -ne 0 ]; then
  echo "Svelte components under src/ must use Svelte 5 runes only (FaceTheory requires svelte >=5.55.7)."
  exit 1
fi

echo "✓ verify-svelte-runes: all Svelte components under src/ use Svelte 5 runes (no legacy syntax)."
