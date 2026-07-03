# Infra GitHub Remediation

## Summary

Remediated the remaining `ts/packages/infra/github` findings from `references/infra.md`:

- Data clumps around PR feedback failure cursor context are now named by shared context field interfaces and reused across failure details, failure construction, parsing, cursor validation, and parsed `gh` run options.
- Duplicated `GithubStatusCheckEntry` null-default construction now flows through `baseStatusCheckEntry` for CheckRun, StatusContext, and unknown status normalization.
- Duplicated GitHub URL parse/host/path splitting now lives in `githubUrlPathParts` for PR URL identity and normalized remote repository identity parsing.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @sdl/github run check`, `pnpm --dir ts --filter @sdl/github run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`. An initial `just ts-format-check` failed on `pr-feedback/types.ts`; `just ts-format-fix` corrected it before rerunning successfully.

## Objective Impact

Reduces the open infra cluster by recording fixed dispositions for the GitHub sub-slice, preserving existing behavior while removing three confirmed code-smell findings: one data-clump, one duplicated status-entry construction, and one duplicated URL parsing helper shape.

## Follow-Ups

Continue with the remaining open infra sub-slices (`graphite`, `cli-runtime`, `cli-theme`, `time`, and `test-kit`) or the remaining partial capabilities/local-pi-tools rows according to `roadmap.md`.
