# Roadmap

## Work

- [ ] Merge the pr-previews checks/feedback clones into one deep preview-surface module (bordered list/detail modal view, command skeleton, detail-row union, shared zod target schema), with checks and feedback as thin target adapters.
      Grill first: classify each drifted difference (`modalRows()` overlay budget, footer border chrome, detail glyphs `│`/`▏` and `Evidence:`/`·`, review-role coloring) as parameter or accident before unifying.
      Evidence: one view implementation; both existing view test suites pass against it; targeted tests and relevant repo checks passed.
- [ ] Add a single parity assertion helper (shape: `expectPiSurfaceParity(register, metadata)`) beside `@ns/pi/parity/testing` and collapse the six copy-pasted parity test files to one call each.
      Evidence: no subpackage-local `collect*Surfaces`/compare/format ritual remains to copy into the next Internal Pi-tool package.
- [ ] Narrow `runner-subagents` exports to real consumers: drop zero-importer subpaths (`/json-events`, `/presentation`, `/usage`); decide whether `/process`, `/runtime`, `/testing` earn rank (ADR 0023) or tests bind via relative source imports; delete the `usage.ts` shim; fold the `extension-api.ts` pass-through facade into the barrel. Re-verify importer facts before cutting.
- [ ] Consolidate the context-profiler interrogation flow behind the controller interface (session, prompt, transcript, render become internals); relocate `InterrogationScope` to the model; delete the `errors.ts` and `lm-json.ts` shims. Must not grow `view.ts`.
- [ ] Flatten thermo-council: one barrel, one type home (resolve the `contract.ts`/`types.ts` split), fold the `outcomes.ts`/`prompt-blocks.ts`/`constants.ts` fragments into the orchestrator; export `reviewerOutcomeFromRunnerResult` deliberately or test it through the command.

## Parked
