# Dual Landing Plan Vocabulary Collapsed

## Summary

Candidate 1 is implemented in the current branch: `stack/` landing execution now consumes the Land Domain Core `LandingPlan` directly. The shadow `FlowLandingPlan` type, `toFlowLandingPlan`, `toFlowDescendantMaintenance`, `copyPullRequestSnapshot`, and `stack/pull-request-snapshot.ts` are gone. Warning production moved down into `stack-facts.ts`, so stack snapshots now carry domain `LandingWarning` objects without the removed `toWarningNotifications` round trip.

## Objective Impact

This completes the first roadmap row and removes the duplicate plan vocabulary that made later gateway-set and maintenance deepening riskier. The refactor preserved behavior-facing surfaces: the flow package suite passed, stale-symbol sweeps for the removed mapper/shadow names are clean, and `land-stack-command-scenarios.test.ts` was type-import-only adjusted without expectation changes.

Evidence:

- `rg -n "FlowLandingPlan|toFlowLandingPlan|toFlowDescendantMaintenance|copyPullRequestSnapshot|pull-request-snapshot|toWarningNotifications|PullRequestSnapshot" ts/` returned no hits.
- `rg -n "kind: \"(current|managed-slot|manual-worktree|auto|none|skipped)\"|\.kind === \"(auto|skipped|none|managed-slot|current|manual-worktree)\"" ts/packages/capabilities/flow/src/land` returned no hits for the retired maintenance/worktree discriminants.
- `just ts-check` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 53 test files, 482 tests.

## Follow-Ups

Proceed to Candidate 2: construct the Land Gateway Set once at dispatch and thread it through plan/coordination/merge phases without reintroducing a plan translation layer. The broader Objective remains open; Candidates 2 and 3 still gate unblocking `flow-land-incremental-perf-rollout`.
