# T1 code/Graphite ops cuts executed

## Summary

Third Tranche 1 family branch executed via an Objective Runner step on
`skill-audit-t1-code-graphite-ops` (commit e5a3dbb5, stacked on the
branch-context/handoff/brmem slice). Every live batch-4/5 T1 finding for the family is
applied or dispositioned: 11 SKILL.md files touched, family total 1816 → 1734 lines.
Largest cuts: code-smush 464 → 438 (replacement-construction, generation-token, and
recovery mechanics each single-sourced), code-gt-restack-resolve 312 → 287 ("When to
use" deleted, engine template made the single source for traveling facts),
pr-address 121 → 111, setup-graphite 175 → 165. code-just-the-stack grew 2 physical
lines from hoisting the `--no-interactive` fallback into one rule while shedding prose.
code-workflows had no T1 findings and is untouched.

Dispositions: code-just-fix findings 1 and 4 and the code-gt-linearize-descendants
safety-bullet/step-10 submit duplication were already resolved by Tranche 0 (only the
residual intro clause was cut). No test-pinned prose in this family; no
sanctioned-duplication conflicts. T2/T3/T4-tagged findings (gt plumbing-not-display
convergence, just-gate map, description rewrites, backup-refs/wait-for-checks/
stack-branches push-downs) stay in their tranches.

Validation: `just` green (full suite incl. integration lane and
`ns objective check --all`), `areg check` OK, `areg skill show` verified for all 11
touched skills with invocation kinds unchanged.

## Objective Impact

Tranche 1: three of ~8 family branches done (objective; branch-context/handoff/brmem;
code/Graphite ops) with `wc -l` evidence captured for each. Cumulative T1 reduction so
far: roughly 148 lines across three families, with all cuts behavior-preserving.

## Follow-Ups

- Remaining T1 family branches: flow+ccc; scaffolding; TypeScript/CLI;
  docs/retro/setup; review/meta.
- code-smush safety rules renumbered 2–7 → 1–6 after merging the PR-mutation ban into
  rule 1; no in-file numeric cross-references existed, but external references to
  "smush safety rule N" would now be off by one.
