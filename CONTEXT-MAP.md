# Context Map

## Contexts

- [asdl Platform](./CONTEXT.md) — the composable toolkit's shared substrate: plugins, skills, CLI operations, harness integration.
- [Branch Memory](./packages/brmem/CONTEXT.md) — branch-attached text state stored outside commits, PR comments, issues, and working-tree files.
- [Objectives](./packages/asdl-objectives/CONTEXT.md) — local-first planning records for multi-session workstreams.
- [Slots](./packages/asdl-slots/CONTEXT.md) — managed git worktrees that let a developer hold multiple branches checked out in parallel.

## Relationships

- **Objectives → asdl Platform**: The Objectives Tool ships Public Skills and CLI operations; Skills should describe objective workflows with Objectives vocabulary while delegating deterministic mechanics to the Tool CLI.
- **Branch Memory → asdl Platform**: The Branch Memory Tool is independently adoptable storage infrastructure that other Tools may depend on without adopting the full asdl CLI.
- **Objectives → Branch Memory**: Objectives attach Objective Snapshots to branches by storing objective Entries in Branch Memory.
- **Objectives → Branch Memory**: Objective Snapshots use Branch Memory for branch-local drift while the Canonical Objective remains the shared authority.
- **Objectives → Branch Memory**: Objective Roadmaps are authored against the Canonical Objective on trunk unless an entry explicitly says it is stacked on another branch; Branch Memory then carries the chosen Objective Snapshot on the implementation branch.
- **Branch Memory → Objectives**: Branch Memory provides generic storage concepts only; objective semantics such as snapshots, reconciliation, roadmap numbering, and closure belong to the Objectives context.
