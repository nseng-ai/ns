# T3 adversarial-reviews convention executed

## Summary

The decided review-family restructuring landed on branch
`skill-audit-t3-adversarial-reviews` (stacked on `skill-audit-t3-ts-ownership-split`),
executing the T3 cluster and resolving audit cross-skill findings #1 (HIGH, six-way
verbatim stub scaffolding) and #4 (MED, Pi-alias sediment), which was folded in rather
than left for Tranche 1.

**`docs/conventions/adversarial-reviews.md` (new) owns the convention.** It records the
adversarial-variant model and HITL lifecycle with the no-codegen rationale, defines the
three lineage kinds (skill-derived, vendored-derived, standalone), specifies the
provenance-block shape with `ns-typescript-style-tripwire`'s three-source block as the
worked example, owns the lean SKILL.md stub template (sanctioned duplication, marker
comment honored by future audits), carries the stub-per-review checklist, and states
the refresh/audit cadence chosen over reconcile machinery.

**Runner-only policy recorded:** `code-smell-review` deliberately has no skill stub —
the `pocock-review` skill is already its interactive surface and
`ns reviews review run code-smell-review` covers automation. This resolves the
decision update's open follow-up and is an explicit checklist line in the doc.

**Provenance backfilled on all five reviews lacking it.** `code-smell-review`'s body
"Lineage and update source" section converted into the canonical frontmatter comment
block (NS-local adaptations and the pin-lives-in-matt-pocock-doc rule preserved, body
section deleted); `thermonuclear-review` and `improve-codebase-architecture` recorded
as vendored-derived (from `.agents/skills/thermo-nuclear-code-quality-review/`,
upstream `cursor/plugins`, with the pending melding assessment noted, and
`.agents/skills/improve-codebase-architecture/`, upstream `mattpocock/skills`,
respectively); `reinvented-abstractions-tripwire` as standalone first-party.

**`dry-but-not-too-dry` lineage verification outcome: standalone.** The decision
update's "traces to the Matt Pocock melded set" could not be substantiated: no vendored
source dir exists, `skills-lock.json` records only the local stub, and
`docs/agents/matt-pocock-skills.md` explicitly dismisses the `.ns/reviews/` definitions
other than `code-smell-review` as structurally independent. Recorded as standalone with
inspired-by credit to the Fowler "Duplicated Code" territory and its recorded sibling
`reinvented-abstractions-tripwire`.

**Five stubs re-instantiated from the lean template** (27 → 23 lines each for the four
long stubs; the divergent 17-line `ns-typescript-style-tripwire` → 23, its H1/name
mismatch T2 finding resolved by the `# Review: …` template H1). Body-only edits;
frontmatter `name:`/`description:` and areg-owned overlays untouched. The record/publish
automation moved to its single home in `.ns/reviews/README.md`, which also points at
the conventions doc. `rg -l 'no separate reviews runner alias' skills/` returns
nothing.

Evidence: `just` green (dprint + 5103 tests + objective sweep),
`review-definition.test.ts` green (40 tests — all six review.md files still load),
`areg check` all-OK, `areg skill show` on all five touched stubs reports unchanged kind
with overlays present (live kind is `command-backed`, not the `invoke-only` the plan's
verification wording predicted — a pre-existing fact, not drift).

## Objective Impact

The review-family cluster of the T3 row is done; both T3 clusters decided on
2026-07-12 are now executed. Remaining T3 clusters: objective family,
shared-family-material moves, disclosure moves, TOCs, and vague-completion sharpening.

## Follow-Ups

- `dignified-python-tripwire` moved to `nseng-ai/ns-python`; if that repo adopts the
  adversarial-review convention it needs its own copy of the doc (already recorded in
  the decision update).
- The decision update's Evidence paragraph describes `dry-but-not-too-dry` as tracing
  to the Matt Pocock melded set; this verification supersedes that sentence —
  standalone lineage is now the recorded truth in the review's provenance block.
