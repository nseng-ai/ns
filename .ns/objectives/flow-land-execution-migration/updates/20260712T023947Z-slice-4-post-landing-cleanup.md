# Slice 4 post-landing cleanup migrated

## Summary

Completed Slice 4 by moving post-landing cleanup policy and orchestration into `execution/post-landing-cleanup.ts`. The core path now operates on `LandContext`, `LandExecutionProgress`, plain cleanup options, `LandingShape`, and `LandConfirmationGateway`; it has no stack, Pi, command-stream, or renderer imports.

`execution/host-seams.ts` now owns the four-kind confirmation request union (`main-landing`, `free-managed-slots`, `submit-required-updates`, and `post-landing-cleanup`), the approved/declined/fully-worded-refusal decision union, safe refusing/null confirmation gateways, and status clearing through `setStatus(string | undefined)`.

The root `post-landing-slot-cleanup.ts` is now a Flow adapter and presenter. It constructs the confirmation gateway through `confirmLandStackAction`, maps `ParsedArgs` to plain cleanup options, presents typed failures/success, and retains the existing one-prompt evaluation point and `--yes`/`--force` behavior. Prompt title, details, and non-interactive refusal text builders remain consolidated in `land-presentation.ts`.

## Objective Impact

The Slice 4 roadmap row is complete. Cleanup decision and mutation policy now run over core gateways while Flow retains prompt prose and UI presentation. The cleanup mutation remains enclosed by the original `try/finally`; focused tests prove `progress.setStatus(undefined)` after success, slot-free failure, retained deletion, and failed deletion.

## Fake and Adapter Evidence

- G3 now uses typed per-branch `deleteLocalBranchResults` for both `retained` and `failed`; the failed arm retains Slice 1's required `isLikelyInProgressGitOperation` flag.
- G5 successful `freeSlots` calls remove freed paths from the in-memory worktree state. `residualCheckoutPaths` models a checkout that remains, and worktree reads remain cloned.
- Fake contract tests lock successful mutation, residual checkout state, clone-on-read, retained deletion, and typed failed deletion.
- Real-adapter protocol tests cover representative slot-free exit 0 and exit 3 stdout/stderr mappings. Existing paired Graphite adapter protocol tests cover checked-out retention plus failed deletion classification for representative exit 1/2 results.
- Fake-driven cleanup tests assert semantic gateway request objects rather than reconstructed subprocess calls.

## Test Evidence

- Focused Vitest passed: 4 files / 30 tests (`post-landing-slot-cleanup`, in-memory gateway contract, land-context adapter protocol, and import direction).
- `just ts-check` passed with tsgo.
- `just ts-format-check` and `just ts-lint` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 72 files / 625 tests.
- `git diff --check` passed.

## Scenario Invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. The invariant diff is empty: no transcript scenario, script fixture, backup-ref fixture, shared land test helper, git-state filesystem support, or topology-guard file changed.

## Follow-Ups

Proceed to Slice 5 only. The root confirmation adapter currently handles the migrated post-landing-cleanup request; later slices will route the other reserved confirmation kinds through the same authoritative seam at their existing evaluation points.
