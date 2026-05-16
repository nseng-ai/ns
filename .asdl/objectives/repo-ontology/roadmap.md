# Roadmap

## Work

Phase 0 — scaffold

- [x] Create `/CONTEXT-MAP.md` with planned-contexts list, links (existing or TBD), and explicit "Out of scope" notes for `asdl-dispatcher` and `asdl-initiatives` — scaffold committed; `asdl-core` linked live (Clinkr anchor present, 4 H2 anchors named as planned), 5 plugin packages marked _Planned_, `asdl-dispatcher` / `asdl-initiatives` listed out of scope with revisit triggers, Relationships and Flagged ambiguities sections seeded as Phase 4 placeholders

Phase 1 — finish `packages/asdl-core/CONTEXT.md` (append H2 sections to existing file)

- [ ] Grill and append `## Git` — resolve `branch_exists` (bound repo) vs `get_current_branch(cwd)` (worktree at cwd); ref / branch / start_point usage; `NonIdealState` conformance for `DetachedHead`, `GitCommandFailure`
- [ ] Grill and append `## Gt` — resolve `ancestors` vs `children` vs `descendants` recursion semantics; `StackInfo.current == None` sentinel; `NoParent` / `UntrackedBranch`
- [ ] Grill and append `## Gh` — resolve `PRState` vs `PRStateFilter` (case + meaning); `PRReview` vs `PRReviewThread` vs `PRReviewComment` vs `IssueComment`; `PRSummary` vs `PRDetails`
- [ ] Grill and append `## Top-level utilities` — `AsdlPluginSpec` + `context_factory` (plugin.py); `get_console` / `make_table` (console.py); `format_relative_time` / `state_badge` (format.py, interacts with `PRState`); `AliasedGroup` (click_utils.py)

Phase 2 — foundational primitive

- [ ] Create `packages/brmem/CONTEXT.md` — `Entry`, `Namespace`, `EntryKey`, `RefLayout`, snapshot, base vs namespaced entries, prompt resolution, `BrmemCopyConflictError`

Phase 3 — plugin packages (peers; "Review"/"Comment" cross-context overload surfaces in the first two)

- [ ] Create `packages/asdl-pr-address/CONTEXT.md` — `ReviewThread`, `ReviewComment`, `DiscussionComment`, `IssueComment`, `Reaction`, `Feedback`, thread resolution/replies; cross-reference (not redefine) `asdl-core.gh` types
- [ ] Create `packages/asdl-reviewer/CONTEXT.md` — `Reviewer`, `ReviewDefinition`, `HarnessAdapter`, `Finding`, `InlineCommentability`, severity (info/warning/error), frontmatter; explicitly disambiguate `Review` against `gh.PRReview` and `pr-address.ReviewThread`
- [ ] Create `packages/asdl-slots/CONTEXT.md` — `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`, shell directive files
- [ ] Create `packages/asdl-objectives/CONTEXT.md` — `Objective`, `ObjectiveListEntry`, `ObjectiveRecord`, lifecycle, `exec` group conventions

Phase 4 — map finalization

- [ ] Populate Relationships section of `/CONTEXT-MAP.md` with concrete cross-package edges (e.g. `asdl-objectives → brmem` for storage, `asdl-pr-address → asdl-core.gh`, `asdl-slots → asdl-core.git + asdl-core.gh`)
- [ ] Add "Flagged ambiguities" section for cross-context naming collisions (Review/Comment overload, State usage across `gh` and `format.state_badge`, branch/ref usage across `git`/`gt`/`slots`)
- [ ] Final readback pass — confirm an unfamiliar contributor can navigate from `/CONTEXT-MAP.md` to any context and explain key terms without opening source

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session (hard to reverse, surprising without context, real trade-off). Not planned proactively.
- `packages/asdl-dispatcher/CONTEXT.md` — revisit when live operations land; today it is a CLI stub.
- `packages/asdl-initiatives/CONTEXT.md` — revisit when implementation lands; today it is an empty namespace.
- Per-subpackage `CONTEXT.md` split for `asdl-core` (e.g. `src/asdl_core/clinkr/CONTEXT.md`) — revisit when `clinkr` or another labs subpackage graduates to a standalone package.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
