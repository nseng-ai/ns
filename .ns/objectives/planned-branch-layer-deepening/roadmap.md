# Roadmap

## Work

- [x] Establish the planning-layer vocabulary and target module shape.
  - Keep the user-facing slash commands `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` stable.
  - Planning-layer module and shim names now use planned-branch vocabulary: `.pi/extensions/planned-branch.ts`, `src/planned-branch-extension.ts`, and `src/planned-branch/`.
  - Planning-layer exported names now use planned-branch vocabulary, including `createPlannedBranchFromFile`, `PlannedBranchEvidence`, `CreatePlannedBranchFromFileParams`, `PlannedBranchExtensionOptions`, and `PlanCommandExecApi`.
  - Local plan-store helper and option names use planning terminology, including `buildRepoPlanStoreKey`; retained `brmem` names are confined to the `brmem-plans` namespace contract, Branch Memory command helpers/parsers, and diagnostics.
- [x] Separate the local plan store Module from Branch Memory persistence.
  - Make `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md` behavior read as planning-layer local storage, not Branch Memory storage.
  - The stale direct Branch Memory `plans` namespace storage API, `storeBrmemPlanFromFile`, `BrmemPlanStorage*` types, and storage formatting helpers have been deleted.
  - Deprecated archive vocabulary and compatibility aliases (`archiveRoot`, `sourcePlanArchiveRoot`, `defaultPlanArchiveRoot`, `resolveSourceBranchPlanArchiveDirectory`, and `SourceBranchPlanArchiveDirectoryEvidence`) have been deleted.
  - Preserve slug validation, repo identity, branch encoding, newest-plan selection, and exclusive-write behavior.
- [x] Isolate Branch Memory attachment behind a lower Adapter.
  - Keep the canonical attachment contract: namespace `brmem-plans`, key `<slug>.md`, target implementation branch.
  - Concentrate Branch Memory command discovery, `check`, `put`, JSON parsing, and partial-failure diagnostics where the planning layer crosses the storage Seam.
  - The attached-plan reader now reuses the existing `runBrmem` discovery/fallback seam and owns read-path JSON validation without extracting a broad generic Adapter.
  - Remaining Branch Memory references in the planned-branch code and tests are limited to the explicit `brmem-plans` attachment/read contract, recovery diagnostics, Branch Memory command helpers/parsers, historical negative assertions for removed command/tool registration, or unrelated brmem extension surfaces.
  - Avoid extracting a broad generic Branch Memory Adapter unless the planned-branch workflow proves it through the deletion test.
- [x] Improve `/create-planned-branch` presentation around planning concepts.
  - Preview saved plan, target planned branch, branch creation method, and attached-plan outcome as planning facts.
  - Keep Branch Memory namespace, key, ref, commit, and source-file evidence available where it helps diagnose or recover from failures.
  - Fake-driven tests assert the planning-level Interface and negative legacy tool registration instead of preserving deleted storage compatibility behavior.
- [x] Implement a tested attached-plan reader for `/impl-planned-branch`.
  - Move deterministic branch safety checks, canonical `brmem-plans` listing, key normalization, branch-final-segment matching, single-entry fallback, multiple-entry ambiguity, and selected-plan loading into tested code.
  - Cover detached HEAD, trunk/default branch refusal, no entries, invalid requested key, multiple entries, selected key loading, and malformed Branch Memory output.
  - `/impl-planned-branch` now loads the selected attached plan and injects an authoritative implementation prompt instead of dispatching `/skill:brmem-plan-impl`.
  - The implementation guidance formerly carried by `brmem-plan-impl` now lives in an extension-owned Markdown prompt template rather than a discoverable skill.
- [x] Decide and apply skill naming cleanup.
  - Decision: replace `brmem-plan-impl` with slash-command-only `/impl-planned-branch` usage; do not rename it and do not keep a compatibility skill.
  - Remove the skill source, `.agents`/`.claude` discovery symlinks, `skills-lock.json` entry, `just install-tools` global-link behavior, tests, and docs references.
  - Keep implementation-prompt prose in `ts/packages/pi-extensions/src/planned-branch/prompts/impl-planned-branch.md`, loaded by the extension.
  - Verification includes `npx skills list --json` showing `brmem-plan-impl` is no longer listed.
- [x] Move planned-branch workflow docs out of the brmem README.
  - Durable planning workflow docs now live at `docs/pi/planned-branch-workflow.md` and are linked from `docs/pi/README.md`.
  - `packages/brmem/README.md` is focused on Branch Memory concepts and generic CLI operations, with only a concise pointer to the higher-level Pi/planning workflow.
  - Skill references and helper-skill language have been removed from the brmem README.
- [x] Resolve overlap with `pi-extension-deepening`.
  - This Objective owns the focused planned-branch layer slice: saved plans, planned branches, attached plans, and the `brmem-plans` namespace/key contract.
  - `pi-extension-deepening` owns any future generic Branch Memory CLI Adapter for shared discovery/execution plumbing; planned-branch closure does not wait on that extraction.
  - Future Adapter migration must preserve planned-branch domain policy, fatal diagnostics, planning-level presentation, and read/write tests.
- [x] Validate the accepted implementation slices.
  - `bun run --cwd ts check`, `bun run --cwd ts test`, and `just dprint-check` passed for the attached-plan reader slice.
  - `just ts-check`, `just ts-test`, `just dprint-check`, `git diff --check`, and the targeted attached-plan/create-plan-branch tests passed for the skill-removal and prompt-template slice.
  - `npx skills list --json` no longer lists `brmem-plan-impl`.
  - `just dprint-check` passed for the docs relocation and Objective update slice.
  - `just dprint-check` passed for the overlap-boundary Objective updates.
  - `bun run --cwd ts check`, `bun run --cwd ts test`, `git diff --check`, and `just dprint-check` passed for the storage-compatibility deletion and Objective update slice.
  - `bun run --cwd ts check`, `bun run --cwd ts test`, `git diff --check`, and `just dprint-check` passed for the final naming-disposition slice.
- [x] Close by explicit human decision.
  - Confirm the planning layer is visibly stacked on top of Branch Memory rather than integrated with it.
  - Confirm the read and write paths have symmetric tested behavior.
  - Add closure context to `objective.md`, then add a Closure Marker.

## Parked

- [ ] Generic Branch Memory CLI Adapter extraction shared across unrelated Pi extensions; owned by `pi-extension-deepening`, not required for planned-branch closure.
- [ ] Broader `pi-extension-deepening` candidates such as presentation/linkification, `/submit` promotion, `worktree-status`, and `land-stack` test-surface cleanup.
- [ ] Automatic PR submission or stack landing for branches created from saved plans.
- [ ] Objective integration or checked-in Objective records for generated implementation plans.
- [ ] Live Pi/model end-to-end smoke tests as a prerequisite for the initial architecture cleanup.
