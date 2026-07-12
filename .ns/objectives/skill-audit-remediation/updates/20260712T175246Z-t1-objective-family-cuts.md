# T1 objective-family mechanical cuts executed

## Summary

First Tranche 1 family branch executed via an Objective Runner step on
`skill-audit-t1-objective-family` (commit ecf3d75f, stacked on the frontload branch).
All batch-1 and batch-2 T1 findings for the 16 objective-family skills are now applied
or dispositioned: 18 files touched (16 SKILL.md plus the objective-patterns and
execution-friendly-create references), family total 1502 → 1487 lines and roughly
-1,574 words (~10%), each finding re-verified against the live file before cutting.

Dispositions beyond straight application: the umbrella Tracking-Gate contradiction and
the objective-retro namespace bug were re-verified as already fixed by Tranche 0
(no-op here); batch-1 cross 8 is a no-change per the audit's own judgment; umbrella
finding 6 was applied only for the autorun "absorbed objective-stack-impl"
parenthetical — the "(formerly …)" breadcrumbs stay per the finding's own prune-later
guidance; batch-2 cross 8 (retro retired-namespace read-only note) is deferred as a
load-bearing regression guard — deleting it is a judgment beyond a mechanical cut.
T2/T3/T4-tagged findings for these skills were left for their tranches.

Validation: `just` green (dprint, tsgo, full Vitest suite, `ns objective check --all`
sweep), `areg check` OK, and `areg skill show <name>` verified for all 16 touched
skills. Note for reviewers: objective-update's SKILL.md grew 7 physical lines because
Stop/ask prose became bullets, while shedding ~244 words.

## Objective Impact

Tranche 1 is now in progress: the objective-family slice (1 of the ~8 family-grouped
branches in the T1 guidance) is done with `wc -l` evidence captured. The
behavior-preservation assumption held — cuts replaced restatements with pointers to the
owning skill/section; leaf skills now lean slightly more on the umbrella/catalog being
loaded first, which all leaves already instruct.

## Follow-Ups

- Remaining T1 family branches: branch-context/handoff/brmem; code/Graphite ops;
  flow+ccc; scaffolding; TypeScript/CLI; docs/retro/setup; review/meta.
- T2 items for this family (description trims, autorun internal-citation drop, trigger
  dedup) and T3 items (Selection/critique exception unification, composition-matrix
  SSOT completion, retro disclosure moves, close/create Stop-ask consolidation) stay in
  their tranche rows.
- Batch-2 cross 8 rename-breadcrumb pruning deferred as noted above.
