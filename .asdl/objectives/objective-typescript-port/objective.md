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

Fresh cutover evidence gathered on 2026-06-17 permits `objective-stack-impl` to plan the remaining workstream as one coordinated stack, rather than stopping after the plugin-retirement steering question, as long as the preview keeps each branch independently reviewable and includes the current evidence below. The expected remaining stack shape is: retire the `asdl objective` plugin path and coordinate JSON-envelope consumers; migrate the standalone `objective` install/docs/manifests to the TypeScript source shim; then record rollback/reference evidence, delete the Python `packages/asdl-objectives` path and stale Python workspace references, update the umbrella migration record if useful, and close this Objective if the closure gate is clear. PR submission remains out of scope unless the user separately asks for it.

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
- Recent `brmem`, `handoff`, `areg`, and especially `pr-address` run-from-source TypeScript shim models are the accepted default for Objective; fresh cutover evidence found no Objective-specific reason to reject that model.
- A package-local fake-driven design has been sufficient for the Objective port slices completed so far; no shared extraction is needed before final cutover unless implementation uncovers a second real consumer.
- Runner subagents can safely implement the remaining workstream in one parent `objective-stack-impl` session when the parent creates a small Graphite stack, delegates one branch at a time, verifies each result, and records Objective updates after meaningful slices.
- The current installed checkout command still resolves to the Python implementation (`.venv/bin/objective`, `runtime: python`), while direct TypeScript source invocation (`node ts/packages/objective/src/cli.ts`) works and reports `runtime: typescript`; the install/cutover row should flip the normal local `objective` command to the TypeScript source shim.
- Current first-party JSON consumers are known and finite: Pi/CCC selection uses `objective list --minimal --format json`, CCC objective sidebar validation uses `objective exec read-objective <slug> --format json`, and Pi Objective typeahead uses `objective exec list-candidates --format json`.

Risks:

- Skill, Pi extension, and CCC wrappers rely on subtle `objective exec` or `--format md/json` behavior that is broader than package-local Python tests. Fresh evidence narrowed this to the first-party JSON consumers named above plus Markdown skill reads; keep those consumers green during the JSON-envelope cutover.
- Retiring `asdl objective` too early could break plugin smoke tests or docs. Fresh grep outside Objective records found no active skill/Pi/CCC `asdl objective` callers; remaining references are the Python plugin implementation, `tests/scenario/test_plugins.py::test_objective_plugin_integration`, and docs-site install prose that currently advertises `asdl objective --help`.
- Branch attribution and git touch logic may expose reusable git gateway seams; avoid over-extracting unless the final cutover uncovers reuse outside `@asdl/objective`.
- Markdown formatting/parsing changes could accidentally shift Objective domain semantics.
- Distribution cutover can leave stale Python console scripts or uv workspace references if `pyproject.toml`, `justfile`, docs-site install prose, Python plugin smoke tests, package directories, and workspace/dev/test/build settings are not migrated together.
- JSON-shape migration can break Pi/CCC if `legacyMachine` is removed before consumers or tests are updated. The final stack should either keep compatibility deliberately until all consumers are migrated in the same branch, or update consumers/tests and then remove `legacyMachine` in that branch with explicit evidence.
- Python deletion can be too early if rollback/reference evidence is not recorded. The final stack should record the pre-deletion reference point, exact removed package path, and restoration route before deleting `packages/asdl-objectives`.

## Open Questions

- Answered: current inventory and fresh grep found no active skill/Pi/CCC consumers invoking `asdl objective`; the plugin path should be retired, with docs-site install prose and plugin smoke tests updated or removed as part of the cutover.
- Answered for the remaining port: preserve durable behavior and first-party consumer schemas until the coordinated JSON-envelope cutover branch; allow incidental Click/Python vs `@asdl/clinkr` help/parser byte differences with parity notes and scenario coverage.
- Should `packages/asdl-objectives/CONTEXT.md` be created during this port, or saved for a focused package-context session? Default posture: defer; the remaining work is cutover/deletion, not new domain terminology.
- Answered default: record a rollback/reference artifact immediately before Python deletion. Sufficient evidence is a Semantic Update naming the pre-deletion git commit, the deleted `packages/asdl-objectives` path, the removed workspace/dev/test/build references, and the restoration route (`git checkout <pre-deletion-commit> -- packages/asdl-objectives` plus restoring manifest references if needed).
- Answered: package-local fast validation is `pnpm --dir ts --filter @asdl/objective run check` and `pnpm --dir ts --filter @asdl/objective run test`; final cutover validation should also run `pnpm --dir ts run check`, `pnpm --dir ts run test`, and targeted Python/plugin or repo checks for deleted references.
- Answered: `runner-subagent-usage` needs durable table/aggregate semantics for stack digests, not byte-for-byte Python Markdown parity. Keep JSON compatibility only where active first-party consumers require it during cutover.
