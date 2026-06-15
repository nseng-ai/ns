# @asdl/pi-extensions

`@asdl/pi-extensions` is the repo-local engineered TypeScript layer for durable Pi extension behavior in asdl. Pi discovers checked-in project-local adapters under `.pi/extensions/`; adapters delegate stable, risky, reused, or test-worthy behavior to this private package. CCC (`@asdl/ccc`) is the separate private orchestration layer for repo-opinionated command-and-control workflows, owns the `ccc` Pi command prefix for cmux/workspace orchestration, and can own selected stable non-`ccc` command implementations such as `/code:autobranch` and unified `/code:land`. Neutral shared helper contracts live below both packages in `@asdl/pi-extension-runtime`.

## Language

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
*Avoid*: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/pi-extensions/src/`.
*Avoid*: package export, shim as implementation, generated extension.

**Vibecoded extension**:
A project-local extension implementation kept directly under `.pi/extensions/` while its behavior is still exploratory, repo-specific, or too small to justify a package-level test surface.
*Avoid*: deprecated extension, throwaway script, unowned code.

**Engineered Pi extension package**:
The private TypeScript workspace package at `ts/packages/pi-extensions/` that holds tested implementation modules for project-local Pi behavior, including registration helpers, command presentation, and Pi runtime integration. It is distinct from CCC, which owns cross-capability orchestration vocabulary and future command-and-control implementation seams.
*Avoid*: published npm API, stable library boundary, global Pi extension, CCC itself.

**CCC orchestration layer**:
The private TypeScript workspace package at `ts/packages/ccc/` for repo-opinionated command-and-control workflows spanning Pi, cmux, Graphite, Objectives, handoffs, branch-context workflows, and worktree flows. CCC-owned Pi command surfaces use the `ccc` slash-command prefix while preserving `cmux` terminology for the external tool and workspace domain.
*Avoid*: Pi discovery adapter, `/cmux:*` compatibility alias, lower capability package, public npm API.

**Structured grill UI surface**:
The Pi-specific command/tool layer for starting grill sessions and routing user-facing questions through `grill_ask`. It includes the plain `/pi:grill-me` path and the docs-aware `/pi:grill-with-docs` path. These commands are Pi-native UI accelerators over the portable `grill-me` and `grill-with-docs` skills.
*Avoid*: questionnaire framework, docs editor, generic form engine, `/grill-ui`, `/grill-with-docs-ui`.

**Command runtime**:
The neutral helper layer, implemented in `@asdl/pi-extension-runtime`, for command display formatting, shell quoting, normalized exec results, and bounded stdout/stderr evidence.
*Avoid*: shell executor, workflow owner, subprocess policy, test fake.

**CCC cmux command suite**:
The project-local CCC Pi command family registered by `.pi/extensions/ccc.ts`: `/ccc:sidebar:pr-summary`, `/ccc:sidebar:objective-summary`, `/ccc:workspace:dispatch-plan`, `/ccc:workspace:open-branch`, and `/ccc:workspace:dispatch-prompt`. The commands intentionally have no `/cmux:*` compatibility aliases; use `cmux` only for the external workspace tool they operate.
*Avoid*: user-local cmux commands, cmux CLI, sidebar skill alone, `/cmux:*` alias.

**cmux workspace-opening command**:
A cmux command suite entrypoint that creates a new cmux workspace after preparing a branch, plan, or prompt: `/ccc:workspace:open-branch`, `/ccc:workspace:dispatch-plan`, or `/ccc:workspace:dispatch-prompt`. `open` only opens a workspace; `dispatch` opens a workspace and starts child Pi execution immediately.
*Avoid*: workspace metadata refresh, summary-only command, current workspace rename.

**cmux sidebar command**:
An explicit manual command that updates the caller workspace using `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID` and applies through `asdl exec cmux-workspace-summary`. `/ccc:sidebar:pr-summary` is model-assisted; `/ccc:sidebar:objective-summary [objective-slug-or-path]` is a deterministic Objective picker/metadata formatter/apply command.
*Avoid*: automatic workspace-opening automation, focused workspace fallback, raw cmux mutation, assuming both sidebar variants use a model.

**Objective selector**:
A structured selector for an active Objective: either a single Objective slug, a repo-relative/absolute path below `.asdl/objectives/<slug>/`, or a user-chosen active Objective from a deterministic picker when a command intentionally supports no-arg selection. It is not prompt text and is not inferred from branch, PR, hidden context, or conversation prose.
*Avoid*: Objective prompt, branch-derived Objective, archived Objective path.

**Objective stack implementation adapter**:
The public Pi extension registration surface for `/objective:stack-impl`. The command name remains part of the Objective extension surface, but the stack implementation orchestration behind it is delegated to `@asdl/ccc/objective-stack-impl`; normal Objective record/list/current/update/next/close/archive semantics stay below CCC.
*Avoid*: CCC command prefix alias, Objective storage owner, stack orchestration implementation body.

**Autobranch adapter**:
The public Pi extension registration surface for `/code:autobranch`. The command stays in the `code` command family and is discovered through `@asdl/pi-extensions`, but dirty-worktree and latest-commit autobranch orchestration is delegated to `@asdl/ccc/autobranch`.
*Avoid*: preparation owner, transaction owner, new command name, Graphite policy implementation.

**Land adapter**:
The public Pi extension registration surface for unified `/code:land`. The command stays in the `code` command family and is discovered through `@asdl/pi-extensions`, but Graphite stack-shape dispatch, single-PR fast landing, Graphite/GitHub/slot stack landing orchestration, and failure presentation are delegated to `@asdl/ccc/land`.
*Avoid*: PR view/merge policy owner, stack landing policy owner, direct Graphite/GitHub mutation owner, new command alias.

**Worktree status adapter**:
The Pi lifecycle module behind `.pi/extensions/worktree-status.ts`: registers the `worktree-status` renderer, reacts to session/tool/agent/shutdown events, manages active-session cancellation, watches Git/Branch Memory/worktree paths, installs the custom footer, and renders generic cwd/session/model/context/token/cost footer lines while delegating repo-operational status facts and presentation to `@asdl/ccc/worktree-status`.
*Avoid*: CCC observability fact owner, Graphite metadata parser owner, Branch Memory scope formatter, visible slash command.

**Pi footer lifecycle**:
The generic Pi runtime behavior for composing footer lines from cwd, current branch, session name, extension status lines, model/provider, context usage, tokens, and cost. It remains in `@asdl/pi-extensions` because it is Pi session plumbing rather than CCC observability.
*Avoid*: worktree-status fact model, Graphite stack status, Branch Memory storage.

**Deterministic sidebar fields**:
The `title` and description produced without a model from structured metadata and mechanical formatting rules before calling `asdl exec cmux-workspace-summary`. Objective sidebar fields are fixed as `obj:<objective-slug>` and `<slot-slug>::<branch-slug>`; PR sidebar still asks the model for a one-line `Goal:` description.
*Avoid*: generated Objective summary, arbitrary prose compression, model draft.

**Parked cmux automatic sidebar update**:
A removed post-success behavior for cmux workspace-opening commands. Automatic sidebar updates are intentionally parked until CCC command consolidation clarifies the target workspace and deterministic apply path.
*Avoid*: current command behavior, workspace-opening sidebar automation, workspace-ref inference.

**Saved plan**:
A reviewed Markdown implementation plan written before an implementation branch exists.
*Avoid*: attached plan, Branch Memory entry, checked-in plan.

**Local plan store**:
The machine-local pre-branch store at `~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/`. Saved plans use `<slug>.md`.
*Avoid*: Branch Memory namespace, repo docs directory, objective update.

**Saved-plan filename slug**:
The `<slug>` filename stem in the Local plan store, derived by the write-plan workflow from the final reviewed plan content as a semantic local locator for a reviewed plan file.
*Avoid*: branch-context slug, Branch Memory key, target branch, arbitrary slug.

**Source branch plan file**:
One saved plan file scoped to the repository and source branch where planning happened.
*Avoid*: attached plan, implementation branch plan, source file unqualified.

**Branch-context slug**:
The implementation slug derived from the saved plan body by the workflow surface before calling `branch-context exec from-plan`. It drives the default target branch and, for from-plan workflows, the default named attached-plan key `<branch-context-slug>.md`.
*Avoid*: saved-plan filename slug, arbitrary Branch Memory key, path stem, deterministic fallback.

**Branch context**:
The standing Branch Memory context attached to a branch in namespace `branch-context`. A plan can be the founding entry, but the branch is not a special branch type.
*Avoid*: planned branch, brmem branch, Objective branch, plan branch.

**Attached plan**:
The canonical Markdown implementation plan stored as a branch-context entry in Branch Memory namespace `branch-context` with a named Markdown key. New from-plan attachments use `<branch-context-slug>.md`; `plan.md` remains readable legacy storage.
*Avoid*: saved plan, local plan store file, prompt template.

**Branch Memory attachment**:
The planning-layer use of `branch-context` attach/load/list/check/delete helpers over the Branch Memory namespace contract.
*Avoid*: Branch Memory policy, raw brmem workflow, package import edge.

**Branch-context skill family**:
The shippable agent-skill capability made of the `branch-context` umbrella/reference skill plus the installed `enriched-plan-save`, `branch-context-from-plan`, and `branch-context-impl` step skills that use it as their shared branch-context model.
*Avoid*: planned-branch skill family, one-off skill, internal docs dependency, hidden installation requirement.

**Enriched-plan save prompt policy**:
The checked-in `.asdl/prompts/plans-write.md` static prompt body consumed by `/enriched-plan:save` after the command dynamically injects its header and user steering; resolved through `asdl exec resolve-prompt plans-write --format json` with built-in fallback for usability.
*Avoid*: Pi slash prompt template, saved plan content, Branch Memory attachment, mode selector.

**Enriched-plan grill-and-save prompt**:
The Pi-only embedded prompt consumed by `/enriched-plan:grill-and-save`; it requires the `grill_ask` structured UI for requirements grilling before saving a normal Saved plan with `write_saved_plan_file`.
*Avoid*: repo-editable prompt policy, cross-agent skill contract, new storage artifact, Branch Memory attachment.

**Handoff artifact**:
A directed, durable work-context artifact for a specific future continuation.
*Avoid*: Branch Memory entry as the user model, save/load operation language, generic session summary, compaction.

**Self handoff session replacement**:
The Pi-specific `/handoff:self` behavior that creates and verifies a durable Handoff artifact, replaces the current Pi session, and sends the pickup prompt in the fresh session. If replacement cancels or fails after verification, the Handoff artifact remains durable and the user recovers by picking it up manually in a fresh session.
*Avoid*: deleting the handoff on replacement failure, stale-session pickup fallback, hidden resume alias, Branch Memory entry as the user model.

**Continuation focus**:
The future work a handoff prepares: what the next session should continue, decide, verify, or implement.
*Avoid*: vague title, undirected summary, branch name as sufficient context.

**Create a handoff**:
The public action for producing a new Handoff artifact through `/handoff:create`.
*Avoid*: save a handoff, Branch Memory write as the user model.

**Pick up a handoff**:
The public action for selecting an existing Handoff artifact through `/handoff:pickup`, presenting its continuation summary, and waiting for user direction before further work.
*Avoid*: load a handoff, read a Branch Memory entry as the user model.

**List handoffs**:
The public action for presenting Handoff artifacts through `/handoff:list` on one branch or across active local branches.
*Avoid*: deleted-branch recovery surface, global registry, storage-key-first inventory.

**Handoff technical locator**:
Storage evidence for a handoff: branch plus Branch Memory namespace `handoff` and flat key `<semantic-slug>.md` after the singular-namespace migration.
*Avoid*: public command vocabulary, picker label, default success copy, `handoffs` as the target namespace.

**Branch creation method**:
The selected branch-context from-plan creation strategy, currently `plain-git` or `graphite`.
*Avoid*: branch type, storage backend, target branch name.

**Pi command namespace**:
The first segment before `:` in a repo-owned Pi slash command, chosen by workflow ownership rather than implementation file. `/pi:*` names Pi-native UI/session affordances; `/ccc:*` names command-and-control or cmux/session orchestration; `/code:*` names codebase/source-control management workflows; `/handoff:*` names durable Handoff artifact lifecycle operations.
*Avoid*: package path, visibility flag, arbitrary grouping, legacy top-level aliases.

**Tool-call parity boundary**:
The parity-review convention that Pi model-visible tools are host-native bridges, not standalone parity metadata rows. The command workflow that depends on a tool owns any required fallback documentation. Examples: `grill_ask`, `dispatch_runner_subagent`, `write_saved_plan_file`, `derive_handoff_slug_from_content`, and `handoff_tab_launch` do not require their own parity rows.
*Avoid*: custom-tool parity row, hidden command surface, tool as workflow owner.

**Code command prefix**:
The Pi slash-command namespace for codebase/source-control management workflows that still belong to the code command family; pending-worktree inspection has moved to `/sdl:changes`, and checkpoint creation has moved to `/sdl:cp`.
*Avoid*: visibility flag, prototype marker, package prefix, migrated SDL workflow prefix.

**Pending worktree snapshot**:
A read-only capture of repository root, current branch, porcelain status, diff, and cleanliness used by `/sdl:changes`, `/sdl:cp`, and `/code:autobranch` before presentation or mutation.
*Avoid*: stash, checkpoint, worktree status renderer.

**Outstanding changes summary**:
A read-only presentation of the current pending worktree state, including summary text and status-derived filenames, used by `sdl changes` / `/sdl:changes` before any checkpoint decision. The summary text is drafted through SDL text generation; when the model is unavailable or returns an invalid summary the command hard-errors rather than falling back to a deterministic summary.
*Avoid*: checkpoint message, diffstat only, worktree status footer, Pi-only changes card.

**Checkpoint message**:
The validated commit message generated, repaired, or fallback-created from a pending worktree snapshot.
*Avoid*: checkpoint commit, PR title, branch slug.

**Checkpoint commit**:
A git commit created from pending worktree changes using a prepared checkpoint message.
*Avoid*: checkpoint message, stash, branch creation.

**Autobranch preparation**:
A CCC-owned pre-transaction plan exposed through the `/code:autobranch` adapter: choose a branch slug/name and collect preflight facts before moving work. Dirty-worktree preparation also prepares a checkpoint message; clean latest-commit preparation inspects trunk/upstream/parent shape and derives a slug from the existing commit message and diff.
*Avoid*: Pi extension implementation ownership, branch transaction, stash operation, model prompt alone.

**Autobranch transaction**:
A CCC-owned mutating `/code:autobranch` sequence exposed through the `code` command family. Dirty mode stashes pending changes, creates the branch, restores the stash, and writes a checkpoint commit; latest-commit mode creates a recovery branch, resets the source branch to the parent, creates the Graphite branch, hard-resets it to the original commit SHA, verifies the SHA, and cleans up recovery evidence.
*Avoid*: Pi extension implementation ownership, preparation, plain git branch creation, restack.

**Runner subagent**:
A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode.
*Avoid*: queued slash command, child session, background thread.

**Terminal capture**:
A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
*Avoid*: tool side effect, assistant final answer, stdout scrape.

**Final-text result**:
A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
*Avoid*: terminal capture, transcript import, custom message.

**Generated runtime extension**:
A temporary private Pi extension file created for a runner subagent to install only the requested terminal capture tools and write runtime results.
*Avoid*: project-local adapter, global extension, user extension.

**Runner subagent progress**:
Parsed JSON-event metadata about title, state, current tool, turn count, tool count, elapsed time, and session file.
*Avoid*: streamed transcript, raw JSONL, assistant content history.

**Terminal presentation**:
Shared string utilities for safe terminal display, including escape stripping, OSC 8 hyperlink creation, custom-message text extraction, truncation, and PR-reference linkification.
*Avoid*: Rich renderer, TUI component, Markdown renderer.
