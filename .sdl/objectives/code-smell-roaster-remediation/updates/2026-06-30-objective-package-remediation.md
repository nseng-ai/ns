# Objective Package Smell Remediation

## Summary

Remediated the `objective` package code-smell cluster's six confirmed structural findings:

- Added `operations/objective-target.ts` so read-objective and check-objective share Objective root/slug/existence resolution.
- Reused shared list-rendering helpers (`emptyMessage` and `renderSlugs`) from `operations/list-objectives.ts` in the pretty renderer.
- Centralized tracking-gate result construction in `buildTrackingGateResult`, including missing-objective defaults, branch-diff counts, and summary derivation.
- Replaced repeated archive/unarchive path forks in `storage.ts` with the `objectiveArchivePathRules` direction table.
- Split `api.ts` into focused modules: `objective-api-client.ts` for the client facade and `objective-selection-flow.ts` for interactive picker orchestration, while keeping `api.ts` as the curated public export surface.
- Replaced duplicate real-storage file/dir classifiers with one `kindFromTypeChecks` helper.

Validation passed: `pnpm --dir ts --filter @sdl/objective run check`, `pnpm --dir ts --filter @sdl/objective run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

The six `references/objective-package.md` findings are now dispositioned as fixed in `roadmap.md`. This reduces the open code-smell-roaster backlog by one package cluster without changing Objective CLI/API behavior.

## Follow-Ups

No objective-package follow-up is known. Future Objective read/check paths should reuse `resolveObjectiveRecordTarget`, and future API additions should keep client facade code and picker orchestration in their focused modules rather than expanding `api.ts` again.
