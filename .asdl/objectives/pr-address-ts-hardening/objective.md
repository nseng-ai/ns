# pr-address Core Hardening — Durable Security & Correctness Fixes in the Salvaged Zone

## Thesis

An advisory audit of `ts/packages/pr-address` (improve skill, standard depth,
commit `80dbd8b75`) surfaced 14 findings across security, correctness, tests, and
tech debt. The legacy orchestration / payload-store / session machinery they
mostly lived in was deleted by the now-closed `pr-address-strangler-rewrite`
Objective (closed `completed`, 2026-06-18). This Objective tracked the three
findings that survived into the salvaged downloader surface.

Ground truth moved during the Objective. The GraphQL pagination,
argument-building, and comment normalization logic that two of the three findings
targeted was extracted out of `ts/packages/pr-address/src/gateways.ts` into the
shared `@asdl/core/github-pr-feedback` primitives (commits `3b7535290`,
`6e0a3b52e`, `781e640cc`). `ts/packages/pr-address/src/gateways.ts` is now a thin
git-gateway wrapper (~1 KB) and no longer contains `reviewThreadPageArgs`,
`reviewThreadCommentPageArgs`, `numericId`, or any `id === 0` filter.

Final disposition of the three findings:

- **Correctness — silent comment drop (was Scope #2): resolved.** The extraction
  replaced the `numericId`→`0`-then-filter behavior with a Zod refinement
  (`withNumericGithubIdentity` / `numericGithubIdentity`,
  `asdl-core/github-pr-feedback/schemas.ts`) that surfaces an explicit parse
  error instead of coercing to a sentinel and dropping. Regression coverage exists
  in `ts/packages/asdl-core/test/github-pr-feedback.test.ts`. No `id !== 0` /
  `id === 0` filter remains in either package.
- **Security — `gh api -F`/`@` file-read primitive (was Scope #1): resolved in
  the relocated shared primitive owner.** The remaining cursor fields in
  `ts/packages/asdl-core/src/github-pr-feedback/args.ts` were changed to raw
  `-f` GraphQL variables for `threadCursor` and both `commentCursor` paths.
  `owner={owner}`, `repo={repo}`, and numeric `number` remain `-F`
  intentionally for documented `gh` placeholder expansion and numeric GraphQL
  variable conversion. Regression coverage now includes an `@/tmp/secret` cursor
  and exact argument-array expectations proving cursors are passed literally via
  `-f`.
- **Tech debt / DX — remaining barrel re-exports (Scope #3): resolved.** The
  package cleanup removed the `gateways.ts` type re-export block, deleted the
  package-root `index.ts` CLI barrel, removed the package-root `exports` entry,
  and repointed internal gateway type consumers at `./core/gateways.ts`. The
  supported `pr-address` bin entry remains intact, and repository searches find
  no package-root `@asdl/pr-address` TypeScript import consumers.

## Scope

The in-package `ts/packages/pr-address/src` hardening work is complete: the
barrel re-export cleanup landed, and no active package-boundary hardening work
remains inside `ts/packages/pr-address/src`.

The relocated `gh api -F`/`@` cursor question was explicitly re-scoped to the
shared `@asdl/core/github-pr-feedback` primitive owner for the narrow cursor fix.
That fix is complete and does not reopen broader `asdl-core` audit scope.

## Non-Goals

- The legacy strangler-zone findings (resolve/mutation idempotency #2/#4 and
  their characterization tests #3/#5, checkpoint-missing detection #7, untested
  checkpoint-recovery branches + orphaned fixture #14, `payload-store.ts`
  god-module split #10 and `PayloadReference`-defined-3× consolidation #11,
  operation-result schema drift #6) targeted code the completed
  `pr-address-strangler-rewrite` already deleted from the downloader surface.
- The shared-primitives extraction itself, and the `asdl-core/github-pr-feedback`
  surface generally, are not re-audited or restructured by this Objective. The
  final cross-package edit is limited to the relocated cursor argument primitive.
- The cursor fix does not reject `@`-prefixed cursor values at the boundary;
  cursors are opaque GitHub strings and are preserved literally via `gh api -f`.
- Also out of scope: any new RunEngine/zone work, performance tuning, dependency
  upgrades, and pushing or opening PRs.

## Completion Criteria

- **Satisfied:** `ts/packages/pr-address/src/gateways.ts` and the deleted
  `index.ts` contain no type/value re-export barrels for the in-scope symbols,
  and importers use canonical module paths.
- **Satisfied:** the relocated cursor file-read primitive no longer uses `gh api
  -F` for cursor variables. `threadCursor` and `commentCursor` now use `-f` in
  `ts/packages/asdl-core/src/github-pr-feedback/args.ts`; focused tests pin an
  `@`-prefixed cursor literal.
- Evidence: focused package validation passed for `@asdl/core`; broader
  TypeScript gates passed (`just ts-format-check`, `just ts-lint`,
  `just ts-check`, `just ts-test`, `just ts-guard`). Earlier package-entrypoint
  cleanup evidence remains valid: focused `@asdl/pr-address` check/test passed
  and stale-surface searches found no remaining in-scope barrel re-export or
  package-root TypeScript consumers.
- The silent-comment-drop finding (former Scope #2) is recorded as already
  resolved in current ground truth; no further work is required for it under this
  Objective.

## Assumptions and Risks

**Assumptions**

- The downloader-only `pr-address` surface plus the extracted
  `asdl-core/github-pr-feedback` primitives are the durable target; the strangler
  is closed/completed and no further strangler-driven reshaping is expected.
- `gh`'s documented `-F`/`@` semantics (a value starting with `@` is read from a
  file, `@-` from stdin) hold for the installed `gh` version; `-f` treats the
  value as a literal string. The cursor fix uses this by passing cursor values
  with `-f`.

**Risks**

- **(Retired)** The strangler rewrite's rebase/merge friction is gone (it has
  landed and closed).
- **(De-risked)** Removing the `gateways.ts` re-export barrel touched only the
  expected package-local consumers and remained a pure import-surface cleanup;
  focused package check/test passed.
- **(De-risked)** The relocated cursor file-read primitive now passes dynamic
  cursor strings via raw `-f` fields and has focused regression coverage for an
  `@`-prefixed cursor.

## Open Questions

None. The relocated cursor ownership decision was resolved by fixing the narrow
cursor argument primitive in `@asdl/core/github-pr-feedback` while preserving
literal opaque cursor values.

## Closure

Closed as completed. The in-package `pr-address/src` cleanup is done, the
silent-comment-drop finding is already resolved in the shared parser ground
truth, and the only remaining parked ownership question was resolved by applying
the narrow cursor fix in the shared `@asdl/core/github-pr-feedback` primitive
owner.

Evidence: local branch diff against Graphite parent
`remove-pr-address-gateway-barrels-bin-only`; `gh help api` still documents `-F`
`@` file-read semantics and `-f` raw string fields; stale cursor-flag searches
found no cursor expected arrays paired with `-F`; focused `@asdl/core` check/test
passed; broader TypeScript gates passed (`just ts-format-check`, `just ts-lint`,
`just ts-check`, `just ts-test`, `just ts-guard`). No PR evidence was required
for closure.
