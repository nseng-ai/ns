# Context-Profiler and Thermo-Council Final Slice Landed

## Summary

The final two active Internal Pi-tools deepening candidates landed.

Context-profiler changes:

- `EpisodeScopeSeed` and `InterrogationScope` moved from `interrogation-prompt.ts` to `context-profiler/model.ts`.
- Production consumers import the model type while the controller remains the deliberate view/extension seam.
- `errors.ts` and `lm-json.ts` shim files were deleted; callers import `@ns/pi/shared/errors` and `@ns/pi/models/lm-json` directly.
- `view.ts` did not grow materially: 1047 lines before, 1048 after due import layout only.

Thermo-council changes:

- `index.ts` is now the deliberate root/test barrel instead of bouncing through `extension.ts`.
- `extension.ts` is focused on Pi registration, parity metadata, and extension host types.
- `contract.ts` owns public domain/terminal constants and types; adapter/local helper types moved to the modules that own them.
- `types.ts`, `outcomes.ts`, `prompt-blocks.ts`, and `constants.ts` were deleted.
- `reviewerOutcomeFromRunnerResult` is intentionally exported from the root barrel and tested through that route instead of via a private orchestrator deep import.

## Objective Impact

This completes the context-profiler interrogation consolidation and thermo-council flattening roadmap rows. With candidate 1 parked, candidate 2 landed, candidate 3 landed, and candidates 4–5 now landed, no non-parked Objective work remains.

Verification evidence:

- `rg -n 'from "\\./(errors|lm-json)\\.ts"|from "../../src/context-profiler/(errors|lm-json)\\.ts"' ts/packages/internal/pi-tools/src/context-profiler ts/packages/internal/pi-tools/test/context-profiler -g '*.ts'` found no shim imports.
- `rg -n 'type InterrogationScope|interface EpisodeScopeSeed' ts/packages/internal/pi-tools/src/context-profiler -g '*.ts'` found definitions only in `model.ts`.
- `rg -n 'from "\\./(constants|outcomes|prompt-blocks|types)\\.ts"|from "../../src/thermo-council/(constants|outcomes|prompt-blocks|types|orchestrator)\\.ts"' ts/packages/internal/pi-tools/src/thermo-council ts/packages/internal/pi-tools/test/thermo-council -g '*.ts'` found no deleted-fragment or private orchestrator test imports.
- `pnpm --dir ts run test -- packages/internal/pi-tools/test/context-profiler/context-profiler-interrogation.test.ts` passed.
- `pnpm --dir ts run test -- packages/internal/pi-tools/test/thermo-council/thermo-council.test.ts packages/internal/pi-tools/test/thermo-council/thermo-council-parity.test.ts` passed.
- `just ts-format-check` passed after `just ts-format-fix` formatted touched TypeScript files.
- `just ts-lint` passed.
- `just ts-check` passed.
- `just ts-test-typescript-style-guard` passed.

## Follow-Ups

- `context-profiler/view.ts` remains large and lacks direct view-level tests; this is now a separate follow-up, not unfinished candidate 4 scope.
- Reopening the parked pr-previews merge still requires a concrete reason and prior classification of the known presentation drift.
