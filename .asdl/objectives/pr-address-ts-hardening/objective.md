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
- **Tech debt / DX — remaining barrel re-exports (Scope #3): still real, still
  in scope.** `ts/packages/pr-address/src/gateways.ts:11-17` re-exports the
  git-gateway types `CurrentBranchResult`, `GatewayFailure`, `GatewayOptions`,
  `PrAddressGitGateway`, and `RepoContextResult` from `./core/gateways.ts`, and
  `index.ts:1` re-exports `runCli` / `CliDeps` from `./cli.ts`. Both violate the
  repo's no-reexport / canonical-import rule (AGENTS.md). The old
  `stdoutModeRequestShape` and `PRLookupMiss` symbols named in earlier
  baselines are gone from `pr-address/src`; this is now only about the
  git-gateway/CLI re-export surfaces above.

## Scope

The only finding that remains durable, real, and inside this Objective's package
boundary (`ts/packages/pr-address/src`) is the barrel re-export cleanup:

- **Remove the remaining gateway/index re-export barrels.** Drop the type
  re-export block in `gateways.ts:11-17` and the CLI re-export in `index.ts:1`,
  and repoint importers at the canonical source modules (`./core/gateways.ts`,
  `./cli.ts`) per the repo no-reexport rule. The change is type-checked but has
  broad fan-out across gateway-type and CLI importers.

The fix lands with `check` evidence (no remaining barrel re-export of the
in-scope symbols) using the existing in-memory gateway fakes where tests are
touched (no mocks), per the repo's fake-driven testing architecture.

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

- `ts/packages/pr-address/src/gateways.ts` and `index.ts` contain no type/value
  re-export barrels for the in-scope symbols, and importers use canonical module
  paths.
- Evidence: `pnpm --dir ts --filter @asdl/pr-address run check` and
  `pnpm --dir ts --filter @asdl/pr-address run test` both pass, and a `grep`
  finds no remaining barrel re-export of the in-scope symbols in
  `pr-address/src`.
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
- Removing the `gateways.ts` re-export barrel touches every consumer importing
  gateway types from `gateways.ts`. Low risk (pure import-path movement) but
  broad blast radius — keep the diff self-contained.

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
