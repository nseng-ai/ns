# Slow Default-Path Test Inventory Captured

## Summary

The latest default TypeScript test evidence identified the remaining tests that should drive the next fast-boundary improvements. This inventory supersedes the broader earlier guesses with a concrete list to track:

- `packages/brmem/test/scenario/copy-operation.test.ts` — 11 tests, about 815ms; includes the public-copy RealGitBrmemGateway wiring case at about 788ms.
- `packages/pi-extensions/test/worktree-status.test.ts` — 11 tests, about 726ms.
- `packages/ccc/test/worktree-status.test.ts` — 38 tests, about 556ms.
- `packages/brmem/test/scenario/export-operation.test.ts` — 14 tests, about 456ms; includes public export through RealGitBrmemGateway at about 435ms.
- `packages/asdl-core/test/exec.test.ts` — 18 tests, about 386ms.
- `packages/brmem/test/gateways/real-git-gateway.test.ts` — 10 tests, about 3241ms; individual real Git cases include snapshot read/write/check/list, delete preserving siblings, snapshot copy, key-glob copy, and glob-conflict coverage.
- `packages/slot/test/gateways/real-git-gateway-movement.test.ts` — 1 test, about 225ms.
- `packages/slot/test/gateways/real-gt-gateway.test.ts` — 21 tests, about 290ms.
- `packages/brmem/test/gateways/prompt-resolution.test.ts` — 2 tests, about 120ms.
- `packages/ccc/test/worktree-status-graphite-metadata.test.ts` — 20 tests, about 191ms.
- `packages/sdl/test/scenario/cp-cli.test.ts` — 39 tests, about 72ms.

The Node runtime smoke-test row is already complete in the current branch. This inventory should guide the remaining brmem real-Git and sqlite/worktree-status slices, plus a narrow reassessment of whether `packages/asdl-core/test/exec.test.ts` still has material timeout/process cost after the timer-seam migration.

## Objective Impact

- Roadmap tracking now names the concrete brmem tests that need fake-driven default coverage and integration-retained real Git coverage.
- Roadmap tracking now names the concrete worktree-status / sqlite / Git / Graphite default-path tests to migrate, fake, or explicitly retain with rationale.
- The Objective scope now records this latest slow-test inventory so future implementation slices do not rediscover or broaden the target set accidentally.
- The Objective remains open: brmem real-Git and sqlite/worktree-status rows are still incomplete; Node runtime smoke coverage remains complete.

## Follow-Ups

- Plan the brmem real-Git split around `copy-operation`, `export-operation`, `real-git-gateway`, and `prompt-resolution` coverage.
- Plan the worktree-status/sqlite/Graphite split around pi-extensions, ccc, slot, and sdl default-path coverage.
- Reassess `packages/asdl-core/test/exec.test.ts` only if future timing indicates remaining material real-time/process cost after the completed timer-seam work.
