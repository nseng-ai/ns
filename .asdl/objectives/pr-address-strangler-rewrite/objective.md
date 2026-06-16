# pr-address Strangler Rewrite — Delete the Workflow Engine, Keep the Downloader

## Thesis

`pr-address` grew into a large workflow engine for addressing PR review feedback: payload sessions, classification templates, planning, resolver payloads, GitHub mutation helpers, checkpoints, finalization, detail lookup, and stack-address orchestration. That implementation is now the wrong foundation.

The useful retained capability is much smaller: fetch current GitHub PR feedback as agent-readable Markdown. The active strategy is deletion-first: keep `pr-address` only as a tiny read-only downloader package/CLI around `download-feedback`, plus minimal branch-to-PR plumbing while `/pr:download-stack-feedback` still needs it. Delete the old addressing workflow engine and rebuild any future workflow from the two download surfaces:

- `/pr:download-feedback`
- `/pr:download-stack-feedback`

This supersedes both earlier directions: the three-zone `src/{core,legacy,app}` RunEngine strangler and the older roaster-backed `pr-address` wrapper plan. `/code:pr-feedback-watch` may remain only if retargeted to watch/download/inject feedback through the download-feedback foundation; it must not preserve payload-session, classification/planning, mutation, checkpoint, or finalization semantics.

## Scope

In scope:

- Rebaseline Objective and public guidance around a download-only `pr-address` contract.
- Keep `pr-address exec download-feedback` as the retained read-only primitive.
- Keep minimal branch-to-PR lookup plumbing only as needed for `/pr:download-stack-feedback` until that logic has a better owner.
- Delete or retire `stack-address` guidance and current user-facing references.
- Retarget `/code:pr-feedback-watch` to download-feedback-only behavior.
- Delete old `pr-address` workflow command families and their tests/fixtures/schemas:
  - payload/session setup and chaining;
  - `prepare-run` and old payload-mode `get-feedback` workflow behavior;
  - classification templates and validation;
  - feedback planning and batching;
  - payload/detail lookup by JSON pointer;
  - resolver-payload construction;
  - GitHub mutation orchestration helpers;
  - batch checkpoints and finalization ledgers.
- Preserve enough downloader validation to prove `/pr:download-feedback` and `/pr:download-stack-feedback` remain usable.

## Non-Goals

- Do not restore `src/app`, `src/legacy`, RunEngine, or the three-zone strangler architecture.
- Do not preserve `pr-address` as a lightweight roaster-backed workflow wrapper.
- Do not rebuild classification, planning, batching, resolver gating, validation, or closeout semantics in this Objective.
- Do not move the downloader primitive to a new package unless a later explicit decision changes ownership.
- Do not mutate GitHub from the retained downloader foundation.
- Do not preserve old command compatibility for its own sake; this repo is private/unreleased and can break old `pr-address` workflow contracts.

## Completion Criteria

- Current Objective and public guidance state the download-only contract: `pr-address` is retained only as a tiny read-only downloader package/CLI, and the old addressing workflow engine is retired.
- `/pr:download-feedback` and `/pr:download-stack-feedback` remain usable through `download-feedback` and minimal branch-to-PR plumbing.
- `/code:pr-feedback-watch`, if retained, is retargeted to download-feedback-only behavior and no longer implies payload-session, classification/planning, mutation, checkpoint, or finalization workflow semantics.
- Active skill/docs no longer route agents to `stack-address` or old `pr-address` workflow commands for new work.
- Old `pr-address` workflow command families are deleted or made unreachable: payload/session setup and chaining, detail lookup, classification templates and validation, planning, resolver-payload construction, GitHub mutation orchestration, checkpoints, finalization, obsolete schemas, and tests that only preserve that retired contract.
- Evidence: retained downloader tests pass, Pi download surfaces pass, and package/workspace validation relevant to touched TypeScript and skill/docs passes.

## Assumptions and Risks

Assumptions:

- The two download surfaces are the right foundation for future review-feedback work.
- The `pr-address` package name can remain temporarily without implying workflow-engine ownership, as long as active guidance describes it as downloader-only.
- Stack feedback download can be preserved with structured stack discovery plus per-PR downloads, without keeping stack-address.
- Any future addressing workflow should be planned as a new Objective rather than resurrecting the old payload-session machinery.

Risks:

- Historical Objective records and docs still mention preserving `pr-address` as a wrapper or improving stack-address. Mitigation: current active guidance and Semantic Updates explicitly supersede those records.
- Deleting old commands may break private habits or scripts. Accepted: the repo is private/unreleased, and the user explicitly chose deletion over compatibility.
- A tiny downloader package could regrow workflow semantics if future changes add planning or mutation convenience there. Mitigation: keep downloader-only scope explicit and move any rebuilt workflow to a separate Objective.
- Retargeting `/code:pr-feedback-watch` may be more involved than the docs update. Mitigation: make it a separate roadmap row before deleting package internals it might still call.

## Open Questions

- After the old workflow commands are deleted, should the downloader primitive stay in the tiny `pr-address` package, move into `pi-extensions`, move into roaster, or become a new small package?
- What future Objective, if any, should rebuild an addressing workflow on top of the download-feedback foundation?
- Which historical docs should remain as provenance versus be removed or amended because agents might treat them as current instructions?
