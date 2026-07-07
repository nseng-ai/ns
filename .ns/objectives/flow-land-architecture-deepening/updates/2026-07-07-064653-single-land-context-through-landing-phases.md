# Single Land Context Threaded Through Landing Phases

## Summary

Candidate 2 is implemented in the current branch: `createLandRuntime` now constructs one `LandContext` from the selected streamed command API, Graphite channel, and optional git state filesystem seam. That context lives on `LandRuntime` and is threaded through landing plan building, pre-merge coordination, and merge-loop execution instead of being re-derived by phase-local `createRuntimeLandContext` calls.

The Graphite override path now passes the injected channel into `createLandRuntime` before `LandContext` construction, avoiding stale capture of the default Graphite channel.

## Objective Impact

This completes the second roadmap row and removes the duplicated gateway-set construction that made the landing phases carry both a runtime bag and a derived context. Behavior-facing command shapes, safety gates, telemetry surfaces, and scenario expectations were not intentionally changed.

Evidence:

- `rg -n "createRuntimeLandContext" ts/packages/capabilities/flow/src/land ts/packages/capabilities/flow/test` returned no hits.
- `rg -n "ReturnType<typeof createRuntimeLandContext>" ts/packages/capabilities/flow/src/land` returned no hits.
- `just ts-check` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 53 test files, 482 tests.

## Follow-Ups

Proceed to Candidate 3: deepen Graphite maintenance behind the Land Gateway Set and narrow the remaining host/runtime seams. The broader Objective remains open; Candidate 3 still gates unblocking `flow-land-incremental-perf-rollout`.
