# dignified-python SKILL.md router rewritten (queue position 3)

## Summary

Collapsed the `skills/dignified-python/SKILL.md` router — queue position 3, first
of the `command-backed` tier. 170 → 130 lines (body 151 → 111). Scope held: only
the SKILL.md router; the version-file tree and all reference files untouched.

The router was stated at four body sites — the "Reference Documentation Structure"
catalog, "When to Read Each Reference Document", "Conditional Loading", and the
"How to Use This Skill" recap — now merged into one trigger-keyed "Reference
Routing" section, with the catalog's descriptive labels folded into entry headings
and the recap's two non-recap facts (detect-once/one-version-file,
files-self-contained) relocated. The frontmatter `references` list (areg-managed)
is byte-identical, and each of the 13 reference files has exactly one body routing
entry, verified by grep, with the strongest trigger wording preserved. Two
deliberate trigger changes, both strictly broadening: subprocess.md also fires on
"runs external commands"; cli-patterns.md carries both prior wordings.

Residual recorded, not folded in: the "When to Use" bullets, the vs.-Others table,
and the description still triple-state invocation triggers — out of scope for this
router-only pass; candidate for a later pass if ever worth it (skill is
`command-backed`, so the cost is on-invoke only).

## Objective Impact

- Queue position 3 complete via the scoped rewrite method with the gate passed
  (30-item contract; per-reference-file trigger mapping in session scratchpad).
- `roadmap.md`: the dignified-python target row flips to DONE with evidence.
- Evidence: `areg check` "All skills OK"; `dprint` clean.

## Follow-Ups

- Queue position 4 (`code-thermostack`) next.
