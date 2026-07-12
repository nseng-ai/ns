# T1 TypeScript/CLI cuts executed

## Summary

Sixth Tranche 1 family branch executed via an Objective Runner step on
`skill-audit-t1-typescript-cli` (commit 591057b1, stacked on the scaffolding slice).
Batch-9 T1 findings applied across five skills, family total 679 → 634 lines: the
largest single cut is ns-typescript 169 → 142 (the 19-flag tsconfig inventory reduced
to the four behaviorally relevant flags plus a `ts/tsconfig.json` contract pointer).
ns-cli-design's additive-change consolidation was applied with one deliberate
retention: hard gate 4's envelope-scoped "may not, except additively" clause stays
because it is the envelope-stability gate itself, not a restatement.

Dispositions: ns-typescript findings 1–3, typescript-style finding 5, and two
cross-skill findings were already resolved by the T3 TypeScript ownership split;
cli-push-down findings 4–5 and two cross-skill findings were already resolved by
Tranche 0; the tripwire/T2/T3-tagged findings stay in their tranches. The
typescript-style-guard doc-reference test was checked — it pins only the absence of
retired `ts-guard` strings, so no cut was test-pinned.

Validation: `just` green (full suite incl. integration, isolated, and style-guard
lanes; `ns objective check --all` sweep-ok), `areg check` OK, `areg skill show`
verified for all five touched skills.

## Objective Impact

Tranche 1: six of ~8 family branches done. Two remain: docs/retro/setup and
review/meta. Cumulative recorded T1 line reduction across the six slices: roughly
265 lines of SKILL.md/reference prose, all behavior-preserving.

## Follow-Ups

- Remaining T1 family branches: docs/retro/setup; review/meta.
- The typescript-fake-driven-testing CommandExecApi/ExecGateway parenthetical was
  deliberately kept — its move to the conventions doc is a T3 finding.
