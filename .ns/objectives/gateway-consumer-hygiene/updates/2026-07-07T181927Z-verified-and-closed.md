# Gateway Consumer Hygiene verified complete and closed

## Summary

An `objective-refresh` forensically verified all `## Work` rows against trunk
HEAD (`9fa6a502d`) and closed the Objective. Every material claim was probed
with `git grep` / `test -e` rather than trusted:

- Row A docs bundle: convention doc, capability-kit `AGENTS.md`, root `AGENTS.md`
  routing clause, ADR 0019 `capability-kit-owned` amendment, and root
  `CONTEXT.md` **Consumer Gateway** term all present.
- Row B: `execNs*` family removed from
  `ts/packages/capability-kit/src/git/index.ts`, now in
  `ts/packages/capabilities/flow/src/ns/`.
- Row C: `WorktreeStatusGitGateway`, `PrAddressGitGateway`, `RetrosGitGateway`,
  `AregGitGateway` in place.
- Row D1: `hasStagedChanges`, `checkStagedWhitespace`, `unstageAll`, `checkout`
  on `GitGateway` with real (`git/index.ts`) and fake (`git/git-testing.ts`)
  parity; four new `KnownGitErrorCode` values with test coverage.
- Rows D2–D4: objectives runner gate routes through `ctx.git`; flow autobranch
  `AutobranchGitGateway` threaded through the four named files; branch-context
  `upstack-impl-launch.ts` takes `git: Pick<GitGateway, "checkout">`.

## Objective Impact

Objective closed. `## Closure` added to `objective.md`; `closed.md` written. No
durable content or roadmap shape changed — the record already matched its
verified contract; this refresh only recorded the probe-backed completion and
closed it.

## Follow-Ups

- The **Read-only ad-hoc git callers** Parked row (flow trunk-pull /
  smart-restack / stack-squash, ccc cmux, pi worktree-status reads, nscc) stays
  recorded for a later deliberate pull. Closure did not require it.

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD
