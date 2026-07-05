# Objective Edges closed: Record Frontmatter landed on trunk

## Summary

Trunk-style refresh verified every Completion Criterion against HEAD plus current worktree
state and closed the Objective. Record Frontmatter (the optional `objective.md` block
carrying exactly `blocked` and `edges`) is live end to end on `master`:

- Reader: `ts/packages/capabilities/objectives/src/core/record-frontmatter.ts` (+ the
  `record-frontmatter-read` operation) present on trunk.
- Linter: `ts/packages/capabilities/objectives/src/core/operations/edge-lint.ts` present;
  `ns objective check --all` returns `sweep-ok (0 violations)` across 128 records and is
  wired into `just check` (justfile:183).
- List: `ns objective list` renders the EDGES column and `⊘ blocked` sub-state — live output
  shows `checkout-free-sdl-distribution` edges 2 and `ship-objectives-to-customers`
  `⊘ blocked` edges 4.
- Skills: the `objective` umbrella carries the Record Frontmatter grounding; the three step
  skills (`objective-create`/`objective-update`/`objective-close`) document the mirrored
  two-file edit and close-time counterpart re-judgment.
- Seed: both named records carry mirrored perspective-correct annotations plus the shipping-
  side Blocked Sentence, and the pair is now in active use with edges grown beyond the seed.
- Vocabulary + ADR: root and `@ns/objectives` `CONTEXT.md` terms landed; ADR
  `docs/adr/0025-zero-kind-mirrored-objective-edges.md` on trunk.

## Objective Impact

The prior tracking state was "all rows implemented locally, closure gated on landing (CI
sweep green on trunk)." That gate is now satisfied: the work is on `master` and the CI-gating
sweep is green, so the Objective is closed (`## Closure` in `objective.md`, `closed.md`
marker written). Both remaining Open Questions were resolved by the landed answer (no reader
needed frontmatter awareness beyond stripping; ADR landed as 0025) and struck through.

Correction recorded: this record was authored under the pre-rename `sdl objective` /
`@sdl/objective` (singular) vocabulary. The delivered surface is `ns objective` and the
package is `@ns/objectives` at `ts/packages/capabilities/objectives/`; the rename came from
separate Objectives after this work landed and does not change the delivered design. Older
prose retains the historical `sdl` spelling by update immutability; landed reality uses `ns`.
The `objective-edges` record itself carries no frontmatter/edges, so closure required no
counterpart re-judgment and stayed within this slug's directory.

## Follow-Ups

- CONTEXT-MAP.md root-context description line still lags the four new Record Frontmatter
  terms — a documentation-only follow-up for a future CONTEXT session, outside this Objective.
- Parked items (public mutation CLI, typed edge kinds) remain deliberately deferred, not open
  work; the `rename-ji-to-ns ↔ checkout-free-sdl-distribution` edge already exists live on
  those records.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
