# T1 branch-context/handoff/brmem cuts executed

## Summary

Second Tranche 1 family branch executed via an Objective Runner step on
`skill-audit-t1-branch-context-handoff` (commit e648d213, stacked on the
objective-family slice). All batch-3 T1 findings for the family are applied or
dispositioned: 9 skill files plus `handoff/references/lifecycle.md` touched, family
total 893 → 842 lines, the largest single cut being handoff-pickup 146 → 112 (intro
compression, one no-handoffs rule replacing three templates, routing folded into
umbrella pointers).

Dispositions: branch-context-from-plan finding 4 **rejected** — the step-3 pointer
sentence is pinned by
`ts/packages/capabilities/branch-context/test/pi/branch-context-extension-helpers.test.ts`
(trim reverted after a real test failure); branch-context-impl finding 1 and
enriched-plan-save finding 1 were already fixed by Tranche 0 (only residual trims
applied); enriched-plan-save finding 3 **deferred to T3** (the audit itself calls the
duplicate tolerable for standalone runs; single-sourcing is a structural move); one
handoff lifecycle Terms site was a no-op against the live file.

Validation: `just` green (full Vitest suite plus style guard and
`ns objective check --all`), `areg check` OK, `areg skill show` verified for all 8
touched skills. The slice also carries a formatter-mandated reindent of this record's
`roadmap.md` (the previous tracking commit was not dprint-clean).

## Objective Impact

Tranche 1: two of ~8 family branches done (objective family; branch-context/handoff/
brmem), with `wc -l` evidence captured for both. A new durable fact for the
behavior-preservation risk: skill prose can be pinned by tests, so a "mechanical" cut
can fail validation — the reject-with-rationale path handled it without blocking, as
the Runner Policy intends.

## Follow-Ups

- Remaining T1 family branches: code/Graphite ops; flow+ccc; scaffolding;
  TypeScript/CLI; docs/retro/setup; review/meta.
- If a future tranche wants the from-plan pointer trim, it must move the pinned
  expectation in `branch-context-extension-helpers.test.ts` first.
- enriched-plan-save saved-plan-slug locator single-sourcing goes with T3.
