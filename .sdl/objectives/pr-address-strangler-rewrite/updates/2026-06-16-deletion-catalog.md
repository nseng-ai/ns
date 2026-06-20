# Deletion Catalog for Download-Only Cutover

## Summary

A focused source audit catalogued the code that should become dead once `pr-address` is reduced to the downloader-only contract.

The retained spine is deliberately small:

- `ts/packages/pr-address/src/download-feedback.ts`
- `ts/packages/pr-address/src/map-branch-prs.ts`
- CLI/bootstrap modules needed to register only retained exec commands (`cli.ts`, `index.ts`, the pruned `exec-commands.ts`, and pruned `exec-operation.ts`)
- `core/feedback-snapshot.ts` and `core/feedback-summary.ts`
- read-only portions of `context.ts`, `gateways.ts`, `core/gateways.ts`, and operation-schema files needed for `download-feedback` and `map-branch-prs`
- Pi download surfaces in `ts/packages/pi-extensions/src/pr.ts` and `test/pr-download-feedback.test.ts`

The old workflow deletion set is now concrete. Source modules expected to disappear include:

- `prepare-run.ts`
- `feedback-collection.ts` (`get-feedback`)
- `classification-operations.ts`
- `classification.ts`
- `feedback-plan-contracts.ts`
- `read-feedback-detail.ts`
- `resolve-thread-batch-payload.ts`
- `thread-resolution-build-artifact.ts`
- `mutation-operations.ts`
- `batch-checkpoint.ts`
- `finalization.ts`
- `session-inputs.ts`
- `session-artifacts.ts`

Payload/session storage should also become removable once compact output is not needed by retained commands:

- `payload-store.ts`
- `payload-store-context.ts`
- `payload-store-memory.ts`
- payload-store fields on `PrAddressContext`
- compact-output artifact writing in `stdout-mode.ts`/`exec-operation.ts`

The retained `/pr:download-stack-feedback` path already invokes `map-branch-prs` with full stdout, so compact mode is not currently a downloader requirement.

Gateway pruning should remove mutation-capable methods (`addPrDiscussionComment`, `addPrDiscussionCommentReaction`, `addReviewThreadReply`, `resolveReviewThread`, `unresolveReviewThread`) and workflow-only git methods (`getWorkTreeRoot`, `getBranchHeadOid`, `getCommitChangedFiles`, `getRestructuredFiles`) if no retained downloader path uses them.

The `/code:pr-feedback-watch` retarget should make prepare-run/payload-locator pieces dead: `PrepareRunData` types and parser, `feedbackItemKeysFromPrepareRun`, `prepareRunManifestRecord`, review/thread/discussion manifest parsers, payload-path/locator helpers, JSON-pointer prompt guidance, the `pr-address exec prepare-run` invocation, and prompt text that tells agents to use `read-feedback-detail` or payload locators.

Tests and fixtures expected to disappear include scenario/unit/gateway coverage for retired commands, payload store/session artifacts, schema drift for retired schemas, reply formatting, and golden fixture directories for classification, validation, planning, prepare/get-feedback payloads, resolver payloads, checkpoints, finalization, and reply formatting. Retained tests should focus on `download-feedback`, `map-branch-prs`, `/pr:download-feedback`, `/pr:download-stack-feedback`, real read-only GitHub collection, and downloader-relevant support fakes.

## Objective Impact

The roadmap now carries the deletion catalog directly under the watcher-retarget and old-workflow-deletion rows. This turns the deletion-first strategy from a broad list of retired concepts into a concrete implementation checklist while preserving the Objective's retained-surface boundary.

The risks section now calls out compact-output payload artifacts as a specific dependency to eliminate or prove unnecessary, rather than leaving payload-store deletion implicit.

No roadmap row is complete from this catalog alone. It is planning evidence for the next implementation slices: first retire active stack-address guidance, then retarget `/code:pr-feedback-watch`, then delete the old `pr-address` workflow engine and obsolete tests/fixtures.

## Follow-Ups

- During `/code:pr-feedback-watch` retargeting, prove the watcher no longer calls `prepare-run` and no longer emits payload-locator/`read-feedback-detail` instructions.
- During `pr-address` deletion, prune the exec operation table and schema registry down to `download-feedback` and `map-branch-prs` before deleting transitive modules.
- Remove compact-output/payload-store machinery only after confirming no retained downloader path still uses compact mode.
- Keep the retained downloader validation green: `pr-address exec download-feedback`, `map-branch-prs`, `/pr:download-feedback`, and `/pr:download-stack-feedback`.
