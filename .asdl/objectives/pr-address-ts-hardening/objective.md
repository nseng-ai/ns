# pr-address Core Hardening — Durable Security & Correctness Fixes in the Salvaged Zone

## Thesis

An advisory audit of `ts/packages/pr-address` (improve skill, standard depth,
commit `80dbd8b75`) surfaced 14 findings across security, correctness, tests,
and tech debt. Most of them live in the orchestration / payload-store / session
machinery that the open `pr-address-strangler-rewrite` Objective is freezing and
will eventually delete — fixing those is throwaway work. This Objective tracks
only the findings that live in the **salvaged `core/` zone** (gateways, feedback
collection/normalization, reply formatting, body-on-demand lookup) and therefore
survive the rewrite. These are real defects — including a local file-read
primitive and a silent data-loss path on the feature's core input — worth fixing
on trunk now rather than waiting for the strangler to finish.

The legacy-zone findings are deliberately **not** in scope: they are recorded
under "Non-Goals" as pointers to the strangler rewrite and its planned
mutation-parity follow-up, so they are not re-audited and not patched in code
that is scheduled for deletion.

## Scope

Fix the four durable, core-zone findings in `ts/packages/pr-address/src`:

- **Security — `gh api -F`/`@` file-read primitive.** `addReviewThreadReply`,
  `resolveReviewThread`, `unresolveReviewThread`, and the thread/comment
  pagination helpers pass `threadId` and cursors via `gh`'s `-F` flag
  (`gateways.ts:305,313,322,444,451`). `gh` interprets a value beginning with
  `@` as a filename to read (and `@-` as stdin). `--thread-id` is user-supplied,
  so a crafted `@/path` submits that file's contents as the GraphQL variable.
  Switch the string ID/cursor fields to `-f` (raw); keep `-F` only for the
  integer `number` (which needs typed coercion). Optionally reject `@`-prefixed
  thread ids at the request boundary as defense in depth.
- **Correctness — silent comment drop on unparseable IDs.** `numericId`
  (`gateways.ts:517`) coerces any non-integer id to `0`, and review/discussion
  comments with id `0` are filtered out (`gateways.ts:486,285`). When GitHub
  returns a null `databaseId` with a string GraphQL node id, the comment
  silently vanishes from the downloaded feedback and the manifest counts.
  Surface a parse failure or carry the node id through instead of coercing to a
  sentinel that is then dropped.
- **Security — `read-feedback-detail --payload-path` containment bypass.** In
  raw-path mode, `read-feedback-detail.ts:126-130` validates only that the
  basename ends with `.raw.json`, then `readLooseJsonFile` bare-reads the path
  (`:130`), bypassing the symlink/containment guards every other store read
  enforces (`payload-store.ts:397-429`). Apply the containment guard to
  user-supplied `--payload-path` and drop the loose-read fallback.
- **Tech debt / DX — barrel re-exports + dead export.** `gateways.ts:29-50`
  re-exports ~20 types from `core/gateways.ts` (already drifted — it exports
  `PRLookupMiss`, absent from the import block) and `index.ts:1` re-exports from
  `cli.ts`, both violating the repo's no-reexport / canonical-import rule
  (AGENTS.md). `operation-schemas/shared.ts:20` exports `stdoutModeRequestShape`
  with zero references. Point importers at canonical `core/gateways.ts` paths,
  drop the dead export.

Each fix lands with regression test evidence using the existing in-memory
gateway fakes (no mocks), per the repo's fake-driven testing architecture.

## Non-Goals

Explicitly deferred to `pr-address-strangler-rewrite` and its follow-ups, and
**not** to be patched in this Objective because the code is being frozen/deleted:

