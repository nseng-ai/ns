# Roadmap

## Work

Phase 0 — scaffold

- [x] Create `/CONTEXT-MAP.md` with planned-contexts list, links (existing or TBD), and explicit initial skips — scaffold committed; `asdl-core` linked live (Clinkr anchor present, 4 H2 anchors named as planned), 5 plugin packages marked _Planned_, `asdl-dispatcher` / `asdl-initiatives` listed out of scope with revisit triggers, Relationships and Flagged ambiguities sections seeded as Phase 4 placeholders. This remains useful as the first scaffold, but Phase 0.5 must update it before further map work because `packagechk` is now a tracked package and `asdl-initiatives` is not.

Phase 0.5 — rebaseline after repo thrash

- [ ] Update `/CONTEXT-MAP.md` against the current tracked package inventory: link the existing root `CONTEXT.md`, add `packagechk` as the seventh in-scope package context, keep `asdl-dispatcher` as the only tracked out-of-scope package while it has no operations, and remove or reword `asdl-initiatives` as an absent package rather than a package skip.
- [ ] Update the scaffold's candidate Relationships and Flagged ambiguities: remove stale expected edges without import/runtime evidence (notably `asdl-objectives → brmem`), record `packagechk` as standalone/no-`asdl-core` edge, and add the `CheckStatus` vs PR state/rendered state-badge collision candidate.

Phase 1 — finish `packages/asdl-core/CONTEXT.md` (append H2 sections to existing file)

- [ ] Grill and append `## Git` — resolve `branch_exists` (bound repo) vs `get_current_branch(cwd)` (worktree at cwd); ref / branch / start_point usage; `NonIdealState` conformance for `DetachedHead`, `GitCommandFailure`
- [ ] Grill and append `## Gt` — resolve `ancestors` vs `children` vs `descendants` recursion semantics; `StackInfo.current == None` sentinel; `NoParent` / `UntrackedBranch`
- [ ] Grill and append `## Gh` — resolve `PRState` vs `PRStateFilter` (case + meaning); `PRReview` vs `PRReviewThread` vs `PRReviewComment` vs `IssueComment`; `PRSummary` vs `PRDetails`
- [ ] Grill and append `## Top-level utilities` — `AsdlPluginSpec` + `context_factory` (plugin.py); `get_console` / `make_table` (console.py); `format_relative_time` / `state_badge` (format.py, interacts with `PRState`); `AliasedGroup` (click_utils.py)

Phase 2 — foundational primitive

- [ ] Create `packages/brmem/CONTEXT.md` — `Entry`, `Namespace`, `EntryKey`, `RefLayout`, snapshot, base vs namespaced entries, prompt resolution, `BrmemCopyConflictError`, and the difference between Branch Memory as a CLI/skill primitive vs package-level storage dependencies

Phase 3 — package contexts (plugins plus standalone utility)

- [ ] Create `packages/asdl-pr-address/CONTEXT.md` — `ReviewThread`, `ReviewComment`, `DiscussionComment`, `IssueComment`, `Reaction`, `Feedback`, thread resolution/replies; cross-reference (not redefine) `asdl-core.gh` types
- [ ] Create `packages/asdl-reviewer/CONTEXT.md` — `Reviewer`, `ReviewDefinition`, `HarnessAdapter`, `Finding`, `InlineCommentability`, severity (info/warning/error), frontmatter; explicitly disambiguate `Review` against `gh.PRReview` and `pr-address.ReviewThread`
- [ ] Create `packages/asdl-slots/CONTEXT.md` — `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`, shell directive files
- [ ] Create `packages/asdl-objectives/CONTEXT.md` — `Objective`, `ObjectiveListEntry`, `ObjectiveRecord`, lifecycle, `exec` group conventions, and the fact that Objectives are checked-in Markdown rather than brmem entries
- [ ] Create `packages/packagechk/CONTEXT.md` — `Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`, PyPI normalization, npm validation/scoped-name caveat, claim project specs, publish gateways, and parked Homebrew support

Phase 4 — map finalization

- [ ] Populate Relationships section of `/CONTEXT-MAP.md` with concrete cross-package edges (e.g. `brmem → asdl-core.git + asdl-core.clinkr`, `asdl-pr-address → asdl-core.gh + asdl-core.git + asdl-core.clinkr`, `asdl-reviewer → asdl-core.gh + asdl-core.git + asdl-core.clinkr`, `asdl-slots → asdl-core.git + asdl-core.gh + asdl-core.gt + asdl-core.clinkr`, `asdl-objectives → asdl-core.clinkr`, and `packagechk` as standalone/no-`asdl-core` edge)
- [ ] Add "Flagged ambiguities" section for cross-context naming collisions (Review/Comment overload, State/status usage across `gh`, `format.state_badge`, and `packagechk.CheckStatus`, branch/ref usage across `git`/`gt`/`slots`)
- [ ] Final readback pass — confirm an unfamiliar contributor can navigate from `/CONTEXT-MAP.md` to any context and explain key terms without opening source

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session (hard to reverse, surprising without context, real trade-off). Not planned proactively.
- `packages/asdl-dispatcher/CONTEXT.md` — revisit when live operations land; today it is a CLI stub with no operations.
- `packages/asdl-initiatives/CONTEXT.md` — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation.
- Per-subpackage `CONTEXT.md` split for `asdl-core` (e.g. `src/asdl_core/clinkr/CONTEXT.md`) — revisit when `clinkr` or another labs subpackage graduates to a standalone package.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
