# Context Map

## Contexts

- [Branch Memory](./packages/brmem/CONTEXT.md) — branch-attached text state stored outside commits, PR comments, issues, and working-tree files.
- [Objectives](./packages/asdl-objectives/CONTEXT.md) — local-first planning records for multi-session workstreams.

## Relationships

- **Objectives → Branch Memory**: Objectives attach Objective Snapshots to branches by storing objective Entries in Branch Memory.
- **Objectives → Branch Memory**: Objective Snapshots use Branch Memory for branch-local drift while the Canonical Objective remains the shared authority.
- **Branch Memory → Objectives**: Branch Memory provides generic storage concepts only; objective semantics such as snapshots, reconciliation, and closure belong to the Objectives context.
