# T3 TypeScript ownership split executed

## Summary

The decided TypeScript ownership split landed on branch
`skill-audit-t3-ts-ownership-split` (stacked on `skill-audit-t3-decisions`), executing
the T3 cluster and resolving audit findings ns-typescript #1/#2/#3 and cross-skill #2,
with cross-skill #7 (the description's `as unknown as` claim) resolved as a side effect.

**`ts/AGENTS.md` (53 → 66 lines) now owns repo enforcement.** The shared-test hard-gate
bullets absorbed the per-ban remediation the skill carried and AGENTS.md lacked (inject
`TimerScheduler` + `createManualTimerScheduler()`, `vi.stubEnv()`, injected event
source, owned worker seam) plus the auto-restore caveat; the Time seams section gained
the `node:timers/promises` ban mention and the `NS_TS_BAN_RAW_PRODUCTION_TIMERS` id; a
new "TypeScript style guard" section owns the enforced-id inventory, the guard-lane
command, and the review-only status of `NS_TS_BAN_IMPORTED_BINDING_LOCAL_ALIAS`.

**`skills/ns-typescript/SKILL.md` (199 → 169 lines) is rewritten toward portability.**
The three formerly duplicated sections (Test lanes and shared-cache safety, Time seams,
Hard bans) shrink to portable doctrine plus pointers at the host repo's AGENTS.md; the
Hard bans section's rule text and preferred-fixes list are dropped in favor of
`typescript-style` (which already carries both with the `NS_TS_BAN_*` ids). The
description and intro state the portability posture and drop the `as unknown as`
ownership claim. Toolchain, compiler baseline, import convention,
`exactOptionalPropertyTypes` idiom, encoded-contracts, and the closing validation-gates
block are untouched (their T1 cuts remain for the Tranche 1 TypeScript/CLI family
branch).

**`ns-typescript-style-tripwire/review.md` provenance updated** per the recorded
follow-up: `ts/AGENTS.md` added as a source alongside the two skills, and the refresh
trigger widened to "any of those source documents".

Evidence: `just` green (5103 tests + objective sweep), `review-definition.test.ts`
green (40 tests), `areg check` all-OK, `areg skill show ns-typescript` still `normal`
kind with no overlay drift, no dangling references to the removed section headings.

## Objective Impact

The TypeScript-ownership cluster of the T3 row is done. Remaining T3 clusters:
objective family, review family (adversarial-reviews conventions doc + provenance
backfill), shared-family-material moves, disclosure moves, TOCs, and vague-completion
sharpening. Not resolved here: typescript-style #5 (the `NS_TS_BAN_*` ids embedded in
the melded portable layer's `core-rules.md`/`checklist.md`) — stripping ids from
upstream-melded content is a separate maintainer decision; the ids now also have a
sanctioned enforcement home in `ts/AGENTS.md` either way.

## Follow-Ups

- Tranche 1's TypeScript/CLI family branch still owes ns-typescript its mechanical cuts
  (findings #4–#9: exactOptionalPropertyTypes internal repetition, 19-flag tsconfig
  listing, ambient-bags restatement, toolchain lane clause, WIP-workflows no-op,
  double-negation).
- When the review-family cluster executes, the adversarial-reviews conventions doc
  should cite the tripwire's now-three-source provenance block as the worked example.
