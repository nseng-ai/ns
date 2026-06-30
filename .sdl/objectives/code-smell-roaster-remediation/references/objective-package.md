# ts/packages/objective -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 6 confirmed finding(s) (0 high, 4 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/objective/src

1. **Duplicated Code** (medium) -- `ts/packages/objective/src/operations/check-objective.ts:189-242`
   - Roast: The slug-resolution preamble (root presence, missing-slug, invalid-slug, not-found) is hand-copied between read-objective.ts and check-objective.ts, so every future tweak to that flow has to be made twice and kept in sync by hand.
   - Evidence: checkObjective's root/slug/exists resolution block (lines 189-242) reproduces the same sequence of calls and branches — `activeRootExists()`, `slug === undefined` -> emptyResult("missing-slug"...), `!isValidObjectiveSlug` -> emptyResult("invalid-slug"...), `activeRecordExists` -> emptyResult("not-found"...) — as readObjectiveRecord in read-objective.ts:149-203, differing only in field names (rootPath vs root, hasRoot vs hasRoot).
   - Smallest fix: Extract a shared `resolveObjectiveRecordTarget(storage, slug)` helper that returns the root/slug/path/exists facts (or the missing-slug/invalid-slug/not-found short-circuit), and have both read-objective.ts and check-objective.ts call it before adding their own result fields.

2. **Duplicated Code** (medium) -- `ts/packages/objective/src/operations/list-objectives-pretty.ts:75-84`
   - Roast: Two renderers for the same `ObjectiveListResult` independently reinvented byte-identical helper functions instead of sharing one.
   - Evidence: `function emptyMessage(statusFilter)` (lines 75-80) and `function renderSlugs(records)` (lines 82-84) in list-objectives-pretty.ts are character-for-character identical to the same-named functions at list-objectives.ts:266-268 and :275-280.
   - Smallest fix: Move `emptyMessage` and `renderSlugs` into the shared `list-objectives.ts` module (or a small shared render-helpers file) and have list-objectives-pretty.ts import them instead of redefining them.

3. **Duplicated Code** (medium) -- `ts/packages/objective/src/operations/tracking-gate.ts:131-163, 189-222`
   - Roast: The success path and the missing-objective path each hand-build the entire nested TrackingGateResult tree from scratch, so the result's shape lives in two places that have to be kept in sync by eye.
   - Evidence: runTrackingGate's `return ok({...})` and buildMissingResult both independently construct the full `{ slug, objectivePath, rootPath, objective, git, uncommitted, branchDiff, summary }` literal with matching nested shapes, just with different filler values.
   - Smallest fix: Extract a single `buildTrackingGateResult(parts)` (or a base/default result plus overrides) that both the found and missing branches call, so the schema's nesting is defined once.

4. **Repeated Switches** (medium) -- `ts/packages/objective/src/storage.ts:228-252`
   - Roast: Four functions in a row re-derive the same archive/unarchive fork instead of admitting there's one lookup table hiding in here.
   - Evidence: archiveSourceRelativePath, archiveDestinationRelativePath, archiveEmptySourceRelativePath, and archiveEmptyDestinationRelativePath each repeat `if (direction === "unarchive") return X; return Y;` on the same ObjectiveArchiveDirection value.
   - Smallest fix: Replace the four direction-switching functions with a single map keyed by ObjectiveArchiveDirection (e.g. `{ archive: { root: activeRootRelativePath, record: activeRecordRelativePath, ... }, unarchive: { ... } }`) and derive source/destination from one lookup instead of four parallel if/else bodies.

5. **Divergent Change** (low) -- `ts/packages/objective/src/api.ts:113-518`
   - Roast: One file is both a thin client facade for sibling packages and a full interactive-picker orchestration engine with git-diff scraping, status notifications, and UI callbacks — two reasons to touch the same 560-line file.
   - Evidence: createObjectiveClient (lines 113-142) is a small ok/failure facade, while the rest of the file (lines 156-518: ObjectiveSelectionHost/Ui/Context types, listActiveObjectives, changedObjectiveSelection, objectiveDiffChangedSlugs, objectiveStatusChangedSlugs, selectObjectiveSlug, selectChangedObjectivesOrOther, chooseActiveObjectiveSlug) implements an unrelated, much larger interactive Objective-picker workflow driven by git exec calls and UI host callbacks.
   - Smallest fix: Split the picker/selection orchestration (ObjectiveSelectionHost/Ui/Context, changedObjectiveSelection, chooseActiveObjectiveSlug, etc.) into its own module (e.g. objective-selection-flow.ts) and keep api.ts limited to the ObjectiveClient facade plus its re-exports.

6. **Duplicated Code** (low) -- `ts/packages/objective/src/real-storage.ts:90-100`
   - Roast: kindFromStats and kindFromDirent are the same three-line classifier wearing two different costumes for no reason.
   - Evidence: Both functions take `{ isFile(): boolean; isDirectory(): boolean }` and run the identical `if (isFile) return "file"; if (isDirectory) return "directory"; return "other";` body.
   - Smallest fix: Delete one of the two functions and call the remaining `kindFromTypeChecks(x: { isFile(): boolean; isDirectory(): boolean })` from both call sites (lstat result and Dirent both satisfy the same structural shape).
