# Sibling `ts-cli-core-structural-cleanup` Is Closed — Overlap/Routing Guidance Rebaselined

## Summary

A trunk refresh against HEAD `a814ebe36` found that
`ts-cli-core-structural-cleanup` — the sibling Objective this record leans on
for its ownership-overlap and routing guidance — was closed on 2026-07-06
(commit `133700d5b` "Close the TypeScript structural-cleanup Objective",
ancestor of HEAD; `closed.md` present, absent from `ns objective list`). The
prior 2026-07-07 record still described it as active with live open rows to
check and as a **routed** disposition target. That objective's god-file/dedup
work has landed on trunk, so it is no longer a live parallel effort or a
routing destination.

The three still-open clusters were re-verified at HEAD and remain accurate:
`internal/pi-tools/src/pr-feedback-watch/feedback-watch/controller.ts` is 793
lines (record says ~790), and `formatRunnerSubagentProgressWidgetLines` in
`extensions/ns-pi-subagents/src/runner-subagents/presentation.ts` is still
referenced only by its own definition and test. The July 2026 reorg mapping was
re-verified correct: tracked packages live under `infra/foundation/src/*`,
`capability-kit/src/*`, `internal/pi-tools`, `extensions/ns-pi-subagents`,
`hosts/nscc`, and `capabilities/flow/src/land` (top-level `ts/packages/infra/*`
name collisions are untracked pnpm `node_modules` artifacts). No new
remediation slices for the open clusters landed between the record's
2026-07-07 update and HEAD.

## Objective Impact

- Corrected `objective.md` Thesis, Non-Goals, Runner Policy steer-or-ask,
  Ownership-overlap Risk, and the routing Open Question to state that
  `ts-cli-core-structural-cleanup` is closed and its work landed: overlap
  avoidance now means checking its closed record plus the landed code and
  disposing overlaps as **disposed** (with re-probe evidence), since routing to
  it is no longer possible.
- Updated the `roadmap.md` header notes on the open `infra` and `capabilities`
  rows to point overlap checks at the landed git/github-gateway and Flow
  land-stack work rather than "its open rows."
- Record status unchanged: three clusters open ([~] infra, capabilities,
  local-pi-tools), eighteen complete ([x]). Not closure-ready — material
  remediation remains. This record carries no `blocked:`/`edges:` frontmatter,
  so no Blocked Sentence was affected.

## Follow-Ups

- At pickup for the open `infra`/`capabilities`/`local-pi-tools` clusters,
  re-map each remaining reference path to its post-reorg location and re-verify
  the smell before implementing, per the standing re-verification rule.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD
