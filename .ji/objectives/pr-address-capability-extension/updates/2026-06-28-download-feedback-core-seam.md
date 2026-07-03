# Download feedback core seam extracted

## Summary

Extracted the portable `sdl address exec download-feedback` semantics from Address command glue into an Address-owned Domain Core seam.

## Changes / Evidence

- Added `ts/packages/address/src/core/download-feedback.ts` with `collectDownloadFeedback`, explicit core payload/result types, injected `GitGateway`, injected `GithubPrFeedbackGateway`, and injected `GatewayOptions`.
- The core now owns `download-feedback` target resolution from either `--pr-number` or the current branch, including explicit PR misses that preserve the requested PR number, branch misses that preserve the current branch, detached-HEAD handling, git failure propagation, and PR lookup failure propagation.
- The core now owns feedback snapshot orchestration through `fetchFeedbackSnapshot`, include/exclude filtering for resolved threads, automation-like discussion comments, and empty PR-level reviews, plus stable `found` / `target` / `counts` / `markdown` payload construction.
- The core now owns Markdown triage prompt assembly, preserving the initial no-edit/no-mutation guidance and the safe `sdl address exec resolve-review-thread` / `reply-review-thread` mutation instructions.
- Thinned `ts/packages/address/src/download-feedback.ts` so the command adapter only parses the command request, wires gateway/options context into `collectDownloadFeedback`, and translates core outcomes to Clinkr exits.
- Added `ts/packages/address/test/unit/core-download-feedback.test.ts` for current-branch success, include flags, explicit PR success while detached, branch and explicit-PR misses, detached HEAD, git failure, PR lookup failure, snapshot failure, and empty-feedback Markdown behavior.

## Validation

Passed in this working session:

- `pnpm --dir ts --filter @sdl/address run test -- test/unit/core-download-feedback.test.ts test/scenario/download-feedback.test.ts` (package script runs the Address test target; 12 files / 78 tests passed)
- `pnpm --dir ts --filter @sdl/address run check`
- `just ts-check`
- `just ts-format-check`
- `just ts-lint` (passed with pre-existing `no-useless-escape` warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts`)
- `just dprint-check`

A mistaken package-local formatting command was also tried and failed because `@sdl/address` has no `fmt:check` package script: `pnpm --dir ts --filter @sdl/address run fmt:check`.

## Objective Impact

This advances the open Domain Core seams row but does not complete it. Review-thread mutation primitives and any reusable Pi watch/fingerprint behavior still need separate evaluation before the Objective can claim the full row complete.
