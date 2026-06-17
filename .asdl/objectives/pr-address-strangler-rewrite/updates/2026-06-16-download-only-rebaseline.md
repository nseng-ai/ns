# Download-Only Rebaseline

## Summary

The Objective has been rebaselined around deletion rather than a RunEngine strangler. The old `pr-address` workflow engine may be deleted: payload sessions, classification, planning, resolver payload construction, mutation orchestration, checkpoints, finalization, JSON-pointer detail lookup, and the stack-address workflow are no longer durable contracts to preserve.

The retained foundation is deliberately small: keep `pr-address` only as a tiny read-only downloader package/CLI around `download-feedback`, plus minimal branch-to-PR plumbing while `/pr:download-stack-feedback` still needs it. Future addressing work should rebuild from the two Pi download surfaces, `/pr:download-feedback` and `/pr:download-stack-feedback`, instead of carrying forward the old payload-session workflow. `/code:pr-feedback-watch` should be retargeted to download-feedback-only behavior rather than preserving old session/mutation semantics.

This supersedes older plans that preserved `pr-address` as a lightweight roaster-backed wrapper or restored a three-zone `app`/`core`/`legacy` RunEngine architecture. The package can remain named `pr-address` during the transition, but its meaning is downloader plumbing, not an addressing engine.

## Objective Impact

The active roadmap changes from restoring/choosing a strangler architecture to a deletion-first sequence:

1. Rebaseline Objective and public guidance around download-only `pr-address`.
2. Delete obsolete stack-address guidance/workflow surfaces.
3. Retarget `/code:pr-feedback-watch` to the download-feedback foundation.
4. Delete old `pr-address` workflow commands and tests while preserving `download-feedback` and minimal stack-download plumbing.
5. Close once no user-facing skill/docs route agents into the old workflow and the tiny downloader remains usable.

Public guidance was updated in `skills/pr-address/` and `ts/packages/pr-address/README.md` to mark the old workflow families as retired and scheduled for deletion.

## Follow-Ups

- Delete the old workflow command families: `prepare-run`, payload/session helpers, classification/planning, detail lookup, resolver-payload builders, mutation helpers, checkpoints, and finalization.
- Delete or retire `stack-address` guidance and references.
- Retarget `/code:pr-feedback-watch` so it only watches/downloads/injects feedback through the downloader foundation.
- Keep `/pr:download-feedback` and `/pr:download-stack-feedback` working during the deletion.
