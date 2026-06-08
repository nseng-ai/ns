# @asdl/pi-extensions

`@asdl/pi-extensions` is the repo-local engineered TypeScript layer for durable Pi extension behavior in asdl. Pi discovers checked-in project-local adapters under `.pi/extensions/`; adapters delegate stable, risky, reused, or test-worthy behavior to this private package. CCC (`@asdl/ccc`) is the separate private orchestration layer for repo-opinionated command-and-control workflows and owns the `ccc` Pi command prefix for cmux/workspace orchestration. Neutral shared helper contracts live below both packages in `@asdl/pi-extension-runtime`.

## Language

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
_Avoid_: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/pi-extensions/src/`.
_Avoid_: package export, shim as implementation, generated extension.

**Vibecoded extension**:
A project-local extension implementation kept directly under `.pi/extensions/` while its behavior is still exploratory, repo-specific, or too small to justify a package-level test surface.
_Avoid_: deprecated extension, throwaway script, unowned code.

**Engineered Pi extension package**:
The private TypeScript workspace package at `ts/packages/pi-extensions/` that holds tested implementation modules for project-local Pi behavior, including registration helpers, command presentation, and Pi runtime integration. It is distinct from CCC, which owns cross-capability orchestration vocabulary and future command-and-control implementation seams.
_Avoid_: published npm API, stable library boundary, global Pi extension, CCC itself.

**CCC orchestration layer**:
The private TypeScript workspace package at `ts/packages/ccc/` for repo-opinionated command-and-control workflows spanning Pi, cmux, Graphite, Objectives, handoffs, planned branches, and worktree flows. CCC-owned Pi command surfaces use the `ccc` slash-command prefix while preserving `cmux` terminology for the external tool and workspace domain.
_Avoid_: Pi discovery adapter, `/cmux:*` compatibility alias, lower capability package, public npm API.

**Structured grill UI surface**:
The Pi-specific command/tool layer for starting grill sessions and routing user-facing questions through `grill_ask`. It includes the plain `/grill-ui` path and the docs-aware `/grill-with-docs-ui` path.
_Avoid_: questionnaire framework, docs editor, generic form engine.

**Command runtime**:
The neutral helper layer, implemented in `@asdl/pi-extension-runtime`, for command display formatting, shell quoting, normalized exec results, and bounded stdout/stderr evidence.
_Avoid_: shell executor, workflow owner, subprocess policy, test fake.

**CCC cmux command suite**:
The project-local CCC Pi command family registered by `.pi/extensions/ccc.ts`: `/ccc:sidebar:pr-summary`, `/ccc:sidebar:objective-summary`, `/ccc:workspace:dispatch-plan`, `/ccc:workspace:open-branch`, and `/ccc:workspace:dispatch-prompt`. The commands intentionally have no `/cmux:*` compatibility aliases; use `cmux` only for the external workspace tool they operate.
_Avoid_: user-local cmux commands, cmux CLI, sidebar skill alone, `/cmux:*` alias.

**cmux workspace-opening command**:
A cmux command suite entrypoint that creates a new cmux workspace after preparing a branch, plan, or prompt: `/ccc:workspace:open-branch`, `/ccc:workspace:dispatch-plan`, or `/ccc:workspace:dispatch-prompt`. `open` only opens a workspace; `dispatch` opens a workspace and starts child Pi execution immediately.
_Avoid_: workspace metadata refresh, summary-only command, current workspace rename.

**cmux sidebar command**:
An explicit manual command that updates the caller workspace using `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID` and applies through `asdl exec cmux-workspace-summary`. `/ccc:sidebar:pr-summary` is model-assisted; `/ccc:sidebar:objective-summary [objective-slug-or-path]` is a deterministic Objective picker/metadata formatter/apply command.
_Avoid_: automatic workspace-opening automation, focused workspace fallback, raw cmux mutation, assuming both sidebar variants use a model.

**Objective selector**:
A structured selector for an active Objective: either a single Objective slug, a repo-relative/absolute path below `.asdl/objectives/<slug>/`, or a user-chosen active Objective from a deterministic picker when a command intentionally supports no-arg selection. It is not prompt text and is not inferred from branch, PR, hidden context, or conversation prose.
_Avoid_: Objective prompt, branch-derived Objective, archived Objective path.

**Objective stack implementation adapter**:
The public Pi extension registration surface for `/objective:stack-impl`. The command name remains part of the Objective extension surface, but the stack implementation orchestration behind it is delegated to `@asdl/ccc/objective-stack-impl`; normal Objective record/list/current/update/next/close/archive semantics stay below CCC.
_Avoid_: CCC command prefix alias, Objective storage owner, stack orchestration implementation body.

**Deterministic sidebar fields**:
The `title` and description produced without a model from structured metadata and mechanical formatting rules before calling `asdl exec cmux-workspace-summary`. Objective sidebar fields are fixed as `obj:<objective-slug>` and `<slot-slug>::<branch-slug>`; PR sidebar still asks the model for a one-line `Goal:` description.
_Avoid_: generated Objective summary, arbitrary prose compression, model draft.

**Parked cmux automatic sidebar update**:
A removed post-success behavior for cmux workspace-opening commands. Automatic sidebar updates are intentionally parked until CCC command consolidation clarifies the target workspace and deterministic apply path.
_Avoid_: current command behavior, workspace-opening sidebar automation, workspace-ref inference.

**Saved plan**:
A reviewed Markdown implementation plan written before an implementation branch exists.
_Avoid_: attached plan, Branch Memory entry, checked-in plan.

**Local plan store**:
The machine-local pre-branch store at `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md` used by `/planned-branch:write-plan`, `/planned-branch:create`, and the `planned-branch` CLI.
_Avoid_: Branch Memory namespace, repo docs directory, objective update.

**Saved-plan filename slug**:
The `<slug>` filename stem in the Local plan store, derived by the write-plan workflow from the final reviewed plan content as a semantic local locator for a reviewed plan file.
_Avoid_: planned-branch slug, Branch Memory key, target branch, arbitrary slug.

**Source branch plan file**:
One saved plan file scoped to the repository and source branch where planning happened.
_Avoid_: attached plan, implementation branch plan, source file unqualified.

**Planned-branch slug**:
The implementation slug derived from the saved plan body by the workflow surface before calling `planned-branch exec create`. It drives the default target branch and the attached-plan key.
_Avoid_: saved-plan filename slug, path stem, deterministic fallback.

**Planned branch**:
An implementation branch created from a saved plan and carrying that plan as branch-scoped context.
_Avoid_: brmem branch, Objective branch, plan branch.

**Attached plan**:
The canonical implementation plan stored on a planned branch in Branch Memory namespace `planned-branch` with key `<planned-branch-slug>.md`.
_Avoid_: saved plan, local plan store file, prompt template.

**Branch Memory attachment**:
The planning-layer use of `brmem put/get/list/check` to store or read an attached plan under the `planned-branch` namespace contract.
_Avoid_: Branch Memory policy, brmem-owned workflow, package import edge.

**Planned-branch skill family**:
The shippable agent-skill capability made of the `planned-branch` umbrella/reference skill plus the installed write-plan, create, and implement step skills that use it as their shared planned-branch model.
_Avoid_: one-off skill, internal docs dependency, hidden installation requirement.

**Planned-branch write-plan prompt policy**:
The checked-in `.asdl/prompts/planned-branch-write-plan.md` static prompt body consumed by `/planned-branch:write-plan` after the command dynamically injects its header and user steering; resolved through `asdl exec resolve-prompt planned-branch-write-plan --format json` with built-in fallback for usability.
_Avoid_: Pi slash prompt template, saved plan content, Branch Memory attachment, mode selector.

**Handoff artifact**:
A directed, durable work-context artifact for a specific future continuation.
_Avoid_: Branch Memory entry as the user model, save/load operation language, generic session summary, compaction.

**Continuation focus**:
The future work a handoff prepares: what the next session should continue, decide, verify, or implement.
_Avoid_: vague title, undirected summary, branch name as sufficient context.

**Create a handoff**:
The public action for producing a new Handoff artifact through `/handoff:create`.
_Avoid_: save a handoff, Branch Memory write as the user model.

**Pick up a handoff**:
The public action for selecting an existing Handoff artifact through `/handoff:pickup`, presenting its continuation summary, and waiting for user direction before further work.
_Avoid_: load a handoff, read a Branch Memory entry as the user model.

**List handoffs**:
The public action for presenting Handoff artifacts through `/handoff:list` on one branch or across active local branches.
_Avoid_: deleted-branch recovery surface, global registry, storage-key-first inventory.

**Handoff technical locator**:
Storage evidence for a handoff: branch plus Branch Memory namespace `handoff` and flat key `<semantic-slug>.md` after the singular-namespace migration.
_Avoid_: public command vocabulary, picker label, default success copy, `handoffs` as the target namespace.

**Branch creation method**:
The selected planned-branch creation strategy, currently `plain-git` or `graphite`.
_Avoid_: branch type, storage backend, target branch name.

**Code command prefix**:
The Pi slash-command namespace for codebase/source-control management workflows; it separates code-management commands from `dev-*` skills or commands whose future is tied to `asdl-dev` decisions.
_Avoid_: visibility flag, prototype marker, package prefix.

**Pending worktree snapshot**:
A read-only capture of repository root, current branch, porcelain status, diff, and cleanliness used by `/code:changes`, `/code:cp`, and `/code:autobranch` before presentation or mutation.
_Avoid_: stash, checkpoint, worktree status renderer.

**Outstanding changes summary**:
A read-only presentation of the current pending worktree state, including summary text and status-derived filenames, used by `/code:changes` before any checkpoint decision. The summary text is drafted by the shared fast-text model harness; when the model is unavailable or returns an invalid summary the command hard-errors rather than falling back to a deterministic summary.
_Avoid_: checkpoint message, diffstat only, worktree status footer.

**Roast command**:
The Pi slash command `/roast`, which waits for idle, asks `roaster review list-matching` for the deterministic changed-path reviewer selection, then orchestrates selected `roaster review run <key>` calls and presents one aggregate review result.
_Avoid_: review prompt, single reviewer, code-review skill.

**Checkpoint message**:
The validated commit message generated, repaired, or fallback-created from a pending worktree snapshot.
_Avoid_: checkpoint commit, PR title, branch slug.

**Checkpoint commit**:
A git commit created from pending worktree changes using a prepared checkpoint message.
_Avoid_: checkpoint message, stash, branch creation.

**Autobranch preparation**:
The deterministic pre-transaction plan for `/code:autobranch`: choose a branch slug/name and collect preflight facts before moving work. Dirty-worktree preparation also prepares a checkpoint message; clean latest-commit preparation inspects trunk/upstream/parent shape and derives a slug from the existing commit message and diff.
_Avoid_: branch transaction, stash operation, model prompt alone.

**Autobranch transaction**:
The mutating `/code:autobranch` sequence that creates a Graphite branch from either dirty worktree changes or the latest clean-worktree commit. Dirty mode stashes pending changes, creates the branch, restores the stash, and writes a checkpoint commit. Latest-commit mode creates a recovery branch, resets the source branch to the parent, creates the Graphite branch, hard-resets it to the original commit SHA, verifies the SHA, and cleans up recovery evidence.
_Avoid_: preparation, plain git branch creation, restack.

**Runner subagent**:
A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode.
_Avoid_: queued slash command, child session, background thread.

**Terminal capture**:
A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
_Avoid_: tool side effect, assistant final answer, stdout scrape.

**Final-text result**:
A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
_Avoid_: terminal capture, transcript import, custom message.

**Generated runtime extension**:
A temporary private Pi extension file created for a runner subagent to install only the requested terminal capture tools and write runtime results.
_Avoid_: project-local adapter, global extension, user extension.

**Runner subagent progress**:
Parsed JSON-event metadata about title, state, current tool, turn count, tool count, elapsed time, and session file.
_Avoid_: streamed transcript, raw JSONL, assistant content history.

**Terminal presentation**:
Shared string utilities for safe terminal display, including escape stripping, OSC 8 hyperlink creation, custom-message text extraction, truncation, and PR-reference linkification.
_Avoid_: Rich renderer, TUI component, Markdown renderer.
