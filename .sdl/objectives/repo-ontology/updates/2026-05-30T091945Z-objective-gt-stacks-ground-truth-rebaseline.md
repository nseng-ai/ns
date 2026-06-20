# Objective `gt stacks` ground-truth rebaseline

## Summary

The landed `objective gt stacks` work created new repo ground truth before `repo-ontology` closure: `asdl-objectives` now has a real `asdl-objectives → asdl-core.gt` import edge and an opt-in `objective gt` Graphite stack-projection vocabulary that future Phase 3/4 sessions must capture.

Evidence: clean `master` is current trunk; source import scans under `packages/asdl-objectives/src/asdl_objectives/gt/` show imports of `GtGateway`, `RealGtGateway`, `GtBranchGraph`, `GtTrackedBranch`, and `GtCommandFailure`; `packages/asdl-core/src/asdl_core/gt/types.py` now defines `GtTrackedBranch.needs_restack` and `GtBranchGraph`; recent master commits include `164fda53`, `17d18542`, `628f8dc6`, and `5aab9ef3`. No PR/branch diff is required for this Objective update — master is trunk.

## Objective Impact

- `roadmap.md`: Phase 3 `asdl-objectives` planned scope now includes the `objective gt` command group and stack-projection vocabulary; Phase 4 relationship examples now require `asdl-objectives → asdl-core.gt` as the `objective gt` stack-projection edge; Phase 1 now has a reconciliation task for the temporary `asdl_core.gt` context split.
- `objective.md`: completion criteria now record `asdl-objectives → asdl-core.gt` as known-real and reaffirm that asdl-core must remain a single context file; risks now record the drift materialization and the Non-Goal conflict.
- The completed `packages/asdl-core/CONTEXT.md` `## Gt` section remains valid for closure; the newer branch-graph and restack terms are follow-on material unless a later context session refreshes that H2.

## Follow-Ups

- Phase 3 `asdl-objectives` session must cover `objective gt`, `ObjectiveGtStacks*` models, branch-touch attribution, stack projection/scope/render, and the `asdl-core.gt` branch-graph vocabulary it consumes.
- Phase 4 Relationships must list the `asdl-objectives → asdl-core.gt` edge alongside the existing git, clinkr, console/format/plugin edges.
- Opportunistically refresh the completed asdl-core `## Gt` H2 with `GtTrackedBranch`, `needs_restack`, `GtBranchGraph`, `branch_graph()`, and `BranchGraphView` if that section is revisited.
- Reconcile the temporary `asdl_core.gt` context split against the single-file-H2 Non-Goal by folding its metadata-store contract into, or carving it out against, the `## Gt` H2 section before closure.
