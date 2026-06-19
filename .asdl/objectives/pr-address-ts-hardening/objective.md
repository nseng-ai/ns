# pr-address Core Hardening — Durable Security & Correctness Fixes in the Salvaged Zone

## Thesis

An advisory audit of `ts/packages/pr-address` (improve skill, standard depth,
commit `80dbd8b75`) surfaced 14 findings across security, correctness, tests,
and tech debt. Most of them lived in the orchestration / payload-store / session
machinery that the `pr-address-strangler-rewrite` Objective (now **closed /
completed**, 2026-06-18) has already frozen and deleted — fixing those would have
been throwaway work, and that code no longer exists. This Objective tracks the
findings that still exist in the current salvaged `core/`/downloader surface
(gateways and feedback collection/normalization) and therefore survived the
rewrite. These are real defects — including a local file-read primitive and a
silent data-loss path on the feature's core input — worth fixing on trunk now
that the strangler has landed its downloader-only surface. The Objective has been
rebaselined against the current downloader-only ground truth: `read-feedback-detail`
and the payload-store/session surface are no longer present, so their historical
audit finding is not active scope here.

The legacy-zone findings are deliberately **not** in scope: they are recorded
under "Non-Goals" as pointers to the (now-completed) strangler rewrite, which
already deleted that code, so they are not re-audited and not patched.

## Scope

Fix the three remaining durable findings in `ts/packages/pr-address/src`:

- **Security — `gh api -F`/`@` file-read primitive.** The current downloader-only
  code no longer has the old reply/resolve mutation helpers, but the
  thread/comment pagination helpers still pass string GraphQL variables via
  `gh`'s `-F` flag (`reviewThreadPageArgs` and
  `reviewThreadCommentPageArgs` in `gateways.ts`). `gh` interprets a value
  beginning with `@` as a filename to read (and `@-` as stdin). Switch string
  cursor/thread-id fields to `-f` (raw); keep `-F` only for typed/coerced fields
  and `gh` placeholders that require it.
- **Correctness — silent comment drop on unparseable IDs.** `numericId` in
  `gateways.ts` coerces any non-integer id to `0`, and review/discussion
  comments with id `0` are filtered out after normalization. When GitHub returns
  a null `databaseId` with a string GraphQL node id, the comment silently
  vanishes from the downloaded feedback and the manifest counts. Surface a parse
  failure or carry the node id through instead of coercing to a sentinel that is
  then dropped.
- **Tech debt / DX — remaining barrel re-exports.** `gateways.ts` still
  re-exports types from `core/gateways.ts`, and `index.ts` still re-exports from
  `cli.ts`, both violating the repo's no-reexport / canonical-import rule
  (AGENTS.md). Current ground truth already removed the old
  `stdoutModeRequestShape` dead export and includes `PRLookupMiss` in the
  gateway re-export set, so this row is now only about removing the remaining
  re-export surfaces and repointing importers at canonical modules.

Each fix lands with regression test evidence using the existing in-memory
gateway fakes (no mocks), per the repo's fake-driven testing architecture.

## Non-Goals

These findings targeted code that the now-completed `pr-address-strangler-rewrite`
(closed `completed`, 2026-06-18) has already deleted, so they are **not** active
work here:

- Batch and single-op resolve idempotency on replay (audit findings #2, #4) and
  their characterization tests (#3 `continue_on_error: true` branch, #5
  post-mutation write-failure branch) — the resolve/mutation helpers they
  targeted are gone from the current surface. No "dangerous mutation parity"
  follow-up Objective exists; the strangler's closeout parks any future
  addressing workflow as a fresh Objective to be created on demand.
- Checkpoint-missing detection coupled to a human-readable message prefix (#7)
  and the untested checkpoint-recovery branches + orphaned fixture (#14) — the
  session/checkpoint machinery they lived in has been removed by the strangler.
- `payload-store.ts` god-module split (#10) and the `PayloadReference`-defined-3×
  consolidation (#11) — `payload-store` was deleted by the strangler.
- Operation-result schema drift between runtime types and `--json-schema` docs
  (#6) — the workflow `exec` surface this drift lived in was retired by the
  strangler's download-only cutover (there is no RunEngine contract); any
  residual schema concern on the surviving `operation-schemas` would belong to a
  fresh Objective.

Also out of scope: the strangler rewrite itself, any new RunEngine/zone work,
performance tuning, dependency upgrades, and pushing or opening PRs.

## Completion Criteria

- All three active scope findings are fixed in `ts/packages/pr-address/src` and each has
  a regression test that fails against the pre-fix code and passes after.
- The `gh` pagination calls send string thread ids and cursors as raw fields
  (`-f`), verified by a test asserting an `@`-prefixed string variable is
  transmitted literally rather than triggering a file read.
- A review/discussion comment whose `databaseId` is null and whose id is a
  non-numeric node id is preserved (or surfaces an explicit error), not silently
  dropped — covered by a test.
- `gateways.ts` and `index.ts` contain no type/value re-export barrels for the
  in-scope symbols, and importers use canonical module paths.
- Evidence: `pnpm --dir ts --filter @asdl/pr-address run check` and
  `pnpm --dir ts --filter @asdl/pr-address run test` both pass.

## Assumptions and Risks

**Assumptions**

- The current downloader-only `pr-address` surface is the durable target for
  this Objective. The strangler is now closed/completed, so this surface is
  stable; no further strangler-driven reshaping is expected.
- `read-feedback-detail`, payload-store/session machinery, and the raw
  `--payload-path` surface are absent from current ground truth; the historical
  containment-bypass finding is treated as already retired with that surface,
  not as active work.
- `gh`'s documented `-F`/`@` semantics (value starting with `@` is read from a
  file, `@-` from stdin) hold for the installed `gh` version; the fix relies on
  `-f` treating the value as a literal string.

**Risks**

- **(Retired)** The strangler rewrite (`pr-address-strangler-rewrite`) was
  previously open and moving the same files, which created rebase/merge-friction
  risk for these fixes. It is now **closed / completed** and its download-only
  deletion has landed, so the target surface is stable on trunk and this risk is
  retired. Keep each fix a small, self-contained diff regardless.
- Removing the `gateways.ts` re-export barrel touches every consumer importing
  gateway types from `gateways.ts`; the change is type-checked but has broad
  fan-out. Low risk (pure import-path movement) but broad blast radius.

## Open Questions

- Should the `gh -F`→`-f` fix also add a boundary-level rejection of
  `@`-prefixed thread ids (defense in depth), or is switching to raw fields
  sufficient on its own?
