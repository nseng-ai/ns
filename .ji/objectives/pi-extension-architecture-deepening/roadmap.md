# Roadmap

## Work

- [x] Document the Pi extension layer distinction in `docs/pi/README.md`.
  - Captures `.pi/extensions/*.ts` and `.pi/extensions/*/index.ts` as the vibecoded extension layer: fast, repo-local, experimental, and allowed to be rough while dogfooding.
  - Captures `ts/packages/pi-extensions/` as the engineered layer: stable, tested, reusable implementation for behavior that has proven durable.
  - Includes promotion criteria based on stability, risk, reuse, and test need.
- [x] Inventory the current authored project-local extensions and classify their current layer.
  - Captured `.pi/extensions/objective.ts`, `.pi/extensions/land-stack.ts`, `.pi/extensions/just-fix.ts`, `.pi/extensions/submit.ts`, and the engineered `ts/packages/pi-extensions/src/*` implementations in `docs/pi/README.md`.
  - Notes which files are thin discovery adapters, which are vibecoded implementations, and which are engineered implementations.
- [x] Resolve candidate 1: clarify the vibecoded-vs-engineered architecture.
  - Resolved in `docs/pi/README.md`; no package metadata or additional local convention is needed for the first architecture pass.
- [x] Resolve candidate 2: shared Pi command runtime mechanics.
  - Extracted `ts/packages/pi-extensions/src/command-runtime.ts` for shared `ExecResult` normalization, command display formatting, terminal escape stripping, output tailing, and output-section formatting.
  - Updated engineered `objective` and `land-stack` implementations to consume the helpers, with `test/command-runtime.test.ts` covering the pure runtime seam.
  - Intentionally left command orchestration, UI/non-UI presentation, and custom message streaming in callers until another deletion-test-backed seam appears.
  - Evidence: local branch diff against `extract-command-runtime-utils`; `bun run --cwd ts check` and `bun run --cwd ts test` passed.
- [x] Resolve candidate 3: Objective selection deepening.
  - Kept the grouped-changed-Objective picker for `objective-next` introduced in PR #567 (`selectChangedObjectivesOrOther`, `compactDiffSuggestion`, `View other open Objectives…`) as the chosen Objective-selection UX.
  - Added a shared parametrized harness (`runObjectiveCommand`, `SELECTION_TITLES`, `ACTION_PROMPTS`, `expectPromptSelectsObjective`) and a new `objective command shared selection policy` describe in `objective.test.ts` covering the shared parts of the rule across `objective-next`, `objective-current`, and `objective-update`: explicit-arg bypass, candidate loading, zero-open handling, picker cancellation, and explicit-selection embedding in the generated prompt; plus a small `objective command prompt details` describe for the `objective-update`-only post-selection evidence reminder.
  - Kept the selection logic inside `objective.ts`; a dedicated `objective-selection.ts` module did not pass the deletion test for this slice.
  - Evidence: working-tree diff touching `objective.test.ts`; `bun run --cwd ts check` and `bun run --cwd ts test` passed.
- [ ] Resolve candidate 4: `land-stack` internal module split.
  - Explore separating stack facts, PR facts, landing orchestration, command streaming, and rendering while keeping `/land-stack` as the external command interface.
  - Adjust tests only to improve locality and preserve safety invariants.
- [ ] Resolve candidate 5: `/submit` layer decision.
  - Decide whether `.pi/extensions/submit.ts` remains vibecoded, is partially promoted, or moves into engineered Graphite/PR machinery shared with `land-stack`.
  - Review the old `@mariozechner/pi-coding-agent` import path while making this decision.
- [ ] Resolve candidate 6: shared skill-invocation mechanics.
  - Compare `objective.ts` and `just-fix.ts` skill expansion flows.
  - Extract only if the seam has enough leverage and a fake-driven test surface.
- [ ] Implement accepted refactors as they become clear.
  - The command-runtime helper extraction is an accepted refactor for candidate 2, and the shared cross-command Objective selection characterization tests are the accepted inline test-deepening for candidate 3 (the grouped picker from PR #567 is kept as-is); future refactors remain open for candidates 4-6.
  - Keep each PR coherent and update this Objective when decisions, rejected candidates, or meaningful outcomes emerge.
  - Validate relevant changes with `bun run --cwd ts check`, `bun run --cwd ts test`, and broader repo checks when needed.
- [ ] Close by explicit human decision.
  - Confirm each starting candidate is implemented, rejected with reason, parked, or split out.
  - Record closure context in `objective.md` before adding a closure marker.

## Parked

- [ ] Decide later whether the vibecoded/engineered terms deserve promotion into `CONTEXT.md` as broader ASDL domain vocabulary.
- [ ] Consider a future dedicated Objective for Pi package publication or install-layout cleanup if this architecture work uncovers package-distribution needs.
