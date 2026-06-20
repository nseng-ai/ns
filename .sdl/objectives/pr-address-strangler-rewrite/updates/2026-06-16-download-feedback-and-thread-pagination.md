# Read-Only `download-feedback` Command and Review-Thread Pagination

## Summary

A new read-only `download-feedback` command lands in `pr-address`, rendering the
current PR's feedback as an LM-ready Markdown triage prompt, and the GitHub
review-thread collection now paginates fully.

Two distinct changes:

- **Pagination.** `reviewThreadsQuery` now pages the `reviewThreads` connection
  (`after: $threadCursor`, `pageInfo { hasNextPage endCursor }`) and raises
  per-thread `comments` to `first: 100` with its own page info; a new
  `reviewThreadCommentsQuery` continues paging comments for any thread that
  overflows. The old "does not paginate" limitation comment is removed. This
  closes the under-collection gap behind the Objective's "never drop a feedback
  item" thesis.
- **`download-feedback` command.** Implemented in `src/download-feedback.ts` and
  registered on the existing hidden bootstrap `exec` surface
  (`src/exec-commands.ts`). It reuses the carved `core/` leaves
  (`core/feedback-snapshot.ts` collection, `core/feedback-summary.ts`, including
  a new `isAutomationLikeDiscussionComment` helper) and emits a found/target/
  counts/markdown result with include flags for resolved threads, automation
  comments, and empty reviews. A `pi-extensions` `pr.ts` wires it as a Pi
  extension with a parity-registry entry.

## Objective Impact

No roadmap row changed state. This is **not** the planned RunEngine `feedback`
verb: `download-feedback` lives on the bootstrap/legacy `exec` surface, not on
`app/`/RunEngine, and it accepts a `harness_session_id` input rather than the
verb/handle vocabulary the new contract requires. The open RunEngine rows
(`feedback`/`details`/`status` through the app boundary) remain unchecked and
must subsume this command rather than leave a parallel surface.

The pagination change does de-risk a core assumption: the carved collection
leaves were reading a truncated thread/comment set on large PRs. With both
connections paged, `core/` collection inputs are no longer silently capped,
strengthening the "never drop a thread" guarantee the Objective rests on. This
is recorded in `## Assumptions and Risks`, along with a new risk noting the
second read-only feedback surface that the RunEngine verbs must converge.

The command consumes carved `core/` leaves directly and does not reintroduce
payload-store/session vocabulary into `core/`; the real GitHub adapter and the
paginated query remain in bootstrap root (`src/gateways.ts`), consistent with
the carve note that real subprocess adapters stay in root until their later
strangler row.

## Follow-Ups

- When building the RunEngine `feedback`/`details` verbs, subsume or replace
  `download-feedback` instead of leaving a third read-only surface; do not carry
  its `harness_session_id` input shape into the app contract.
- Move the paginated real GitHub adapter (`src/gateways.ts`) into `legacy/` (or
  its adapter row) on the later `git mv` orchestration slice; the pagination fix
  rides along with that module wherever it lands.

## Evidence

- Local branch diff of `pr-download-feedback-markdown-primitive` against
  Graphite parent `pr-address-feedback/shared-parsing-gateway-result`
  (single commit `9ea4b6ec0`); changes are committed, working tree clean.
- Verification: `@asdl/pr-address` Vitest suite passed (34 files, 416 tests) and
  `@asdl/pi-extensions` Vitest suite passed (62 files, 780 tests). Full
  `just ts-check` passed across the workspace at this tip during the preceding
  restack.
- PR evidence was not required; the local committed branch diff was sufficient.
