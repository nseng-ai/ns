# Port Objective CLI to TypeScript

## Thesis

Port the `objective` capability from Python to TypeScript while preserving the checked-in Markdown Objective storage model, skill/Pi command contracts, and user-facing standalone CLI behavior. Treat this as the next default capability slice under the umbrella TypeScript migration after `handoff` and the completed out-of-sequence `areg` exception.

The port should proceed from the durable contract inventory into vertical TypeScript slices. It should not redesign Objectives into a task database, hidden workflow state, Branch Memory storage, YAML/frontmatter records, UUID registries, or a semantic Markdown parser.

## Scope

- Standalone `objective` CLI behavior.
- Hidden `objective exec` skill/agent commands.
- Checked-in Objective record discovery under `.asdl/objectives/` and archive movement under `.asdl/objective-archive/`.
- Objective list/archive/read/candidate/runner-usage deterministic facts and machine/human/Markdown output contracts.
- Skill, Pi extension, and CCC wrapper command snippets that call `objective`.
- Future repo-local TypeScript source shim installation model, unless inventory evidence proves another distribution model is required.
- Likely retirement of the `asdl objective` plugin path after consumer evidence and a compatibility decision.

## Non-Goals

- No Objective product redesign by default.
- No hidden registries, frontmatter/YAML metadata, UUIDs, Branch Memory storage, or state-machine/task-database behavior.
- No broad `asdl-core` module-for-module port.
- No TypeScript implementation before the contract inventory is complete.
- No Python deletion before TypeScript parity, consumer migration, distribution update, and rollback/reference evidence are recorded.

## Completion Criteria

- Contract inventory distinguishes durable Objective CLI/skill/storage behavior from incidental Python implementation detail.
- TypeScript package and CLI provide the accepted standalone `objective` surface and hidden `objective exec` commands by default.
- Skill/Pi callers and installed-tool paths use the TypeScript-backed `objective` CLI.
- The `asdl objective` plugin path is either deliberately retired with evidence or preserved through a documented TypeScript-compatible route.
- Python fallback/package path is retired only after callers, docs, tests, and install recipes no longer depend on it, with rollback/reference evidence recorded.
- Umbrella Objective migration ledger and playbook/debt references are updated when meaningful decisions or reusable lessons appear.

## Assumptions and Risks

Assumptions:

- Objective meaning should remain in checked-in Markdown and skills/agents, not inside a richer CLI state machine.
- The existing Python tests encode most durable CLI contracts, but some Click/Python parser bytes may be incidental and can be deliberately reclassified.
- Recent `brmem`, `handoff`, and `areg` run-from-source TypeScript shim models are a suitable default for Objective unless consumer evidence says otherwise.

Risks:

- Skill, Pi extension, and CCC wrappers rely on subtle `objective exec` or `--format md/json` behavior that is broader than package-local Python tests.
- Retiring `asdl objective` too early could break plugin smoke tests or users if active consumers still route through the umbrella `asdl` CLI.
- Branch attribution and git touch logic may expose reusable git gateway seams; avoid over-extracting until a second consumer proves reuse.
- Markdown formatting/parsing changes could accidentally shift Objective domain semantics.

## Open Questions

- Which active consumers still invoke `asdl objective` rather than standalone `objective`?
- Which parser/help/schema divergences from Python Clinkr are acceptable under `@asdl/clinkr`?
- Should `packages/asdl-objectives/CONTEXT.md` be created during this port, or saved for a focused package-context session?
- What rollback/reference commit or artifact should be recorded immediately before Python deletion?
