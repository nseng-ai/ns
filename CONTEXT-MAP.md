# Context Map

## Contexts

- [ASDL Tools](./CONTEXT.md) — durable planning and Objective system vocabulary.
- [asdl-core](./packages/asdl-core/CONTEXT.md) — shared CLI, Git, Graphite, GitHub, session, plugin, and presentation vocabulary.
- [brmem](./packages/brmem/CONTEXT.md) — branch-scoped durable text memory vocabulary.
- [@asdl/pi-extensions](./ts/packages/pi-extensions/CONTEXT.md) — repo-local Pi extension, saved-plan, planned-branch, checkpoint, handoff, and runner-subagent vocabulary.

## Relationships

- **ASDL Tools → brmem**: Planning and handoff workflows may store branch-scoped context through Branch Memory, while Objectives remain checked-in Markdown records.
- **ASDL Tools → @asdl/pi-extensions**: Pi extensions expose Objective, saved-plan, planned-branch, checkpoint, and handoff workflows to the local agent runtime.
- **brmem → asdl-core**: brmem uses asdl-core Git and clinkr vocabulary to expose branch-scoped memory commands.
- **@asdl/pi-extensions → brmem**: Pi extensions use Branch Memory as the storage adapter for attached plans and handoff artifacts.
- **@asdl/pi-extensions → asdl-core-backed CLIs**: Pi extensions shell out to repo CLIs such as `brmem`, `objective`, and `slot` rather than importing Python package internals.
