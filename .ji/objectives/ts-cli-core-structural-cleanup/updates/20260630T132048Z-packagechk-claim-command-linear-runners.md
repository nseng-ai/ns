# Packagechk Claim Command Linear Runners

## Summary

Completed the neutral/tool-local `@sdl/packagechk` claim-command simplification slice.

- Removed the `ClaimPolicy` and `ClaimPlan` orchestration layer from `ts/packages/tools/packagechk/src/claim-command.ts`.
- Replaced generic policy-builder wiring with explicit `runPypiClaimCommand` and `runNpmClaimCommand` functions that receive their concrete registry and publish gateways directly.
- Kept only small shared helpers for common confirmation, precheck exit mapping, dry-run rendering/result shaping, temp-file writing, and publish execution.
- Updated `ts/packages/tools/packagechk/src/cli.ts` so `claim-pypi` and `claim-npm` call the concrete runners rather than constructing policy objects.

## Objective Impact

This satisfies the roadmap row for collapsing the `ClaimPolicy`/`ClaimPlan` over-abstraction in `packagechk` into direct registry-specific claim flows. The command behavior remains covered by the existing packagechk scenario tests for dry-run, invalid-name, taken-name, confirmation, publishing, and scoped npm behavior.

Validation evidence:

- `pnpm --dir ts --filter @sdl/packagechk test` — passed.
- `rg -n "ClaimPolicy|ClaimPlan|buildPypiClaimPolicy|buildNpmClaimPolicy|runClaimCommand" ts/packages/tools/packagechk` — zero matches.
- `just ts-format-check` — passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.

## Follow-Ups

- Continue with the remaining neutral rows in this Objective only after a narrow pickup re-check.
- If future packagechk claim behavior changes, preserve the current side-effect ordering guarantees: dry-run remains side-effect-free; invalid/taken names stop before tool checks; temp project directories are created only after checks, tool availability, and confirmation pass.
