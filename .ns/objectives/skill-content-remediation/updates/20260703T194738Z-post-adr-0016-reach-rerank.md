# Post-ADR-0016 reach re-derivation and queue re-rank

## Summary

Re-derived reach for every remaining per-skill target against current ground truth
(invocation kind from `areg skill list`, current line counts, and a per-target debt
re-verification), then re-ranked the queue by value = lift × reach × stakes − risk.
This resolves the open question "Should the remaining queue be re-ranked before
resuming?" — yes, and it has now been done.

Ground truth as measured 2026-07-03 (branch `rename-ji-to-ns-records`):

| Target                                   | Kind           | SKILL.md | Debt re-verified                                                                                                                                                                     |
| ---------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `brmem`                                  | **normal**     | 334 ln   | Holds — 12 top-level sections, per-command sprawl                                                                                                                                    |
| `objective`                              | **normal**     | 164 ln   | Holds (moderate) — grew with Record Frontmatter section                                                                                                                              |
| `dignified-python`                       | command-backed | 170 ln   | Holds — router stated 3× (frontmatter refs, "Reference Documentation Structure", "When to Read Each Reference Document") plus a "How to Use" recap                                   |
| `code-thermostack`                       | command-backed | 149 ln   | Holds — subagent contract restated in Safety boundaries, §2, and §5                                                                                                                  |
| `refactor-swarm`                         | command-backed | 173 ln   | Holds (partial) — "Key design decisions" recap; examples partly redundant, second example is genuinely instructive                                                                   |
| `objective-create`                       | command-backed | 124 ln   | Modest — tidy sections; body-vs-description debt small after Record Frontmatter growth                                                                                               |
| `code-gt-restack-resolve`                | command-backed | 324 ln   | Holds — TS-toolchain rule written twice (~52–78 and ~246–247); TEMPORARY block still present (removal stays parked, externally gated)                                                |
| `code-resolve-merge-conflicts`           | command-backed | 223 ln   | Assumed holds — surgical target, not re-read line-by-line                                                                                                                            |
| `objective-close`                        | command-backed | 78 ln    | Already clean, lift 1                                                                                                                                                                |
| `ccc-available-work`                     | command-backed | 239 ln   | Holds — commands appear in both "Data sources" and "Read-only command recipe"                                                                                                        |
| `ccc-stack-map`                          | command-backed | 163 ln   | Holds (same two-section shape)                                                                                                                                                       |
| `python-fake-driven-testing`             | command-backed | 111 ln   | **Mooted** — routing already consolidated into a single `## Reference Routing` section                                                                                               |
| `ji-flow-submit` (was `sdl-flow-submit`) | command-backed | 76 ln    | **Collapsed** — env-var catalog is now ~8 inline lines across the Workflow prose                                                                                                     |
| `python-fake-driven-test-layout`         | command-backed | 204 ln   | Tree drawn once as a full block; residual prose repetition only                                                                                                                      |
| `enriched-plan-save`                     | command-backed | 100 ln   | **Reshaped** — step-1 block now fenced by `PLAN-VERIFICATION-WORKSTREAM` markers (owned by that workstream); references/refactor-execution-strategy.md is a 9-line canonical pointer |

Only `brmem` and `objective` remain ambient (`normal`); every other queue target is
`command-backed` with zero ambient cost, so their reach is invoke-frequency × on-load
size, not always-loaded description cost.

## Objective Impact

**New queue order** (replaces the pre-ADR-0016 "objective family first, ccc/niche
last" order on the per-skill roadmap row):

1. `brmem` — rewrite (ambient, largest file, sprawl confirmed; high blast radius →
   extract-contract-then-diff applies with extra care).
2. `objective` — rewrite (the only other ambient target; family grounding).
3. `dignified-python` — rewrite of the SKILL.md router only (triplication confirmed;
   version-file tree stays as-is).
4. `code-thermostack` — rewrite (triplicated subagent contract confirmed).
5. `refactor-swarm` — rewrite (recap collapse; keep the boundary-illustrating second
   example).
6. `objective-create` — rewrite (modest debt; family alignment value).
7. `code-gt-restack-resolve` — surgical dedupe of the twice-written TS-toolchain rule
   (the TEMPORARY block removal remains parked on the toolchain rollout).
8. `code-resolve-merge-conflicts` — surgical pass (safety-critical).
9. `objective-close` — surgical (lift 1, cheap tail).
10. `ccc-available-work`, then `ccc-stack-map` — rewrite only if cheap (cmux-niche,
    lowest reach).

**Dropped/deferred with reasons** (completion criteria treat these as "explicitly
deferred/dropped with a recorded reason"):

- `python-fake-driven-testing` SKILL.md rewrite — **dropped as mooted**: the
  overlapping-pointer debt no longer exists; routing is already a single section. The
  reference-tree merge remains done.
- `ji-flow-submit` move-to-reference — **dropped as mooted**: the env-var catalog has
  shrunk to a few inline lines in a 76-line file; a reference split would add
  indirection without saving load.
- `python-fake-driven-test-layout` — **parked to the polish tier**: it was kept only
  as the safe mechanical method pilot, and the rewrite gate has since passed on four
  targets, so the pilot rationale is spent; residual debt is prose-level and reach is
  low.
- `enriched-plan-save` — **deferred out of this Objective**: its remaining candidate
  block is fenced by `PLAN-VERIFICATION-WORKSTREAM` markers and owned by that
  workstream; editing it here would cross workstream boundaries. Revisit only if that
  workstream closes with the block still duplicative.

**Assumption update:** the "Weakened 2026-07-03" reach assumption is restored — reach
inputs are now re-derived post-ADR-0016 and the ranking heuristic is trustworthy
again for this queue.

**Naming caution:** the active `rename-ji-to-ns` objective is churning skill directory
names on this very branch (`sdl-flow-submit` → `ji-flow-submit` already; an `ns`
rename may follow). Queue entries are keyed by skill identity; re-resolve current
directory names at each pickup, and prefer landing per-skill content edits after the
rename work stabilizes to avoid diff collisions.

## Follow-Ups

- Resume the per-skill row at queue position 1 (`brmem`), applying the
  extract-contract-then-diff gate per target.
- When the `rename-ji-to-ns` objective closes or stabilizes, re-confirm target
  directory names before each edit.
- If the plan-verification workstream releases the `enriched-plan-save` step-1 block,
  re-audit that skill for a late queue slot.
