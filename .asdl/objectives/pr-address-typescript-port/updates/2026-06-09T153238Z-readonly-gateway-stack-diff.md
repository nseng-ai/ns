# Readonly Gateway Stack Diff

## Summary

The read-only stack branch introduced adapter-neutral TypeScript gateways for GitHub and git-backed `pr-address` behavior, plus fake-driven tests that do not require live GitHub state.

TypeScript now directly handles these read-only operations where the current behavior can be preserved without artifact writes:

- `get-pr-for-branch`
- `get-reviews`
- `get-review-comments`
- `get-discussion-comments`
- `get-feedback` when `--payload-mode inline` is requested
- `stack-feedback-diff-current`

The branch added real process-backed adapters for `gh`/`git`, in-memory fake gateway support for tests, read-only feedback collection helpers, and stack feedback diff transformation logic. No Graphite runtime dependency was introduced into generic operations.

Validation evidence:

- `pnpm --dir ts/packages/pr-address run test` passed with read-only gateway and stack-diff scenario coverage included.
- `pnpm --dir ts/packages/pr-address run check` passed.
- No live GitHub probes were required or run.

## Objective Impact

This moves the GitHub/git-backed read-only roadmap row to in-progress. It proves the adapter-neutral gateway shape and several read-only operations, but does not complete the full row because artifact-writing and behavior with possible write side effects remain outside the safe slice.

The following remain intentionally fallback-backed:

- default payload-writing `get-feedback` behavior
- `prepare-run`, because the Python workflow can reopen contested threads and therefore may perform GitHub writes
- `stack-feedback-prep` and `stack-feedback-plan`, because they still involve broader payload artifact and stack contracts

## Follow-Ups

- Port payload artifact storage before making default `get-feedback`, stack prep, or stack plan TypeScript-managed.
- Decide the safe public contract for `prepare-run` contested-thread reopening before replacing the Python path.
- Keep Graphite-specific behavior behind explicitly stack/Graphite-named contracts rather than generic runtime discovery.
