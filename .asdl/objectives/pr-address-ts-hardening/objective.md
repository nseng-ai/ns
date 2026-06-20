# pr-address Core Hardening — Durable Security & Correctness Fixes in the Salvaged Zone

## Thesis

An advisory audit of `ts/packages/pr-address` (improve skill, standard depth,
commit `80dbd8b75`) surfaced 14 findings across security, correctness, tests, and
tech debt. The legacy orchestration / payload-store / session machinery they
mostly lived in was deleted by the now-closed `pr-address-strangler-rewrite`
Objective (closed `completed`, 2026-06-18). This Objective tracked the three
findings that survived into the salvaged downloader surface.

Ground truth has since moved again, and this record has been rebaselined against
it. The GraphQL pagination, argument-building, and comment normalization logic
that two of the three findings targeted was **extracted out of
`ts/packages/pr-address/src/gateways.ts` into the shared
`@asdl/core/github-pr-feedback` primitives** (commits `3b7535290`, `6e0a3b52e`,
`781e640cc`). That shared surface is owned by the separate
`pr-address-github-primitives` Objective. `ts/packages/pr-address/src/gateways.ts`
is now a thin git-gateway wrapper (~1 KB) and no longer contains
`reviewThreadPageArgs`, `reviewThreadCommentPageArgs`, `numericId`, or any
`id === 0` filter.

Net effect on the three findings, verified against current `HEAD`:

- **Correctness — silent comment drop (was Scope #2): resolved.** The extraction
  replaced the `numericId`→`0`-then-filter behavior with a Zod refinement
  (`withNumericGithubIdentity` / `numericGithubIdentity`,
  `asdl-core/github-pr-feedback/schemas.ts:163-192`) that surfaces an explicit
  parse error ("must include a positive integer databaseId or numeric id")
  instead of coercing to a sentinel and dropping. Regression coverage exists
  (`expectInvalidIdentity` in `ts/packages/asdl-core/test/github-pr-feedback.test.ts`,
  exercising a non-numeric `databaseId`). No `id !== 0` / `id === 0` filter
  remains in either package.
- **Security — `gh api -F`/`@` file-read primitive (was Scope #1): still real,
  relocated, partially addressed.** The pagination helpers now live in
  `asdl-core/github-pr-feedback/args.ts`. `threadId` in
  `reviewThreadCommentPageArgs` is already passed as a raw `-f` field
  (`args.ts:66`), but the string **cursor** fields still use `-F`:
  `commentCursor` in `discussionCommentPageArgs` (`args.ts:42`) and
  `reviewThreadCommentPageArgs` (`args.ts:67`), and `threadCursor` in
  `reviewThreadPageArgs` (`args.ts:57`). `gh` reads a value beginning with `@`
  as a filename (and `@-` as stdin), so the file-read mechanism persists for
  those cursor values. This code is now **outside this Objective's stated package
  scope** and inside the surface owned by `pr-address-github-primitives`; whether
  it stays tracked here or moves there is an open ownership question (below).
- **Tech debt / DX — remaining barrel re-exports (Scope #3): resolved.** The
  package cleanup removed the `gateways.ts` type re-export block, deleted the
  package-root `index.ts` CLI barrel, removed the package-root `exports` entry,
  and repointed internal gateway type consumers at `./core/gateways.ts`. The
  supported `pr-address` bin entry remains intact, and repository searches find
  no package-root `@asdl/pr-address` TypeScript import consumers.

## Scope

The only finding that remained durable, real, and inside this Objective's package
boundary (`ts/packages/pr-address/src`) was the barrel re-export cleanup, and it
is now implemented: `src/gateways.ts` owns only `RealPrAddressGitGateway` and its
implementation imports, `src/index.ts` is deleted, the package-root `exports`
entry is gone, and internal gateway type consumers import from
`./core/gateways.ts`.

No active package-boundary hardening work remains inside `ts/packages/pr-address/src`.
The relocated `gh api -F`/`@` cursor question remains parked outside this
Objective's package boundary until ownership is decided.

## Non-Goals

- The legacy strangler-zone findings (resolve/mutation idempotency #2/#4 and
  their characterization tests #3/#5, checkpoint-missing detection #7, untested
  checkpoint-recovery branches + orphaned fixture #14, `payload-store.ts`
  god-module split #10 and `PayloadReference`-defined-3× consolidation #11,
  operation-result schema drift #6) targeted code the completed
  `pr-address-strangler-rewrite` already deleted from the downloader surface.
  Note: reply/resolve mutation helpers (`replyToReviewThreadArgs`,
  `resolveReviewThreadArgs`) have since reappeared in the shared
  `asdl-core/github-pr-feedback/args.ts` primitives, but they pass `threadId`/
  `body` as raw `-f` fields and are owned by `pr-address-github-primitives`, not
  this Objective.
- The shared-primitives extraction itself, and the `asdl-core/github-pr-feedback`
  surface generally, are owned by `pr-address-github-primitives`. This Objective
  does not re-audit or restructure that package; the relocated `-F`/`@` cursor
  finding is recorded here only until its ownership is decided (see Open
  Questions).
- Also out of scope: any new RunEngine/zone work, performance tuning, dependency
  upgrades, and pushing or opening PRs.

## Completion Criteria

- **Satisfied:** `ts/packages/pr-address/src/gateways.ts` and the deleted
  `index.ts` contain no type/value re-export barrels for the in-scope symbols,
  and importers use canonical module paths.
- Evidence: `pnpm --dir ts --filter @asdl/pr-address run check` and
  `pnpm --dir ts --filter @asdl/pr-address run test` pass; stale-surface searches
  find no remaining package-root `@asdl/pr-address` TypeScript consumers, no
  `exports` key in `ts/packages/pr-address/package.json`, and no remaining
  in-scope barrel re-export.
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
  value as a literal string. This still governs the relocated cursor-field
  finding.

**Risks**

- **(Retired)** The strangler rewrite's rebase/merge friction is gone (it has
  landed and closed).
- **(De-risked)** Removing the `gateways.ts` re-export barrel touched only the
  expected package-local consumers and remained a pure import-surface cleanup;
  focused package check/test passed.

## Open Questions

- **Ownership of the relocated `-F`/`@` cursor finding.** The remaining `-F`
  cursor fields now live in `asdl-core/github-pr-feedback/args.ts`, owned by
  `pr-address-github-primitives`. Should this finding be tracked/fixed under that
  Objective, re-scoped into this one explicitly (expanding this Objective's
  package boundary into `asdl-core`), or dropped because GitHub-controlled
  pagination cursors are low-risk relative to the already-hardened `threadId`?
  This is a scope decision for the user, not something the refresh resolves.
- If the `-F`→`-f` cursor fix is pursued, should it also add a boundary-level
  rejection of `@`-prefixed cursor/thread values (defense in depth), or is
  switching to raw fields sufficient?
