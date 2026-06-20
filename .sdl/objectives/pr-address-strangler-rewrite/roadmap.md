# Roadmap

## Work

- [x] Rebaseline the Objective around a download-only `pr-address` foundation instead of restoring the three-zone RunEngine strangler.
  - Evidence: Semantic Update `2026-06-16-download-only-rebaseline.md` records that old `pr-address` workflow machinery and `stack-address` are deletable, while `pr-address` remains only as a tiny read-only downloader package/CLI around `download-feedback` plus minimal stack-download plumbing. Public guidance in `skills/pr-address/` and `ts/packages/pr-address/README.md` marks the old workflow families retired.

- [x] Delete obsolete stack-address guidance and references.
  - Evidence: Semantic Update `2026-06-16-download-only-deletion-implemented.md` records that active stack-address bootstrap guidance was retired and points stack feedback users to `/pr:download-stack-feedback`. Current active skill guidance no longer tells agents to use stack-address for new work; remaining stack-address mentions are historical Objective/update provenance or historical retrospective content.

- [x] Retarget `/code:pr-feedback-watch` to download-feedback-only behavior.
  - Evidence: Semantic Update `2026-06-16-download-only-deletion-implemented.md` records that `/code:pr-feedback-watch` now calls `pr-address exec download-feedback`, injects downloaded Markdown for triage, and no longer calls `prepare-run`, depends on payload artifacts, uses JSON-pointer detail lookup, or instructs agents to resolve/reply through `pr-address` mutation helpers. The closeout pass updated parity wording to describe downloader-only prompt injection and portable read-only feedback download/normalization.

- [x] Delete old `pr-address` workflow command families while preserving the tiny downloader.
  - Evidence: Semantic Update `2026-06-16-download-only-deletion-implemented.md` records that the hidden exec surface exposes only `download-feedback` and `map-branch-prs`; retired workflow modules, tests, golden fixtures, payload-store support, compact output support, and mutation-capable gateway methods were deleted; retained downloader schema/help/tests passed. The closeout pass updated current-facing `pr-address` README and skill references from transition/deletion-future wording to current-state downloader-only wording.

- [x] Close the Objective when the old workflow is unreachable from current guidance and the retained downloader foundation is stable.
  - Evidence: current user-facing skill/docs route agents to `/pr:download-feedback` and `/pr:download-stack-feedback`, not stack-address or the old `pr-address` workflow engine. Retained validation passed for `@asdl/pr-address`, `@asdl/pi-extensions`, and targeted Pi feedback-download/watch tests during closeout. `just dprint-check` is not used as closure evidence because default-branch Markdown has an unrelated formatting issue in another Objective record; the closeout pass intentionally reverted that unrelated autofix to keep Objective tracking scoped to this slug.

## Parked

- Rebuilding a full addressing workflow on top of the downloader foundation. That should be a separate Objective with a concrete contract, not a resurrection of the deleted payload-session workflow.
- Moving the downloader primitive out of `pr-address` into `pi-extensions`, roaster, or a new package. Current decision: keep a tiny `pr-address` package for compatibility while deleting workflow machinery.
- Restoring `src/app`, `src/legacy`, RunEngine, or the old three-zone strangler plan. This was superseded by the download-only deletion rebaseline.
