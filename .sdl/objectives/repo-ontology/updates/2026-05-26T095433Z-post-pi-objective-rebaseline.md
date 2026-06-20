# Post-Pi/Objective Rebaseline

## Summary

Reconciled repo-ontology with the repo changes that landed after the last update:

- Root Objective-system vocabulary now reflects current active/archive mechanics: Active Objective Root, Objective Archive Root, Archived Objective, Objective Close, Objective Archive, and Closure Marker are distinct terms.
- `docs/objective-system.md` now documents active-root-only reads for `objective list` / `objective exec read-objective`, the shipped `objective archive` directory-move operation, and the `objective exec runner-subagent-usage` helper.
- Added `ts/packages/pi-extensions/CONTEXT.md` for the repo-local TypeScript/Pi extension package, covering `.pi/extensions/` discovery adapters, the engineered package layer, planned branches, attached plans, checkpoint/new-branch flows, runner subagents, and terminal presentation.
- Finished the remaining `packages/asdl-core/CONTEXT.md` Phase 1 surface by adding `## Top-level utilities`, and refreshed `## Git` with commit-graph/path-touch terminology that landed after the first Git context.
- Rebaselined `/CONTEXT-MAP.md` so it indexes `@asdl/pi-extensions`, marks all asdl-core H2s present, updates planned package terms against current source, and expands relationships/ambiguities for Objective active/archive status, plan terminology, runtime CLI edges, and state/status collisions.
- Refreshed adjacent Pi docs that contradicted the new ontology: `docs/pi/README.md` now lists the current project-local extension inventory and archived Objective links, `docs/pi/runner-subagent-helper.md` now describes `runner-subagent.ts`, final-text mode, current statuses, and the `dispatch_runner_subagent` tool, and `docs/pi/objective-stack-subagent-rewrite-brief.md` now carries a staleness note pointing to runner-subagent vocabulary.

No production Python or TypeScript implementation code changed.

## Objective Impact

- `objective.md`: broadened durable scope from only root + 7 Python package contexts to root + 7 Python package contexts + the repo-local `@asdl/pi-extensions` context; added Phase 0.6 as the drift rebaseline for Pi/Objective changes; updated completion criteria and drift risks.
- `roadmap.md`: added Phase 0.6 and marked it complete; marked Phase 1 `## Top-level utilities` complete; refreshed Phase 2/3 planned package terms and Phase 4 relationship/ambiguity examples against current source.
- `CONTEXT-MAP.md`: now matches the current context inventory and runtime/package edges closely enough for future per-package sessions to proceed without inheriting stale assumptions.

## Follow-Ups

- Continue with Phase 2: create `packages/brmem/CONTEXT.md`, keeping planned-branch policy in `@asdl/pi-extensions` and Branch Memory as generic branch-scoped storage.
- During Phase 3, use the refreshed planned-term bullets rather than the older `IssueComment` / `HarnessAdapter` / vague Objective list wording.
- Phase 4 still needs a final readback after all planned Python package contexts exist; the map relationships and flagged ambiguities remain candidates until then.
