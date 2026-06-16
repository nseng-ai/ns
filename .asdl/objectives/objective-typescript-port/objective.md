# Port Objective CLI to TypeScript

## Thesis

Port the `objective` capability from Python to TypeScript while preserving the checked-in Markdown Objective storage model, skill/Pi command contracts, and user-facing standalone CLI behavior. Treat this as the next default capability slice under the umbrella TypeScript migration after `handoff` and the completed out-of-sequence `areg` exception.

The port should proceed from the durable contract inventory into vertical TypeScript slices. It should not redesign Objectives into a task database, hidden workflow state, Branch Memory storage, YAML/frontmatter records, UUID registries, or a semantic Markdown parser.

## Scope

- Standalone `objective` CLI behavior, including top-level help/version/runtime behavior that should remain user-facing after the port.
- Hidden `objective exec` skill/agent commands: `list-candidates`, `read-objective`, and `runner-subagent-usage`.
- Checked-in Objective record discovery under `.asdl/objectives/` and archive movement under `.asdl/objective-archive/`.
- Objective list/archive/read/candidate/runner-usage deterministic facts and machine/human/Markdown output contracts.
- Skill, Pi extension, and CCC wrapper command snippets that call `objective`.
- Package-local TypeScript storage, git, rendering, and runner-usage seams needed to preserve Objective behavior without porting all of `asdl-core`.
- Repo-local TypeScript run-from-source shim installation model, following the recent `pr-address`, `brmem`, `handoff`, and `areg` precedent unless Objective-specific implementation evidence disproves it.
- Deliberate retirement of the `asdl objective` plugin path after a final consumer/test review, rather than preserving plugin compatibility by default.
- Rollback/reference evidence immediately before Python deletion, so the in-repo Python implementation can be removed without losing a recovery trail.

## Non-Goals

- No Objective product redesign by default.
- No hidden registries, frontmatter/YAML metadata, UUIDs, Branch Memory storage, or state-machine/task-database behavior.
- No broad `asdl-core` module-for-module port.
- No TypeScript implementation before the contract inventory is complete.
- No Python deletion before TypeScript parity, consumer migration, distribution update, and rollback/reference evidence are recorded.

## Completion Criteria

- Contract inventory distinguishes durable Objective CLI/skill/storage behavior from incidental Python implementation detail.
- TypeScript package and CLI provide the accepted standalone `objective` surface and hidden `objective exec` commands by default.
- Scenario and unit coverage in the TypeScript workspace preserves the durable contracts captured in `contract-inventory.md`, including JSON envelope fields that Pi/CCC consumers parse.
- Skill/Pi callers and installed-tool paths use the TypeScript-backed `objective` CLI.
- The `asdl objective` plugin path is either deliberately retired with evidence or preserved through a documented TypeScript-compatible route.
- Python fallback/package path is retired only after callers, docs, tests, and install recipes no longer depend on it, with rollback/reference evidence recorded.
- Umbrella Objective migration ledger and playbook/debt references are updated when meaningful decisions or reusable lessons appear.
- The final Objective update records parity, accepted divergences, consumer migration evidence, validation evidence, and any remaining parked follow-up.

## Definition of Progress

Progress is keepable when it moves the port through independently reviewable vertical slices that preserve Objective behavior without redesigning the product.

Keepable progress includes:

- A runnable `ts/packages/objective` package that follows established TypeScript package conventions in this repo.
- A vertical operation slice with source, fake-backed unit tests, and scenario/CLI evidence for the visible command behavior it claims to cover.
- Explicit parity notes when TypeScript/`@asdl/clinkr` behavior deliberately diverges from Python Click/Clinkr incidental bytes.
- Caller, installer, or plugin migration work that removes a real dependency on the Python package and records the compatibility decision.
- Objective tracking updates that summarize meaningful implementation, changed assumptions, risk resolution, or reusable migration lessons.

Do not keep changes that:

- Add hidden Objective state, YAML/frontmatter, UUID registries, Branch Memory storage, task databases, generated ledgers, or semantic Markdown parsing as a CLI workflow engine.
- Preserve Python compatibility by adding a Python bridge unless new evidence explicitly reopens that decision.
- Convert broad `asdl-core` modules wholesale instead of building the minimum package-local seams needed for Objective behavior.
- Delete Python Objective code before TypeScript parity, caller/install migration, plugin decision evidence, and rollback/reference evidence exist.
- Mix unrelated product redesign with the TypeScript migration slice.

Useful evidence includes:

- Focused Vitest results for package-local units and fakes.
- Scenario tests or equivalent CLI assertions for each ported user/skill-facing command.
- `pnpm --dir ts run check`, `pnpm --dir ts run test`, or narrower package scripts with justification when the slice is intentionally focused.
- Diff or grep evidence for caller migration and plugin retirement decisions.
- A Semantic Update under this Objective for every completed vertical slice or significant policy/cutover decision.

## Runner Policy

