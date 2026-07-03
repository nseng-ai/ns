#!/usr/bin/env bash
# Deterministic candidate-list generator for the ji→ns core cutover.
# Re-instantiated from .ji/objectives/ji-core-cutover/cutover/generate-candidates.sh
# (the sdl→ji pipeline). Re-runnable: the landing-window drift re-check re-runs this
# and diffs the per-surface lists. Run from the repo root.
# Output dir = $1 (default ./cutover-lists).
#
# Post-mv variant (after `git mv .ji .ns`): pass --post-mv to swap the objectives
# pathspecs and the G7 allowlist path.
#
# NOTE (ns instance): every pattern is an ANCHORED ji form. `ns` is never searched
# for (collision register: too common a token). `ji.toml` (G2) and manifest-key
# reads are PHASE-TWO surfaces — they stay candidates so the classifier can route
# them to the `phase-two-surface` skip bucket (audited against PR-5 targets).
set -euo pipefail

OUT="${1:?usage: generate-candidates.sh <output-dir> [--post-mv]}"
MODE="pre-mv"
[[ "${2:-}" == "--post-mv" ]] && MODE="post-mv"
mkdir -p "$OUT"

if [[ "$MODE" == "post-mv" ]]; then
  OBJ_ROOT=".ns"
else
  OBJ_ROOT=".ji"
fi

EXCL=(
  ":!ts/pnpm-lock.yaml"
  ":!${OBJ_ROOT}/objectives"
  ":!${OBJ_ROOT}/objective-archive"
  ":!*/updates/*"
  ":!docs/adr"
  ":!docs/ji-naming-brief.md"
)

# G1: literal .ji path fragments (.ji/objectives, .ji/extensions, .ji-workspace-ready
#     stamp, property reads `.ji.tier`). Structurally never matches @ji/, src/ji,
#     jicc, ji-flow. Property-access hits (`manifest.ji`) are phase-two-surface —
#     classifier routes them to skip.
git grep -lI -e '\.ji' -- . "${EXCL[@]}" | sort -u > "$OUT/g1-dot-ji.txt" || true
# G2: ji.toml config filename — PHASE-TWO SURFACE (PR-5 renames ji.toml→ns.toml).
#     Emitted so files whose only hit is ji.toml get a skip:phase-two-surface
#     decision that the PR-5 audit can reconcile.
git grep -lI -e 'ji\.toml' -- . "${EXCL[@]}" | sort -u > "$OUT/g2-toml.txt" || true
# G3: exact quoted "ji" / 'ji' (bin argv, commandName, XDG segment, typed command
#     literals). The package.json manifest KEY "ji": is phase-two — classifier skips.
git grep -lIE '"ji"|'"'"'ji'"'"'' -- . "${EXCL[@]}" | sort -u > "$OUT/g3-quoted.txt" || true
# G4: ji: namespace (slash commands /ji:*, machine keys ji:flow:*, pi event key);
#     (^|[/"`space]) guard keeps @ji/pi etc. out
git grep -lIE '(^|[/"`[:space:]])ji:[a-z]' -- . "${EXCL[@]}" | sort -u > "$OUT/g4-namespace.txt" || true
# G5: XDG namespace segments + slot paths (incl. `share/` data dir, regex-escaped
#     `ji\/slots` — worktrees.ts hides its literal behind escaping — and the `-`
#     char-class member that catches /tmp/ji-directive-style brand paths)
git grep -lIE '(state|data|config|tmp|share)/ji([/"`[:space:]-]|$)|ji(\\)?/slots|~/\.ji' -- . "${EXCL[@]}" | sort -u > "$OUT/g5-xdg.txt" || true
# G6: `ji <subcommand>` instruction lines. Alternation re-derived from LIVE
#     `ji --help` 2026-07-03: extensions address aretro branch-context flow handoff
#     objective roaster slot + built-ins shell completion, plus `ji --`.
#     Never matches ji-flow, jicc, @ji/.
git grep -lIE '(^|[^@A-Za-z0-9/_-])ji (address|aretro|branch-context|flow|handoff|objective|roaster|slot|shell|completion|--)' -- . "${EXCL[@]}" | sort -u > "$OUT/g6-cmd-lines.txt" || true
# G8: JI_* env var names (JI_CHECKPOINT_MODEL, JI_CD_DIRECTIVE_FILE, JI_TS_BAN_*,
#     justfile JI_TOOL family, JI_KERNEL_DISABLE_FIRST_PARTY_EXTENSIONS, …)
git grep -lIE 'JI_[A-Z]' -- . "${EXCL[@]}" | sort -u > "$OUT/g8-env-vars.txt" || true
# G9: brand-prefixed ji-* names in strings and paths: quoted "ji-…" (tmpdir
#     prefixes, "ji-pi-cli-command-extension.jsonl", marker keys) and /ji-…
#     (skills/ji-flow-*, /tmp/ji-directive). The `/` alternative also catches the
#     skills-lock.json + .pi/settings.json `skills/ji-flow-*` entries.
git grep -lIE '["'"'"'`/]ji-' -- . "${EXCL[@]}" | sort -u > "$OUT/g9-brand-prefix.txt" || true
# G10: bin-facing assertion/prose strings — Usage lines, quoted strings STARTING
#      "ji " or backticked `ji …`, and `bin ji` chains
git grep -lIE 'Usage: ji|["'"'"'`]ji |bin ji' -- . "${EXCL[@]}" | sort -u > "$OUT/g10-bin-prose.txt" || true
# G11: snake_case ji_* machine-code string literals (ji_extension_contribution_import_failed,
#      ji_reviewer_marker; ji_toml_invalid is phase-two — classifier skips) plus the
#      HTML-comment marker "<!-- ji-" (PR-comment reviewer/description markers)
git grep -lIE '["'"'"'`]ji_[a-z_]+|<!-- ji-' -- . "${EXCL[@]}" | sort -u > "$OUT/g11-snake-codes.txt" || true
# G12 (NEW this instance): refs/ji git ref namespace (flow-land backup refs,
#      flow/src/land/stack/constants.ts:13-14, ccc land-command.test.ts fixtures)
git grep -lIE 'refs/ji' -- . "${EXCL[@]}" | sort -u > "$OUT/g12-refs.txt" || true
# G13 (NEW this instance): zshrc sentinel markers "# >>> ji shell integration >>>"
#      and their install prose (kernel/src/cli/shell.ts:17-18 + the slot extension's
#      re-hardcoded duplicate + READMEs + asserting tests)
git grep -lIE 'ji shell integration' -- . "${EXCL[@]}" | sort -u > "$OUT/g13-shell-integration.txt" || true
# G7: explicit allowlist — two classes:
#   (a) in-window files inside excluded trees (the live parity table);
#   (b) pattern-blind in-window files: cs8 repo-identity targets carry NO ji token
#       (they are sdl-era leftovers: "# SDL", "# sdl", repo: "sdl-tools"), and the
#       cs2 identifier-rename importers' only hit is the SDL_CD_DIRECTIVE_FILE
#       identifier (renames with cd-directive.ts:7 in one edit).
#   (c) the mv-only bracket file .pi/extensions/ji.ts (content is all phase-two
#       survivors — an @ji/flow import — so no anchored pattern matches it; listed
#       so prepass's mv-only subtraction stays total).
{
  echo "${OBJ_ROOT}/objectives/cross-harness-parity/parity-table.md"
  echo "CLAUDE.md"
  echo "README.md"
  echo "docs-site/lib/geistdocs/nav.ts"
  echo "ts/packages/capabilities/slot/src/core/index.ts"
  echo "ts/packages/capabilities/slot/test/unit/api.test.ts"
  echo ".pi/extensions/ji.ts"
} | sort -u > "$OUT/g7-allowlist.txt"

