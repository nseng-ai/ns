# Submit gateway de-leaked; shared failure catalog built

## Summary

The submit/catalog row landed via an autorun runner step (commit
`06ccafe87` on `flow-submit-failure-catalog`, fourth code step in the
stack; provenance trailer `Objective-Runner-Step: flow-deepening-round-2`).

- Graphite-stderr classification moved behind the `SubmitGateway` seam:
  regex classifiers live in `src/submit/submit-detect.ts`, imported only
  by the gateway implementation (`src/submit/submit-gateway.ts`) and its
  own unit test. Orchestration in `submit.ts` consumes typed domain
  results (`SubmitPreflightResult` with `restack_required`,
  `SubmitRestackResult` with `conflict` + `conflictedFiles`,
  `SubmitRunResult`, `CurrentPrVerificationResult`). Raw command
  transcripts still pass through result payloads for display — that is
  presentation plumbing, not classification vocabulary.
- One catalog idiom: `src/shared/failure-catalog.ts` (entry = arm +
  verdict + message, exhaustive by type), applied to submit failures
  (`src/submit/submit-failure-catalog.ts`) and to both autobranch
  transaction switches (`latest-commit-transaction.ts`,
  `dirty-transaction.ts`) — completing the one-edit-site goal the round-1
  co-location slice deferred.

Evidence: parent-verified importer graph for `submit-detect`;
`test/unit/failure-catalog.test.ts` ("adding a failure arm is one catalog
entry"); flow package suite passes (415 tests); `just ts-check` green; the
step reported the full Definition of Progress suite green.

## Objective Impact

- The submit/catalog completion criterion holds. All four `Policy: direct`
  work streams of this Objective are now delivered (channel operation
  shape, `--force` semantics, forwarder shims, submit/catalog), plus the
  extraction inventory.
- Only the extraction migration (`Policy: preview`, slice map in
  `updates/2026-07-02T174146Z-land-extraction-inventory.md`), the
  round-trip retirement it unlocks, and the parked presentation row's
  closure-gate decision remain.
- The autorun loop stops here by design: the migration row requires
  per-slice preview via `objective-next`.

## Follow-Ups

- Begin the migration row at slice 1 (strict merge gate + validator
  dedupe onto the domain core) via `objective-next` preview.
