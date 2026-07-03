# Slot Graphite and Git Boundary Split Completed

## Summary

The Slot real Graphite/sqlite and Git movement coverage is now split between fast default tests and intentional integration tests.

Default-path changes:

- `packages/slot/src/gateways/gt.ts` now exposes a domain-named `GraphiteMetadataDbAccess` seam for Graphite metadata DB existence and parsed JSON queries. The real adapter still owns sqlite subprocess execution and JSON/error mapping.
- `packages/slot/test/gateways/real-gt-gateway.test.ts` now uses fake DB access for deterministic stack topology, corruption, trunk-marker, schema/failure, and `stackGraph()` coverage instead of creating real sqlite metadata DBs.
- `packages/slot/test/gateways/real-git-gateway.test.ts` now covers movement command protocol and result mapping through an injected scripted `CommandExecApi` for `branchExists`, `createBranch`, `checkoutBranch`, `getPreviousBranch`, `detachHead`, and one failure mapping.

Retained integration coverage:

- `packages/slot/test/integration/real-gt-gateway.test.ts` keeps real sqlite smoke coverage for a happy linear stack and schema mismatch.
- `packages/slot/test/integration/real-git-gateway-movement.test.ts` keeps the throwaway-repository Git movement smoke test.

`packages/sdl/test/scenario/cp-cli.test.ts` was inspected and remains default-path appropriate: it uses scripted SDL fakes for Git/model calls and temp directories for extension-loading fixtures, not real Git/sqlite/runtime-boundary setup.

## Objective Impact

This completes the remaining Slot part of the sqlite/worktree-status/Graphite/Git boundary row. Default Slot gateway tests no longer create real sqlite metadata DBs or throwaway Git repositories, while representative real sqlite and real Git adapter confidence remains available through the integration suite.

The Objective remains open because the touched-time-seam roadmap row still tracks future timeout-sensitive assessment; the layout, CI, Node runtime, brmem real-Git, and sqlite/Graphite/worktree-status boundary rows are now complete.

Validation evidence:

- `pnpm --dir ts run test packages/slot/test/gateways/real-gt-gateway.test.ts` passed.
- `pnpm --dir ts run test packages/slot/test/gateways/real-git-gateway.test.ts` passed.
- `pnpm --dir ts run test:integration packages/slot/test/integration/real-gt-gateway.test.ts` passed.
- `pnpm --dir ts run test:integration packages/slot/test/integration/real-git-gateway-movement.test.ts` passed.
- Boundary grep under `packages/slot/test/gateways` found no `createMetadataDb`, real sqlite subprocess setup, `git init`, `fixtureIt`, or `withMetadataDb` hits.
- Default Vitest file listing produced no Slot integration-file matches; integration Vitest listing included the Slot Graphite and movement integration files.

Performance evidence:

- Baseline measured command: `/usr/bin/time -p pnpm --dir ts run test packages/slot/test/gateways/real-gt-gateway.test.ts packages/slot/test/gateways/real-git-gateway-movement.test.ts`.
- Baseline affected-default timing: 2 files / 22 tests passed; Vitest duration 894ms; `/usr/bin/time` real 1.54s.
- Post-change affected-default command: `/usr/bin/time -p pnpm --dir ts run test packages/slot/test/gateways/real-gt-gateway.test.ts packages/slot/test/gateways/real-git-gateway.test.ts`.
- Post-change affected-default timing: 2 files / 39 tests passed; Vitest duration 174ms; `/usr/bin/time` real 0.74s.
- Retained Slot integration timing: `/usr/bin/time -p pnpm --dir ts run test:integration packages/slot/test/integration` passed with 2 files / 3 tests; Vitest duration 437ms; `/usr/bin/time` real 0.97s.
- Repetition/noise notes: timings are single local samples in the same worktree with warm dependencies. They should be read as boundary-shift evidence, not precise benchmarks.
- Cost handling: real sqlite and throwaway-Git cost was shifted from the default Slot gateway path into explicit integration coverage, not deleted.
- Coverage retention: default tests retain deterministic Graphite topology/error semantics and Git command protocol mapping; integration tests retain representative real sqlite schema/query behavior and real Git branch movement behavior.

## Follow-Ups

- Continue assessing timeout-sensitive default-path tests only when those areas are touched or new timing evidence shows material cost.
- If future integration timing becomes material, consider consolidating Slot integration cases without moving sqlite or throwaway-Git setup back into the default suite.