This Objective is execution-friendly for `objective-next` and `objective-stack-impl` after an inline preview and explicit user confirmation.

Direct execution is allowed when:

- The selected slice is one roadmap row or a coherent subset of one row.
- The slice is local to repository files and does not require publishing, deployment, PR submission, or write-capable GitHub/API actions.
- The proposed branch/PR has one reviewable thesis and clear validation/evidence expectations.
- The work can be left as local edits or committed/amended on a Graphite branch according to the confirmed preview.
- The runner subagent prompt can include all necessary Objective, file, validation, and non-goal context.

Steer or ask first when:

- A slice requires deciding whether parser/help/schema divergence is acceptable beyond the durable contracts in `contract-inventory.md`.
- A slice would preserve or resurrect `asdl objective` plugin compatibility instead of retiring it.
- A package context document, product terminology change, or Objective domain-language update becomes part of the implementation scope.
- Validation fails in a way that could indicate contract drift rather than a mechanical porting bug.
- Python deletion is next but rollback/reference evidence, caller migration, or plugin-retirement evidence is incomplete.

How work may change files and be left:

- Runner work may add or edit TypeScript package files, Vitest/scenario tests, root/TS package manifests, install recipes, skills/Pi/CCC callers, Objective tracking files, and deliberate Python removal/cutover files when the confirmed slice includes them.
- Runner work should prefer local package seams first; shared extraction belongs only after repeated Objective-port evidence proves it.
- Graphite branches should be created/amended only after the preview says branch work is in scope and the repo's Graphite workflow has been consulted.
- PR submission remains out of scope unless a later user request explicitly asks for it.

Validation before keeping work:

- Run the narrowest command that proves the slice, then broaden to TS/package validation when practical.
- For TypeScript source/test changes, prefer Vitest-backed package tests and `pnpm --dir ts run check` / `pnpm --dir ts run test` or package scripts.
- For Markdown-only Objective edits, use dprint validation when practical.
- If validation is skipped because the slice is documentation-only, blocked, or intentionally preview-only, record why.

Objective tracking expectations:

- Record a Semantic Update after each meaningful vertical slice, accepted divergence, caller migration, plugin decision, Python deletion, or reusable migration lesson.
- Keep updates under `.asdl/objectives/objective-typescript-port/updates/` for Objective-specific work.
- Also update the umbrella TypeScript Objective only when the work changes broader migration playbook, ledger, or reusable debt.

## Assumptions and Risks

Assumptions:

- Objective meaning should remain in checked-in Markdown and skills/agents, not inside a richer CLI state machine.
- The existing Python tests encode most durable CLI contracts, but some Click/Python parser bytes may be incidental and can be deliberately reclassified.
- Recent `brmem`, `handoff`, `areg`, and especially `pr-address` run-from-source TypeScript shim models are the accepted default for Objective unless Objective-specific implementation evidence says otherwise.
- A package-local fake-driven design is sufficient for the first Objective slices; shared extraction should wait for repeated seams.
- Runner subagents can safely implement one vertical slice at a time when the parent verifies diffs and validation before keeping or committing work.

Risks:

- Skill, Pi extension, and CCC wrappers rely on subtle `objective exec` or `--format md/json` behavior that is broader than package-local Python tests.
- Retiring `asdl objective` too early could break plugin smoke tests or users if active consumers still route through the umbrella `asdl` CLI. Current inventory found no active skill/Pi/CCC callers using that path, so the remaining risk is the explicit plugin test/compatibility review before retirement.
- Branch attribution and git touch logic may expose reusable git gateway seams; avoid over-extracting until a second consumer proves reuse.
- Markdown formatting/parsing changes could accidentally shift Objective domain semantics.
- TypeScript package scaffolding could accidentally copy Python module boundaries instead of expressing simpler TypeScript seams.
- Distribution cutover can leave stale Python console scripts or uv workspace references if install recipes and manifests are not migrated together.
- Runner subagents may overrun scope unless each prompt repeats the no-redesign, no-hidden-state, no-plugin-preservation-by-default constraints.

## Open Questions

- Answered: current inventory found no active skill/Pi/CCC consumers invoking `asdl objective`; the plugin path remains only as an explicit test/compatibility retirement decision.
- Which parser/help/schema divergences from Python Clinkr are acceptable under `@asdl/clinkr`? Default posture: preserve machine envelopes and consumer-visible contracts; allow incidental help wrapping or parser byte changes only with an explicit parity note.
- Should `packages/asdl-objectives/CONTEXT.md` be created during this port, or saved for a focused package-context session? Default posture: defer unless terminology or architecture ambiguity blocks implementation.
- Answered default: record a rollback/reference artifact immediately before Python deletion, following the `pr-address` pattern of preserving an external/reference fallback instead of keeping an in-repo Python bridge.
- Which exact validation command should become the package-local fast path once `ts/packages/objective` exists?
- Does `runner-subagent-usage` need byte-for-byte Markdown parity, or only durable table/aggregate semantics for final stack digests?
