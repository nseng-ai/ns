# Provision/reconcile design seams cleaned up

## Summary

Implemented the provision/reconcile design-seam cleanup slice on branch `provision-reconcile-seam-cleanup` (stacked on `resolve-home-dir-harness-path-ownership`). No behavior change was intended or observed: reconcile report contents, CLI output, and ns-init outcomes are preserved, and existing test assertions survived with only mechanical symbol/composition updates.

Changes in `@nseng-ai/harness-artifacts`:

- **Single reconcile outcome builder.** `classifyReconcileAction` now takes `conflictingFiles` and returns `"conflicted"` when nonempty (equivalent to the previous `isForceRequired` forcing, since `isForceRequired` is defined as "some decision is `locally-edited-conflict`"). `reconcileConflictedOutcome` and the optional `action` override on `reconcileOutcomeFromProvision` are deleted.
- **Shared conflict-file extraction.** `conflictingFilesFromDecisions(decisions)` lives in `provision-apply.ts` and is used by both `applyPreparedProvision`'s conflict gate and the reconcile dry-run path.
- **Roots resolved once.** `runHarnessArtifactReconcile` resolves project-scope skill roots for `ALL_HARNESS_IDS` once into a Result-checked `Map<HarnessId, { rootPath; manifestPath }>`; `readProjectManifestSnapshots` and `skippedCollisionOutcomes` consume the map. The bare `throw` inside `skippedCollisionOutcomes` is gone and the function is now pure.
- **Public API narrowed to prepare/apply.** `previewHarnessArtifactProvision` and `applyHarnessArtifactProvision` are deleted; `previewFromPrepared` is exported through the `api.ts` barrel as the sanctioned preview projection. README pipeline steps 4–5 updated; tests compose `prepareProvision` + `previewFromPrepared`/`applyPreparedProvision`.
- **Composed outcome shape.** `ProvisionFirstPartySkillOutcome`'s `provisioned`/`conflicted` variants now intersect `HarnessArtifactProvisionPreview` instead of hand-repeating `plan`/`decisions`/`manifestPath`; `provisionFirstPartySkill`'s three construction sites spread `previewFromPrepared(prepared.value)`.
- **Shared conflict core + success/failure splitter.** `describeProvisionConflict` owns the canonical "N locally edited target file(s)" core sentence. `splitProvisionFirstPartySkillOutcome` splits outcomes into success (`provisioned`) vs a structured failure descriptor (`ProvisionFirstPartySkillFailure` with stable codes `catalog-source-unavailable` / `unknown-skill` / `provision-error` / `conflicted`). It imports no clinkr or ns-init types. `runSkillsInstall` and ns-init's `RealSkillMaterializer.materializeObjectiveSkills` now do a two-way branch and keep surface-specific framing (`--force` remedy, per-harness materialization message) in the adapter.

Review threads addressed by this slice (no GitHub thread mutation performed; disposition is a later roadmap row): `PRRT_kwDOR4YhMs6Oxej4`, `PRRT_kwDOR4YhMs6O0MTk`, `PRRT_kwDOR4YhMs6OzS1q`, `PRRT_kwDOR4YhMs6OzS1u`, `PRRT_kwDOR4YhMs6O0K-1`, `PRRT_kwDOR4YhMs6O54-H`, `PRRT_kwDOR4YhMs6O6UXL`, `PRRT_kwDOR4YhMs6OzSl6`.

Deliberate divergence: thread `PRRT_kwDOR4YhMs6OzSl6` suggested waiting for a third adapter before deduplicating the outcome switches; per explicit user decision during plan grilling, this slice fixes it now with the success/failure splitter instead of parking it.

Wording adaptation: ns-init's conflict error message was re-composed around the shared core sentence — previously "…: N target file(s) have local edits.", now "…: N locally edited target file(s)." Same facts, trivial re-composition; no test asserted the old wording.

Validation passed:

```bash
pnpm --dir ts --filter @nseng-ai/harness-artifacts run check
pnpm --dir ts --filter @nseng-ai/ns-init run check
pnpm --dir ts --filter @nseng-ai/harness-artifacts run test
pnpm --dir ts --filter @nseng-ai/ns-init run test
pnpm --dir ts run lint
just ts-format-check
```

Stale-symbol greps for `previewHarnessArtifactProvision`, `applyHarnessArtifactProvision`, and `reconcileConflictedOutcome` return zero hits under `ts/`.

## Objective Impact

The roadmap row **Clean up provision/reconcile design seams** is complete: the reconcile flow reads as one domain pipeline (roots-once → prepare → single outcome builder), the provision public API is prepare/apply plus `previewFromPrepared`, and both adapters are thin two-way branches over a shared failure descriptor. Remaining work in this Objective: schema/source-of-truth duplication cleanup, then review-thread disposition and umbrella synthesis.

## Follow-Ups

- Disposition the eight review threads above (plus previously identified stale candidates) with direct evidence, only after explicit user authorization.
- Schema/source-of-truth duplication bucket remains (separate roadmap row); the public `reconcileArtifactOutcomeSchema` / `reconcileReportSchema` / `skillsInstallResultSchema` shapes were deliberately untouched here.
