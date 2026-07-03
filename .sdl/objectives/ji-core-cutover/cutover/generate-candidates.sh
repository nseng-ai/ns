#!/usr/bin/env bash
# Deterministic candidate-list generator for the sdl→ji core cutover.
# Re-runnable: the landing-window drift re-check re-runs this and diffs the
# per-surface lists. Run from the repo root. Output dir = $1 (default ./cutover-lists).
#
# Post-mv variant (after `git mv .sdl .ji`): pass --post-mv to swap the two
# objectives pathspecs and the G7 allowlist path.
set -euo pipefail

OUT="${1:?usage: generate-candidates.sh <output-dir> [--post-mv]}"
MODE="pre-mv"
[[ "${2:-}" == "--post-mv" ]] && MODE="post-mv"
mkdir -p "$OUT"

if [[ "$MODE" == "post-mv" ]]; then
  OBJ_ROOT=".ji"
else
  OBJ_ROOT=".sdl"
fi

EXCL=(
  ":!ts/pnpm-lock.yaml"
  ":!${OBJ_ROOT}/objectives"
  ":!${OBJ_ROOT}/objective-archive"
  ":!*/updates/*"
  ":!docs/adr"
)

# G1: literal .sdl path fragments (structurally never matches @sdl/, src/sdl/, sdlcc, sdl-tools)
git grep -lI -e '\.sdl' -- . "${EXCL[@]}" | sort -u > "$OUT/g1-dot-sdl.txt" || true
# G2: sdl.toml config filename
git grep -lI -e 'sdl\.toml' -- . "${EXCL[@]}" | sort -u > "$OUT/g2-toml.txt" || true
# G3: exact quoted "sdl" / 'sdl' (bin argv, manifest key, XDG segment, cliName)
git grep -lIE '"sdl"|'"'"'sdl'"'"'' -- . "${EXCL[@]}" | sort -u > "$OUT/g3-quoted.txt" || true
# G4: sdl: namespace (slash commands, machine keys); (^|[/"`space]) guard keeps @sdl/pi etc. out
git grep -lIE '(^|[/"`[:space:]])sdl:[a-z]' -- . "${EXCL[@]}" | sort -u > "$OUT/g4-namespace.txt" || true
# G5: XDG namespace segments + slot paths (incl. `share/` data dir and
#     regex-escaped `sdl\/slots` — worktrees.ts hides its literal behind escaping)
git grep -lIE '(state|data|config|tmp|share)/sdl([/"`[:space:]]|$)|sdl(\\)?/slots|~/\.sdl' -- . "${EXCL[@]}" | sort -u > "$OUT/g5-xdg.txt" || true
# G6: `sdl <command-group>` instruction lines (never matches sdl-flow, sdl-tools, @sdl/)
git grep -lIE '(^|[^@A-Za-z0-9/_-])sdl (objective|flow|handoff|address|aretro|roaster|branch-context|slot|exec|init|list|areg|--)' -- . "${EXCL[@]}" | sort -u > "$OUT/g6-cmd-lines.txt" || true
# G8: unquoted TS object keys / property accesses (`sdl: {`, `sdl?: `, `parsed.sdl`,
#     handled by G1's \.sdl) and diagnostic codes (`extension_manifest_missing_sdl`,
#     `missing-sdl`). Over-inclusion is fine (classifier skips); under-inclusion is not.
git grep -lIE '(^|[^@A-Za-z0-9_/-])sdl\??[[:space:]]*:|[-_]sdl([^a-zA-Z0-9-]|$)' -- . "${EXCL[@]}" | sort -u > "$OUT/g8-keys-codes.txt" || true
# G9: SDL_ env vars, brand-prefixed filename strings ("sdl-…"), dotted manifest-key
#     prose (sdl.tier), and prose "… sdl." sentence-enders ("completion setup for sdl.")
git grep -lIE 'SDL_[A-Z]|["'"'"'`]sdl-|sdl\.(tier|commands|group|subpackages|extensions)|[[:space:]]sdl\.([[:space:]]|$)' -- . "${EXCL[@]}" | sort -u > "$OUT/g9-env-brand.txt" || true
# G10: bin-facing assertion/prose strings — quoted strings STARTING "sdl ", Usage
#      lines, and `bin sdl` chains (caught node-runtime-cli.test.ts, which G1-G9 missed)
git grep -lIE 'Usage: sdl|["'"'"'`]sdl |bin sdl' -- . "${EXCL[@]}" | sort -u > "$OUT/g10-bin-prose.txt" || true
# G11: snake_case sdl_* machine-code string literals (diagnostic codes, marker keys:
#      sdl_extension_contribution_import_failed, sdl_toml_invalid, sdl_reviewer_marker)
#      plus the HTML-comment marker "<!-- sdl-reviewer:". Added after dry-run 1:
#      kernel/src/extensions/loader.ts escaped G1-G10 entirely via this family.
git grep -lIE '["'"'"'`]sdl_[a-z_]+|<!-- sdl-' -- . "${EXCL[@]}" | sort -u > "$OUT/g11-snake-codes.txt" || true
# G7: explicit allowlist (files inside excluded trees that ARE in the window)
{
  echo "docs/adr/0005-additive-plan-vocabulary.md"
  echo "${OBJ_ROOT}/objectives/cross-harness-parity/parity-table.md"
} | sort -u > "$OUT/g7-allowlist.txt"

cat "$OUT"/g[0-9]*-*.txt | sort -u > "$OUT/candidates.txt"

# Baselines: out-of-window survivors that must be UNCHANGED post-run.
# Dry-run-1 corrections: exclude the objectives trees (the pipeline's own artifacts
# mention @sdl/ and inflated the count), and drop XDG-context '/sdl/extensions'
# lines from the src-dir count (those are IN-window renames, not survivors).
git grep -lI -e '@sdl/' -- . ':!ts/pnpm-lock.yaml' ":!${OBJ_ROOT}/objectives" ":!${OBJ_ROOT}/objective-archive" | wc -l | tr -d ' ' > "$OUT/baseline-atsdl-filecount.txt"
git grep -nIE 'src/sdl|/sdl/(commands|extension)' -- ts 2>/dev/null | grep -vE '(state|data|config|share|XDG_[A-Z_]+_HOME)/sdl' | wc -l | tr -d ' ' > "$OUT/baseline-srcsdl-occurrences.txt"

echo "mode=$MODE"
for f in "$OUT"/g[0-9]*-*.txt; do printf '%-24s %s\n' "$(basename "$f")" "$(wc -l < "$f" | tr -d ' ')"; done
printf '%-24s %s\n' "candidates.txt" "$(wc -l < "$OUT/candidates.txt" | tr -d ' ')"
printf '%-24s %s\n' "baseline @sdl/ files" "$(cat "$OUT/baseline-atsdl-filecount.txt")"
printf '%-24s %s\n' "baseline src/sdl occ" "$(cat "$OUT/baseline-srcsdl-occurrences.txt")"