cat "$OUT"/g[0-9]*-*.txt | sort -u > "$OUT/candidates.txt"

# Baselines: PHASE-TWO INPUT that must be byte-identical after PR-4 (roles inverted
# vs the sdl→ji instance: these freeze what the internal sweep will consume).
git grep -lI -e '@ji/' -- . ':!ts/pnpm-lock.yaml' ":!${OBJ_ROOT}/objectives" ":!${OBJ_ROOT}/objective-archive" | wc -l | tr -d ' ' > "$OUT/baseline-atji-filecount.txt"
git grep -nIE 'src/ji|/ji/(commands|extension)' -- ts 2>/dev/null | grep -vE '(state|data|config|share|XDG_[A-Z_]+_HOME)/ji' | wc -l | tr -d ' ' > "$OUT/baseline-srcji-occurrences.txt"
git ls-files | grep -cE '(^|/)ji\.toml$' | tr -d ' ' > "$OUT/baseline-jitoml-filecount.txt" || echo 0 > "$OUT/baseline-jitoml-filecount.txt"
git grep -lE '"ji": \{' -- '**/package.json' | wc -l | tr -d ' ' > "$OUT/baseline-manifestkey-filecount.txt"

echo "mode=$MODE"
for f in "$OUT"/g[0-9]*-*.txt; do printf '%-28s %s\n' "$(basename "$f")" "$(wc -l < "$f" | tr -d ' ')"; done
printf '%-28s %s\n' "candidates.txt" "$(wc -l < "$OUT/candidates.txt" | tr -d ' ')"
printf '%-28s %s\n' "baseline @ji/ files" "$(cat "$OUT/baseline-atji-filecount.txt")"
printf '%-28s %s\n' "baseline src/ji occ" "$(cat "$OUT/baseline-srcji-occurrences.txt")"
printf '%-28s %s\n' "baseline ji.toml files" "$(cat "$OUT/baseline-jitoml-filecount.txt")"
printf '%-28s %s\n' "baseline manifest-key files" "$(cat "$OUT/baseline-manifestkey-filecount.txt")"
