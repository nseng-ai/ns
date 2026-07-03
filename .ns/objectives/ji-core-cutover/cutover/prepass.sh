#!/usr/bin/env bash
# Pre-pass: subtract anchored files from candidates, auto-bucket by path rule,
# emit the residue needing agent classification + per-file grep evidence.
# Run from repo root. $1 = cutover scratch dir.
set -euo pipefail
DIR="$1"
L="$DIR/lists"

jq -r '.changesets[].files[]' "$DIR/anchors.json" | sort -u > "$L/anchored-changeset.txt"
jq -r '.simpleAnchors | keys[]' "$DIR/anchors.json" | sort -u > "$L/anchored-simple.txt"
# tree-level mvs (.sdl, sdl.toml) are not per-file candidates; only file-level mv-only entries subtract
jq -r '.mvOnly | keys[] | select(. != "comment" and . != ".sdl" and . != "sdl.toml")' "$DIR/anchors.json" | sort -u > "$L/anchored-mvonly.txt"
cat "$L/anchored-changeset.txt" "$L/anchored-simple.txt" "$L/anchored-mvonly.txt" | sort -u > "$L/anchored-all.txt"

# Sanity: anchored files that are NOT candidates (would mean anchor typo or dead inventory claim)
comm -23 "$L/anchored-all.txt" "$L/candidates.txt" > "$L/anchored-not-candidate.txt"

# Unanchored candidates
comm -23 "$L/candidates.txt" "$L/anchored-all.txt" > "$L/unanchored.txt"

# Path-rule auto-buckets over the unanchored set
grep -E '^skills/.*\.md$' "$L/unanchored.txt" > "$L/auto-skills.txt" || true
grep -E '^docs/|(^|/)(CONTEXT|README|AGENTS|TESTING|CONTEXT-MAP)\.md$' "$L/unanchored.txt" | grep -v '^skills/' > "$L/auto-docs.txt" || true
grep -E '^\.sdl/' "$L/unanchored.txt" > "$L/auto-dottree.txt" || true
grep -E '^ts/.*/(test|tests)/.*\.(ts|tsx)$' "$L/unanchored.txt" > "$L/auto-tests.txt" || true
cat "$L"/auto-*.txt | sort -u > "$L/auto-all.txt"
comm -23 "$L/unanchored.txt" "$L/auto-all.txt" > "$L/needs-classification.txt"

# Evidence pack: match lines per needs-classification file (all generator patterns)
: > "$L/evidence.txt"
while IFS= read -r f; do
  {
    echo "### $f"
    git grep -nIE '\.sdl|sdl\.toml|"sdl"|'"'"'sdl'"'"'|(^|[/"`[:space:]])sdl:[a-z]|(state|data|config|tmp|share)/sdl([/"`[:space:]]|$)|sdl(\\)?/slots|~/\.sdl|(^|[^@A-Za-z0-9/_-])sdl (objective|flow|handoff|address|aretro|roaster|branch-context|slot|exec|init|list|areg|--)|(^|[^@A-Za-z0-9_/-])sdl\??[[:space:]]*:|[-_]sdl([^a-zA-Z0-9-]|$)|SDL_[A-Z]|["'"'"'`]sdl-|sdl\.(tier|commands|group|subpackages|extensions)|[[:space:]]sdl\.([[:space:]]|$)|Usage: sdl|["'"'"'`]sdl |bin sdl' -- "$f" | head -30 || true
    echo
  } >> "$L/evidence.txt"
done < "$L/needs-classification.txt"

echo "anchored-changeset   $(wc -l < "$L/anchored-changeset.txt" | tr -d ' ')"
echo "anchored-simple      $(wc -l < "$L/anchored-simple.txt" | tr -d ' ')"
echo "anchored-not-cand    $(wc -l < "$L/anchored-not-candidate.txt" | tr -d ' ')"
echo "auto-skills          $(wc -l < "$L/auto-skills.txt" | tr -d ' ')"
echo "auto-docs            $(wc -l < "$L/auto-docs.txt" | tr -d ' ')"
echo "auto-dottree         $(wc -l < "$L/auto-dottree.txt" | tr -d ' ')"
echo "auto-tests           $(wc -l < "$L/auto-tests.txt" | tr -d ' ')"
echo "needs-classification $(wc -l < "$L/needs-classification.txt" | tr -d ' ')"
