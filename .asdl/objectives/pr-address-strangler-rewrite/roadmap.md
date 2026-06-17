# Roadmap

## Work

- [x] Rebaseline the Objective around a download-only `pr-address` foundation instead of restoring the three-zone RunEngine strangler.
  - Evidence: Semantic Update `2026-06-16-download-only-rebaseline.md` records that old `pr-address` workflow machinery and `stack-address` are deletable, while `pr-address` remains only as a tiny read-only downloader package/CLI around `download-feedback` plus minimal stack-download plumbing. Public guidance in `skills/pr-address/` and `ts/packages/pr-address/README.md` now marks the old workflow families retired.

- [ ] Delete obsolete stack-address guidance and references.
  - Remove or retire the standalone stack-address skill/docs path and any user-facing guidance that routes agents through the old stack-address workflow. Preserve historical docs/Objectives as provenance when clearly historical, but current skills and parity/docs should point to `/pr:download-stack-feedback` instead.
  - Evidence target: no active skill guidance tells agents to use stack-address for new work; stack feedback download still works through structured stack discovery plus per-PR downloads.

- [ ] Retarget `/code:pr-feedback-watch` to download-feedback-only behavior.
  - Keep the watcher affordance if useful, but make it watch/download/inject feedback through the `download-feedback` foundation only. It must not seed payload sessions, invoke old classification/planning, or imply mutation/checkpoint/finalization workflow semantics.
  - Deletion catalog: once retargeted, `ts/packages/pi-extensions/src/pr-feedback-watch.ts` should no longer need `PrepareRunData` parser/types, `parsePrepareRunData`, `feedbackItemKeysFromPrepareRun`, `prepareRunManifestRecord`, review/thread/discussion manifest parsers, payload-path/locator helpers, JSON-pointer prompt guidance, the `pr-address exec prepare-run` call, or prompt text that tells agents to use `read-feedback-detail`/payload locators. Its tests should assert downloader-only prompt injection instead of `prepare-run` dispatch.
  - Evidence target: Pi extension tests show watcher calls the retained downloader path; docs/parity notes describe it as a download/watch surface rather than an addressing workflow.

- [ ] Delete old `pr-address` workflow command families while preserving the tiny downloader.
  - Retained spine: keep `download-feedback`, `map-branch-prs`, the CLI/bootstrap needed to register only those exec commands, `core/feedback-snapshot.ts`, `core/feedback-summary.ts`, and the read-only GitHub/git gateway methods needed for current-branch PR lookup, PR lookup by number, open-PR branch mapping, feedback collection, and repo-context preflight.
  - Delete payload/session setup and chaining, `prepare-run`, old payload-mode `get-feedback`, payload/detail lookup, classification templates and validation, planning, resolver-payload construction, GitHub mutation orchestration, reply formatting, checkpoints, finalization, retired schemas, obsolete fixtures, and tests that only preserve the old workflow contract.
  - Concrete source deletion candidates: `prepare-run.ts`, `feedback-collection.ts`, `classification-operations.ts`, `classification.ts`, `feedback-plan-contracts.ts`, `read-feedback-detail.ts`, `resolve-thread-batch-payload.ts`, `thread-resolution-build-artifact.ts`, `mutation-operations.ts`, `batch-checkpoint.ts`, `finalization.ts`, `session-inputs.ts`, and `session-artifacts.ts`.
  - Concrete payload/session deletion candidates: `payload-store.ts`, `payload-store-context.ts`, `payload-store-memory.ts`, payload-store fields on `PrAddressContext`, and compact-output artifact writing in `stdout-mode.ts`/`exec-operation.ts`, provided `map-branch-prs` no longer needs compact mode. `/pr:download-stack-feedback` already invokes `map-branch-prs` with full stdout.
  - Concrete gateway pruning candidates: remove mutation methods (`addPrDiscussionComment`, reactions, thread replies, resolve/unresolve) and workflow-only git methods (`getWorkTreeRoot`, `getBranchHeadOid`, `getCommitChangedFiles`, `getRestructuredFiles`) if no retained downloader path uses them.
  - Concrete schema/test/fixture deletion candidates: operation schema modules for classification, mutation, and payload; collection schemas other than `download-feedback` and `map-branch-prs`; golden fixture directories for classification, validation, planning, prepare/get-feedback payloads, resolver payloads, checkpoints, finalization, and reply formatting; scenario/unit/gateway tests that only cover those retired commands, payload store, session artifacts, schema drift for retired schemas, or reply formatting.
  - Keep `download-feedback` and any minimal branch-to-PR lookup needed by `/pr:download-stack-feedback` until that logic has a better owner.
  - Evidence target: `pr-address exec download-feedback` still works; `/pr:download-feedback` and `/pr:download-stack-feedback` still work; old workflow commands are gone or explicitly unavailable; package check/tests pass after deleting obsolete fixtures.

- [ ] Close the Objective when the old workflow is unreachable from current guidance and the retained downloader foundation is stable.
  - Completion requires no current user-facing skill/docs routing agents into the old `pr-address` or `stack-address` workflows, plus a tiny downloader package/CLI that still supports the two Pi feedback-download surfaces.

## Parked

- Rebuilding a full addressing workflow on top of the downloader foundation. That should be a separate Objective with a concrete contract, not a resurrection of the deleted payload-session workflow.
- Moving the downloader primitive out of `pr-address` into `pi-extensions`, roaster, or a new package. Current decision: keep a tiny `pr-address` package for compatibility while deleting workflow machinery.
- Restoring `src/app`, `src/legacy`, RunEngine, or the old three-zone strangler plan. This was superseded by the download-only deletion rebaseline.