- Batch and single-op resolve idempotency on replay (audit findings #2, #4) and
  their characterization tests (#3 `continue_on_error: true` branch, #5
  post-mutation write-failure branch) — owned by the strangler's planned
  "dangerous mutation parity" follow-up Objective.
- Checkpoint-missing detection coupled to a human-readable message prefix (#7)
  and the untested checkpoint-recovery branches + orphaned fixture (#14) — the
  session machinery they live in is being removed by the strangler.
- `payload-store.ts` god-module split (#10) and the `PayloadReference`-defined-3×
  consolidation (#11) — `payload-store` is in the strangler's `legacy/`
  deletion target.
- Operation-result schema drift between runtime types and `--json-schema` docs
  (#6) — the `exec` doc-schema surface is replaced by the new RunEngine contract.

Also out of scope: the strangler rewrite itself, any new RunEngine/zone work,
performance tuning, dependency upgrades, and pushing or opening PRs.

## Completion Criteria

- All four scope findings are fixed in `ts/packages/pr-address/src` and each has
  a regression test that fails against the pre-fix code and passes after.
- The `gh` mutation/pagination calls send string thread ids and cursors as raw
  fields (`-f`), verified by a test asserting an `@`-prefixed thread id is
  transmitted literally rather than triggering a file read.
- A review/discussion comment whose `databaseId` is null and whose id is a
  non-numeric node id is preserved (or surfaces an explicit error), not silently
  dropped — covered by a test.
- `read-feedback-detail` rejects a symlinked or non-contained `--payload-path`
  instead of bare-reading it — covered by a test.
- `gateways.ts` and `index.ts` contain no type/value re-export barrels for the
  in-scope symbols; importers use canonical `core/gateways.ts` paths; the
  `stdoutModeRequestShape` export is gone.
- Evidence: `pnpm --dir ts --filter @asdl/pr-address run check` and
  `pnpm --dir ts --filter @asdl/pr-address run test` both pass.

## Assumptions and Risks

**Assumptions**

- The salvaged-`core/` boundary described by `pr-address-strangler-rewrite`
  (gateways, feedback collection/normalization, reply formatting/resolution
  modes, body-on-demand lookup as `core/`) is the durable target. If the
  strangler reshapes that boundary, the in-scope file paths here may move and
  this Objective's drift assumptions must be revalidated.
- `read-feedback-detail`'s body-on-demand lookup is salvaged to `core/`, making
  finding #8 durable. This is the one placement judgment call: the raw-path mode
  rides on payload-store `.raw.json` artifacts that belong to the legacy zone.
  If the body-lookup capability ends up re-expressed entirely behind the
  RunEngine without a raw `--payload-path` surface, the #8 fix may instead be
  satisfied by the rewrite — revalidate before implementing item 3.
- `gh`'s documented `-F`/`@` semantics (value starting with `@` is read from a
  file, `@-` from stdin) hold for the installed `gh` version; the fix relies on
  `-f` treating the value as a literal string.

**Risks**

- The strangler rewrite (`pr-address-strangler-rewrite`, open, actively
  updated) is moving the same files. Landing these fixes on trunk can create
  rebase/merge friction with that branch. Mitigation: keep each fix a small,
  self-contained diff scoped to a single concern, and coordinate sequencing with
  the strangler branch owner. Not yet de-risked.
- Tightening `read-feedback-detail` containment could break a legitimate
  "read a raw payload by explicit path outside the store" workflow if one
  exists. Mitigation: confirm no caller depends on unconstrained raw-path reads
  before removing the loose-read fallback. Not yet de-risked.
- Removing the `gateways.ts` re-export barrel touches every consumer importing
  gateway types from `gateways.ts`; the change is type-checked but has broad
  fan-out. Low risk (pure import-path movement) but broad blast radius.

## Open Questions

- Does any consumer (skill, test harness, or external caller) rely on
  `read-feedback-detail --payload-path` reading a path outside the session
  payload store? If yes, the #8 fix needs a sanctioned escape rather than a hard
  containment guard.
- Should the `gh -F`→`-f` fix also add a boundary-level rejection of
  `@`-prefixed thread ids (defense in depth), or is switching to raw fields
  sufficient on its own?
- Should item 3 (`read-feedback-detail` containment) wait until the strangler
  settles where body-on-demand lookup lives, to avoid fixing a path the rewrite
  removes?
