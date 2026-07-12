# Slice 1 failure vocabulary unified

## Summary

Completed Slice 1 by making the land core own the canonical execution-failure vocabulary and failure-fact helpers. `LandingFailure` now includes the execution variant, while `stack/errors.ts` remains only as an explicit transitional re-export shim. Duplicate worktree and retained-cleanup types were removed from `stack/types.ts`; its temporary `LandedPr` name now aliases the canonical `LandedPullRequest`.

Local Graphite branch deletion failures now carry the required `isLikelyInProgressGitOperation` classification. The real land adapter computes it with the existing submit heuristic, Graphite maintenance consumes only the typed boolean, and the in-memory gateway accepts the classification directly without parsing injected stderr.

## Objective Impact

The Slice 1 roadmap row is complete. Core and stack consumers now share one `LandingFailure` vocabulary, and maintenance no longer imports submit-owned prose classification. The compatibility shims intentionally remain until Slice 8, so this slice does not remove or rename existing call-site or package exports.

## Test Evidence

- Focused Vitest passed: 6 files / 31 tests, covering canonical failure facts for all four `LandingFailure` variants, in-memory deletion classification, real-adapter stdout/stderr/exit classification, maintenance typed branching, presentation compatibility, and the migrated-module import boundary.
- `just ts-check` passed with tsgo.
- `just ts-format-check` and `just ts-lint` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 69 files / 609 tests.
- `just` passed: dprint; TypeScript style guard (148 tests); dependency checks; oxfmt; oxlint; tsgo; default Vitest (503 files / 5088 tests); and the Objective sweep (151 records, 0 warnings/errors).
- `git diff --check` passed.

## Scenario Invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. No transcript scenario, script fixture, backup-ref fixture, shared land test helper, git-state filesystem support, or topology-guard file changed.

## Follow-Ups

Proceed to Slice 2 without deleting the `stack/errors.ts` or `LandedPr` compatibility shims; their removal remains reserved for Slice 8.
