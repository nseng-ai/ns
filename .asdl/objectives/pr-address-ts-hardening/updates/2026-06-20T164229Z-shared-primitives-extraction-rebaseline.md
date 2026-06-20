# Shared-Primitives Extraction: Rebaseline Off "Three Findings in pr-address/gateways.ts"

## Summary

One-objective refresh (target `HEAD` = `7a84af19e`, baseline `ed05d9b22` — the
last commit to touch this Objective directory; no prior `[objective-refresh]`
commit existed). The Objective was anchored on three findings living in
`ts/packages/pr-address/src/gateways.ts`. Ground truth has moved: the GraphQL
pagination, argument-building, and comment-normalization logic two of those
findings targeted was **extracted into the shared `@asdl/core/github-pr-feedback`
primitives** (commits `3b7535290`, `6e0a3b52e`, `781e640cc`), a surface owned by
the `pr-address-github-primitives` Objective. `pr-address/src/gateways.ts` is now
a thin git-gateway wrapper; `rg reviewThreadPageArgs|reviewThreadCommentPageArgs|numericId|threadCursor|commentCursor`
returns no matches anywhere under `pr-address/src`.

Per-finding verification against current `HEAD`:

- **Silent comment drop (was Scope #2): resolved.** `numericId`→`0`-then-filter
  is gone. `withNumericGithubIdentity` / `numericGithubIdentity`
  (`asdl-core/github-pr-feedback/schemas.ts:163-192`) now surfaces an explicit
  Zod parse error when an id is not a positive integer, instead of coercing to a
  dropped sentinel. Regression coverage: `expectInvalidIdentity` over a
  non-numeric `databaseId` in `ts/packages/asdl-core/test/github-pr-feedback.test.ts:584,598`.
  No `id !== 0` / `id === 0` filter remains in either package.
- **`gh -F`/`@` file-read primitive (was Scope #1): still real, relocated,
  partially addressed.** In `asdl-core/github-pr-feedback/args.ts`, `threadId` is
  now a raw `-f` field (`args.ts:66`), but `threadCursor` (`args.ts:57`) and
  `commentCursor` (`args.ts:42`, `args.ts:67`) still use `-F`, so the `@`
  file-read mechanism persists for cursor values. This code is now outside this
  Objective's `pr-address/src` boundary and inside the `pr-address-github-primitives`
  surface.
- **Re-export barrels (Scope #3): still real, still in scope.**
  `pr-address/src/gateways.ts:11-17` re-exports five git-gateway types from
  `./core/gateways.ts`; `index.ts:1` re-exports `runCli`/`CliDeps` from
  `./cli.ts`. The old `stdoutModeRequestShape` / `PRLookupMiss` symbol references
  are confirmed absent in `pr-address/src` and were dropped from the record.

## Objective Impact

Rebaselined from "fix three findings in `pr-address/gateways.ts`" to current
ground truth without closing the Objective:

- **Thesis**: rewritten to record the shared-primitives extraction and the
  per-finding status (resolved / relocated / still-in-scope).
- **Scope**: narrowed to the single remaining in-scope, in-package finding — the
  gateway/index barrel re-export cleanup.
- **Non-Goals**: noted that reply/resolve mutation helpers reappeared in the
  shared `asdl-core` primitives (raw `-f`, owned elsewhere); marked the
  `asdl-core/github-pr-feedback` surface as owned by `pr-address-github-primitives`.
- **Completion Criteria**: reduced to the barrel cleanup plus a note that the
  silent-drop finding is already resolved.
- **Open Questions**: added the ownership decision for the relocated `-F`/`@`
  cursor finding.
- **roadmap.md**: silent-drop row marked `[x]` (resolved, with evidence); `-F`/`@`
  row moved to Parked as relocated/ownership-pending; barrel cleanup is the sole
  active `## Work` row.

No `closed.md` was created and no `## Closure` was added.

## Follow-Ups

- The barrel re-export cleanup (`gateways.ts:11-17`, `index.ts:1`) is the only
  remaining active in-scope work.
- The user should decide whether the relocated `-F`/`@` cursor finding is tracked
  under `pr-address-github-primitives`, re-scoped into this Objective explicitly,
  or dropped as low-risk.
- Once the barrel cleanup lands and the `-F`/`@` ownership is settled, this
  Objective is closure-ready via `objective-update` — do not close it from a
  refresh.

Provenance: objective-refresh basis target=7a84af19e from=ed05d9b22
