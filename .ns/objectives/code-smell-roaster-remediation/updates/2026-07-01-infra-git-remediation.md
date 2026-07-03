# Infra Git Remediation

## Summary

Remediated the `infra` cluster's `@sdl/git` sub-slice from `references/infra.md`. Re-probe confirmed the RealGitGateway expect-success command failure handling, untyped first-party error-code vocabulary, and missing-revision/tree output phrase scans were still present.

`runGitExpectingSuccess` now centralizes the duplicated run/startup/nonzero-or-killed/`formatCommandFailure` path for repo-root, head-commit, git-path, dirty-status, local-branch-tip, and changed-path queries. `KnownGitErrorCode` names the first-party RealGitGateway code vocabulary, while `GitErrorCode` stays compatibility-open for external and fake gateway errors discovered during repo typecheck. Missing revision/tree probes now share combined-output phrase matching helpers.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @sdl/git run check`, `pnpm --dir ts --filter @sdl/git run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`. Initial `just ts-format-check` failed on `ts/packages/infra/git/src/index.ts` and was corrected with `just ts-format-fix`; an initial `just ts-check` exposed arbitrary git error codes in external fake/test callers, so the public error code type remains open while first-party RealGitGateway helper inputs are constrained.

## Objective Impact

Reduces the open `infra` findings by disposing the `ts/packages/infra/git` sub-slice as fixed without changing observable gateway command behavior or result discriminants. The compatibility-open public `GitErrorCode` records that the primitive-obession fix is strongest at the first-party RealGitGateway boundary while preserving existing fake/custom gateway contracts.

## Follow-Ups

Continue with remaining open `infra` sub-slices (for example github, graphite, cli-runtime, cli-theme, time, or test-kit) or the still-partial capabilities/local-pi-tools clusters. Do not close the `infra` row until every remaining finding in `references/infra.md` has a fixed/disposed/routed disposition.
