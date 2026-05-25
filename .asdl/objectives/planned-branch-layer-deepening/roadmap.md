# Roadmap

## Work

- [~] Establish the planning-layer vocabulary and target module shape.
  - Keep the user-facing slash commands `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` stable.
  - Decide the internal module/file/type naming for saved plans, planned branches, attached plans, and the Branch Memory Adapter.
  - Record any chosen naming changes in docs or Objective updates before broad renames.
- [~] Separate the local plan store Module from Branch Memory persistence.
  - Make `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md` behavior read as planning-layer local storage, not Branch Memory storage.
  - Remove or isolate deprecated archive vocabulary and stale direct Branch Memory plan-storage paths that fail the deletion test.
  - Preserve slug validation, repo identity, branch encoding, newest-plan selection, and exclusive-write behavior.
- [~] Isolate Branch Memory attachment behind a lower Adapter.
  - Keep the canonical attachment contract: namespace `brmem-plans`, key `<slug>.md`, target implementation branch.
  - Concentrate Branch Memory command discovery, `check`, `put`, JSON parsing, and partial-failure diagnostics where the planning layer crosses the storage Seam.
  - The attached-plan reader now reuses the existing `runBrmem` discovery/fallback seam and owns read-path JSON validation without extracting a broad generic Adapter.
  - Avoid extracting a broad generic Branch Memory Adapter unless the planned-branch workflow proves it through the deletion test.
- [~] Improve `/create-planned-branch` presentation around planning concepts.
  - Preview saved plan, target planned branch, branch creation method, and attached-plan outcome as planning facts.
  - Keep Branch Memory namespace, key, ref, commit, and source-file evidence available where it helps diagnose or recover from failures.
  - Update fake-driven tests to assert the planning-level Interface rather than overfitting to storage internals.
- [x] Implement a tested attached-plan reader for `/impl-planned-branch`.
  - Move deterministic branch safety checks, canonical `brmem-plans` listing, key normalization, branch-final-segment matching, single-entry fallback, multiple-entry ambiguity, and selected-plan loading into tested code.
  - Cover detached HEAD, trunk/default branch refusal, no entries, invalid requested key, multiple entries, selected key loading, and malformed Branch Memory output.
  - `/impl-planned-branch` now loads the selected attached plan and injects an authoritative implementation prompt instead of dispatching `/skill:brmem-plan-impl`.
  - The implementation guidance formerly carried by `brmem-plan-impl` now lives in an extension-owned Markdown prompt template rather than a discoverable skill.
- [x] Decide and apply skill naming cleanup.
  - Decision: replace `brmem-plan-impl` with slash-command-only `/impl-planned-branch` usage; do not rename it and do not keep a compatibility skill.
  - Remove the skill source, `.agents`/`.claude` discovery symlinks, `skills-lock.json` entry, `just install-tools` global-link behavior, tests, and docs references.
  - Keep implementation-prompt prose in `ts/packages/pi-extensions/src/brmem-plans/prompts/impl-planned-branch.md`, loaded by the extension.
  - Verification includes `npx skills list --json` showing `brmem-plan-impl` is no longer listed.
- [~] Move planned-branch workflow docs out of the brmem README.
  - Put durable planning workflow docs next to the Pi extension/planning layer, likely under `docs/pi/` plus concise command help.
  - Leave `packages/brmem/README.md` focused on Branch Memory: Entry, Entry Key, Namespace, branch-scoped storage, and generic CLI operations.
  - Skill references and helper-skill language are removed from the brmem README, but the higher-level planned-branch workflow text still needs relocation or reduction to a concise pointer.
- [~] Resolve overlap with `pi-extension-deepening`.
  - Record that this Objective owns the focused planned-branch layer slice.
  - Update or cross-reference `pi-extension-deepening` when a candidate is implemented, parked, or split out by this work.
- [~] Validate the accepted implementation slices.
  - `bun run --cwd ts check`, `bun run --cwd ts test`, and `just dprint-check` passed for the attached-plan reader slice.
  - `just ts-check`, `just ts-test`, `just dprint-check`, `git diff --check`, and the targeted attached-plan/create-plan-branch tests passed for the skill-removal and prompt-template slice.
  - `npx skills list --json` no longer lists `brmem-plan-impl`.
  - Run broader repo validation when Python, repo-wide docs, skill layout, or installer behavior changes require it.
- [ ] Close by explicit human decision.
  - Confirm the planning layer is visibly stacked on top of Branch Memory rather than integrated with it.
  - Confirm the read and write paths have symmetric tested behavior.
  - Add closure context to `objective.md`, then add a Closure Marker.

## Parked

- [ ] Generic Branch Memory CLI Adapter extraction shared across unrelated Pi extensions.
- [ ] Broader `pi-extension-deepening` candidates such as presentation/linkification, `/submit` promotion, `worktree-status`, and `land-stack` test-surface cleanup.
- [ ] Automatic PR submission or stack landing for branches created from saved plans.
- [ ] Objective integration or checked-in Objective records for generated implementation plans.
- [ ] Live Pi/model end-to-end smoke tests as a prerequisite for the initial architecture cleanup.
