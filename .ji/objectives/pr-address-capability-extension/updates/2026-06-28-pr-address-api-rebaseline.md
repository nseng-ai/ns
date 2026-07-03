# PR Address API Rebaseline

## Summary

The `@sdl/pr-address/api` Capability API slice is complete. The API source now classifies the current export surface instead of leaving the lower-core re-exports ambiguous:

- Stable PR Address Capability API: `GithubPrFeedbackGateway`, PR lookup/review/discussion/review-thread DTOs, review-thread reply/resolve DTOs, feedback failures, gateway options, and operation names.
- Stable through the PR Address seam: `GithubStatusChecks`, `GithubStatusCheckEntry`, `GithubCheckTally`, `GithubCheckBucket`, and `GithubStatusCheckKind` when consumers handle PR Address `getPrChecks` / `pr-checks` payloads. Generic status normalization mechanics remain neutral infra in `@sdl/core/github-pr-status`.
- Not Capability API: `RealGithubPrFeedbackGateway`, GraphQL args/queries/schemas/normalizers, command schemas, Clinkr/exec wrappers, and Pi presentation/session helpers.

`ts/packages/pr-address/README.md` now gives the same import guidance to in-process consumers: use `@sdl/pr-address/api` for PR-feedback semantics instead of lower PR-feedback/status subpaths, Pi modules, command schemas, or private source paths. The new `test/unit/api-boundary.test.ts` typechecks the package export as the consumer path for the PR-feedback and check payload vocabulary.

Validation/evidence for this slice:

- `rg` found no non-PR Address PR-feedback consumers importing `@sdl/core/github-pr-feedback`; the remaining direct `@sdl/core/github-pr-status` imports are neutral `worktree-status` and core-test status consumers.
- `pnpm --dir ts --filter @sdl/pr-address run check` passed.
- `pnpm --dir ts --filter @sdl/pr-address run test` passed.
- `just ts-format-check` passed.
- `just ts-lint` exited successfully with pre-existing handoff-test `no-useless-escape` warnings.

## Objective Impact

This completes the roadmap row to rebaseline `@sdl/pr-address/api` as the curated Capability API. The Objective's open question about which existing exports are stable Capability API vocabulary is resolved by the classification above.

The next Objective slice should move from API classification to Domain Core seams: extract or tighten gateway-injected PR Address behavior where reusable logic is still coupled to CLI operation glue or Pi shell-out adapters, with branch-to-PR mapping and check/status result normalization as likely high-value candidates.

## Follow-Ups

- Keep future API additions consumer-driven; do not add lower GitHub plumbing to `@sdl/pr-address/api` merely for convenience.
- When domain-core extraction begins, preserve this split: PR-feedback semantics belong to PR Address, generic status normalization mechanics stay in `@sdl/core/github-pr-status`, and Pi keeps presentation/session behavior.
