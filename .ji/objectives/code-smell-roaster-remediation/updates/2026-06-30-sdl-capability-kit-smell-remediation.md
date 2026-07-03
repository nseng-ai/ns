# sdl-capability-kit Smell Remediation

## Summary

Remediated the `sdl-capability-kit` code-smell-roaster cluster after re-verifying the three findings in current code. The testing text-generation helper now imports and re-exports the canonical text-generation contracts, checkpoint and pending-worktree command results share one package alias derived from `ExecResult`, and brmem option types reuse a shared `BrmemCallContext` instead of restating the same call fields.

Validation passed: `pnpm --dir ts --filter @sdl/capability-kit run check`, `pnpm --dir ts --filter @sdl/capability-kit run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just dprint-check`, and `just ts-test-typescript-style-guard`.

## Objective Impact

The `sdl-capability-kit` row now has dispositions for all three findings, reducing the open roaster backlog by one package cluster while preserving behavior and existing exported type names.

## Follow-Ups

None for this cluster.
