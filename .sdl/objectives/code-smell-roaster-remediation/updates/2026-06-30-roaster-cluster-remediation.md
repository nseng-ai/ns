# Roaster Cluster Remediation

## Summary

Remediated the `roaster` code-smell cluster's six confirmed findings without changing roaster CLI, prompt, or GitHub publication behavior:

- `requireReviewsDirectory` now centralizes `.sdl/reviews` missing/not-directory validation for review listing and review key path resolution.
- `formatOmittedReviewInputFile` now owns the omitted input file detail string shared by capped diff prompt headers and findings comment input-coverage rendering.
- `renderReviewRun` now uses the canonical `reviewUsageTotalInputTokens` helper from `models.ts` instead of a local duplicate.
- Roast skill metadata resolves the display role once per entry and derives role-specific labels/prompts from one table.
- `createReviewListCommand` now owns the shared `review list` command wiring reused by the `review ls` alias.
- `callGithubOrEmptyResult` now wraps repeated GitHub read try/catch plus gateway-error handling in inline findings publication.

Validation passed: `pnpm --dir ts --filter @sdl/roaster run check`, `pnpm --dir ts --filter @sdl/roaster run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check`.

## Objective Impact

The six `references/roaster.md` findings are now dispositioned as fixed in `roadmap.md`. This reduces the open no-disposition code-smell backlog by one package cluster while preserving existing roaster behavior and output strings.

## Follow-Ups

No roaster-specific follow-up is known. Future roaster review-list aliases should use `createReviewListCommand`, and future omitted input coverage renderers should reuse `formatOmittedReviewInputFile` for the shared file-detail wording.
