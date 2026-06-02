# @asdl/pi-extensions

`@asdl/pi-extensions` is the repo-local engineered TypeScript layer for durable Pi extension behavior in asdl. Pi discovers checked-in project-local adapters under `.pi/extensions/`; adapters delegate stable, risky, reused, or test-worthy behavior to this private package.

## Language

**Project-local Pi extension surface** — The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
_Avoid:_ global extension, npm package entry point, CLI plugin.

**Discovery adapter** — A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/pi-extensions/src/`.
_Avoid:_ package export, shim as implementation, generated extension.

**Vibecoded extension** — A project-local extension implementation kept directly under `.pi/extensions/` while its behavior is still exploratory, repo-specific, or too small to justify a package-level test surface.
_Avoid:_ deprecated extension, throwaway script, unowned code.

**Engineered Pi extension package** — The private TypeScript workspace package at `ts/packages/pi-extensions/` that holds tested implementation modules for project-local Pi behavior.
_Avoid:_ published npm API, stable library boundary, global Pi extension.

**Command runtime** — The package helper layer for invoking external commands from Pi extensions with cwd, timeout, signal, and captured stdout/stderr evidence.
_Avoid:_ shell script, subprocess wrapper unqualified, test fake.

**Saved plan** — A reviewed Markdown implementation plan written before an implementation branch exists.
_Avoid:_ attached plan, Branch Memory entry, checked-in plan.

**Local plan store** — The machine-local pre-branch store at `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md` used by `/write-plan` and `/create-planned-branch`.
_Avoid:_ Branch Memory namespace, repo docs directory, objective update.

**Saved-plan filename slug** — The `<slug>` filename stem in the Local plan store, chosen by `/write-plan` as a semantic local locator for a reviewed plan file.
_Avoid:_ planned-branch slug, Branch Memory key, target branch.

**Source branch plan file** — One saved plan file scoped to the repository and source branch where planning happened.
_Avoid:_ attached plan, implementation branch plan, source file unqualified.

**Content-derived planned-branch slug** — The implementation slug derived by `/create-planned-branch` from the saved plan body through a mandatory tiny Pi model call, then deterministically normalized/repaired without using the filename or path as a fallback. It drives the default target branch and the attached-plan key.
_Avoid:_ saved-plan filename slug, path stem, deterministic fallback.

**Planned branch** — An implementation branch created from a saved plan and carrying that plan as branch-scoped context.
_Avoid:_ brmem branch, Objective branch, plan branch.

**Attached plan** — The canonical implementation plan stored on a planned branch in Branch Memory namespace `brmem-plans` with key `<content-derived-planned-branch-slug>.md`.
_Avoid:_ saved plan, local plan store file, prompt template.

**Branch Memory attachment** — The planning-layer use of `brmem put/get/list/check` to store or read an attached plan under the `brmem-plans` namespace contract.
_Avoid:_ Branch Memory policy, brmem-owned workflow, package import edge.

**Handoff artifact** — A directed, saved work-context artifact for a specific future continuation.
_Avoid:_ Branch Memory entry as the user model, generic session summary, compaction.

**Continuation focus** — The future work a handoff prepares: what the next session should continue, decide, verify, or implement.
_Avoid:_ vague title, undirected summary, branch name as sufficient context.

**Handoff technical locator** — Storage evidence for a handoff: branch plus Branch Memory namespace `handoffs` and key `<semantic-slug>.md`.
_Avoid:_ public command vocabulary, picker label, default success copy.

**Branch creation method** — The selected planned-branch creation strategy, currently `plain-git` or `graphite`.
_Avoid:_ branch type, storage backend, target branch name.

**Code command prefix** — The Pi slash-command namespace for codebase/source-control management workflows; it separates code-management commands from `dev-*` skills or commands whose future is tied to `asdl-dev` decisions.
_Avoid:_ visibility flag, prototype marker, package prefix.

**Pending worktree snapshot** — A read-only capture of repository root, current branch, porcelain status, diff, and cleanliness used by `/code:changes`, `/code:cp`, and `/code:autobranch` before presentation or mutation.
_Avoid:_ stash, checkpoint, worktree status renderer.

**Outstanding changes summary** — A read-only presentation of the current pending worktree state, including summary text and status-derived filenames, used by `/code:changes` before any checkpoint decision. The summary text is drafted by the shared fast-text model harness; when the model is unavailable or returns an invalid summary the command hard-errors rather than falling back to a deterministic summary.
_Avoid:_ checkpoint message, diffstat only, worktree status footer.

**Checkpoint message** — The validated commit message generated, repaired, or fallback-created from a pending worktree snapshot.
_Avoid:_ checkpoint commit, PR title, branch slug.

**Checkpoint commit** — A git commit created from pending worktree changes using a prepared checkpoint message.
_Avoid:_ checkpoint message, stash, branch creation.

**Autobranch preparation** — The deterministic pre-transaction plan for `/code:autobranch`: choose a branch slug/name, collect warnings, and prepare the checkpoint message without moving work.
_Avoid:_ branch transaction, stash operation, model prompt alone.

**Autobranch transaction** — The mutating `/code:autobranch` sequence that stashes pending changes, creates a Graphite branch, restores the stash, and writes the checkpoint commit with explicit typed failure outcomes.
_Avoid:_ preparation, plain git branch creation, restack.

**Runner subagent** — A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode.
_Avoid:_ queued slash command, child session, background thread.

**Terminal capture** — A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
_Avoid:_ tool side effect, assistant final answer, stdout scrape.

**Final-text result** — A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
_Avoid:_ terminal capture, transcript import, custom message.

**Generated runtime extension** — A temporary private Pi extension file created for a runner subagent to install only the requested terminal capture tools and write runtime results.
_Avoid:_ project-local adapter, global extension, user extension.

**Runner subagent progress** — Parsed JSON-event metadata about title, state, current tool, turn count, tool count, elapsed time, and session file.
_Avoid:_ streamed transcript, raw JSONL, assistant content history.

**Terminal presentation** — Shared string utilities for safe terminal display, including escape stripping, OSC 8 hyperlink creation, custom-message text extraction, truncation, and PR-reference linkification.
_Avoid:_ Rich renderer, TUI component, Markdown renderer.

## Relationships

### Discovery surface vs engineered package

`.pi/extensions/` is the Pi discovery surface. It is the only place Pi auto-loads these repo-local commands and tools from this checkout. `ts/packages/pi-extensions/` is the engineered implementation layer: it owns tests, fakes, reusable helpers, and riskier workflows. A discovery adapter may be intentionally tiny; that does not make the package module a stable public export.

Vibecoded extensions remain valid when behavior is still changing or has no demonstrated reuse. Promotion to the engineered package is justified by stability, safety risk, reuse, or the need for package-level tests.

### Planned-branch storage boundary

The planned-branch layer owns **saved plans**, **planned branches**, and **attached plans**. Branch Memory is only the lower storage adapter for the attached-plan contract:

```text
Namespace: brmem-plans
Key: <content-derived-planned-branch-slug>.md
Branch: <target implementation branch>
```

`/write-plan` writes only the **Local plan store** and chooses a **Saved-plan filename slug**. `/create-planned-branch` selects that file, derives a **Content-derived planned-branch slug** from the plan body with a mandatory model call, creates the target branch, and writes the **Branch Memory attachment**. `/impl-planned-branch` reads the **Attached plan** from the current implementation branch and injects it into a new implementation turn.

### Changes, checkpoint, and new-branch boundary

`/code:changes`, `/code:cp`, and `/code:autobranch` share **Pending worktree snapshot** vocabulary, but their mutation scopes differ. `/code:changes` creates an **Outstanding changes summary** only and does not stage, commit, stash, or switch branches. `/code:cp` creates a **Checkpoint commit** on the current branch from a **Checkpoint message**. `/code:autobranch` performs **New branch preparation** first, then a **New branch transaction** that creates a Graphite branch before committing. Preparation does not stash or switch work; the transaction owns stash/restore and typed partial-failure outcomes.

### Runner subagent boundary

A **Runner subagent** is an extension-layer subprocess primitive. The parent must provide a complete prompt and choose **Terminal capture** or **Final-text result** behavior. Progress is metadata only; parent code should not stream the child transcript into the parent LLM context. Non-success statuses require inspecting diagnostics and the session file before treating delegated work as complete.

### Runtime edges

The package shells out through Pi extension APIs rather than importing Python packages. Runtime edges include `git` for repo/worktree facts, `gt` for Graphite branch and stack behavior, `gh` for PR facts and merging, `brmem` for Branch Memory attachments and handoff artifact storage, `objective` for Objective facts, and `slot` for managed worktree cleanup in stack landing workflows.
