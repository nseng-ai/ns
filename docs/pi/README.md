# Pi in This Repo

Repo-specific notes for using and extending Pi in `asdl`.

## Project-local Pi extensions

Checked-in project-local Pi extensions live in:

```text
.pi/extensions/
```

Pi auto-discovers project-local extension modules from:

```text
.pi/extensions/*.ts
.pi/extensions/*/index.ts
```

Use project-local extensions when the behavior is specific to this repo's workflows, CLIs, slots, or contributor conventions.

Checked-in files under `.pi/extensions/` are the local discovery surface. They may contain a full repo-local implementation, or they may be thin adapters that delegate to engineered package code.

## Project-local implementation layers

This repo keeps two useful layers for Pi extension work.

### Vibecoded extension layer

Paths:

```text
.pi/extensions/*.ts
.pi/extensions/*/index.ts
```

The vibecoded extension layer is for fast repo-local workflow experiments that should stay close to Pi's auto-discovery surface while their shape is still changing. It is a good fit when behavior is specific to this checkout's CLIs, slots, or conventions and does not yet need a package-level test surface.

This layer is valuable, not deprecated. Keep user-facing behavior obvious, prefer direct code while the seam is unproven, and avoid extracting shared helpers before there is demonstrated leverage.

### Engineered extension layer

Path:

```text
ts/packages/pi-extensions/
```

The engineered layer is for durable behavior that benefits from tests, fake adapters, shared modules, or package-level validation. Project-local discovery adapters can stay in `.pi/extensions/` while the implementation lives in this package.

Use this layer for behavior that has proven stable, has meaningful safety risk, is reused by more than one extension, or needs fake-driven tests. For TypeScript package changes, validate with the canonical repo targets:

```text
just ts-check
just ts-test
```

The `justfile` owns the underlying package-manager invocation so guidance stays aligned with the repo validation surface.

### Promotion criteria

Consider promoting behavior from the vibecoded layer to the engineered layer when one or more criteria apply:

- **Stability:** the command behavior has proven durable and is no longer rapidly changing.
- **Risk:** incorrect behavior could affect branches, PRs, Graphite stacks, GitHub state, or user worktrees.
- **Reuse:** multiple extensions need the same command runtime, skill expansion, rendering, or workflow primitives.
- **Test need:** confidence requires fake-driven tests, branch/PR scenarios, or package-level validation.

Do not promote behavior merely because the extension is checked in. Do not extract shared helpers unless the deletion test shows real leverage across callers.

### Current inventory

| Area/file                                                         | Current layer                                  | Notes                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `.pi/extensions/objective.ts`                                     | Project-local adapter over engineered behavior | Loaded by Pi from `.pi/extensions/`; delegates namespaced `/objective:*` command wrappers to package code.                              |
| `.pi/extensions/dev.ts`                                           | Project-local adapter over engineered behavior | Adds `/dev:cp`, `/dev:autobranch`, `/dev:submit`, `/dev:land`, and `/dev:land-stack` local dev/source-control commands.                 |
| `.pi/extensions/handoff.ts`                                       | Project-local adapter over engineered behavior | Adds `/handoff:create`, `/handoff:pickup`, and `/handoff:list` for directed handoff artifacts, including a custom list renderer.        |
| `.pi/extensions/planned-branch.ts`                                | Project-local adapter over engineered behavior | Adds `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch`, defaulting this repo to Graphite creation.                    |
| `.pi/extensions/dispatch-runner-subagent.ts`                      | Project-local adapter over engineered behavior | Registers the `dispatch_runner_subagent` final-text tool for agents.                                                                    |
| `.pi/extensions/runner-subagent-demo.ts`                          | Project-local adapter over engineered behavior | Diagnostic command proving runner-subagent parent integration.                                                                          |
| `.pi/extensions/worktree-status.ts`                               | Project-local adapter over engineered behavior | Worktree/session status display backed by package code.                                                                                 |
| `.pi/extensions/just-fix.ts`                                      | Vibecoded implementation                       | Useful repo-local workflow; not yet promoted or package-tested.                                                                         |
| `ts/packages/pi-extensions/CONTEXT.md`                            | Engineered context                             | Domain language for this package and its project-local discovery adapters.                                                              |
| `ts/packages/pi-extensions/src/objective.ts`                      | Engineered implementation                      | Package-tested Objective extension behavior.                                                                                            |
| `ts/packages/pi-extensions/src/dev.ts`                            | Engineered implementation                      | Aggregates the package-tested `/dev:*` local dev/source-control command family for the project adapter.                                 |
| `ts/packages/pi-extensions/src/land.ts`                           | Engineered implementation                      | Package-tested GitHub single-PR squash landing behavior for `/dev:land`.                                                                |
| `ts/packages/pi-extensions/src/land-stack.ts` and `land-stack/*`  | Engineered implementation                      | Package-tested Graphite stack landing behavior for Pi-only `/dev:land-stack`; internals are split under `land-stack/`.                  |
| `ts/packages/pi-extensions/src/handoff.ts`                        | Engineered implementation                      | Package-tested handoff save/pickup/list command behavior and card-style list rendering over the Branch Memory handoff storage contract. |
| `ts/packages/pi-extensions/src/planned-branch-extension.ts`       | Engineered implementation                      | Planned-branch command/tool wiring over `src/planned-branch/*`.                                                                         |
| `ts/packages/pi-extensions/src/cp.ts` / `newbr*.ts`               | Engineered implementation                      | Checkpoint and autobranch workflows over pending-worktree, preparation, and transaction helpers.                                        |
| `ts/packages/pi-extensions/src/submit.ts`                         | Engineered implementation                      | Package-tested Graphite submit behavior with a `/dev:submit`-specific runner seam.                                                      |
| `ts/packages/pi-extensions/src/runner-subagent.ts` and submodules | Engineered implementation                      | Runner-subagent subprocess, JSON-event parsing, generated runtime extension, terminal capture, and final-text results.                  |
| `ts/packages/pi-extensions/src/terminal-presentation.ts`          | Engineered implementation                      | Shared terminal hyperlink/linkification and custom-message text helpers.                                                                |

## Resource surface policy

Pi's visible slash-command inventory for this repo is the RPC `get_commands` result. When auditing the visible surface, capture each command's `name`, `description`, `source`, and `sourceInfo` or `path` instead of inferring ownership from command names.

Repo-owned project surface:

- `.pi/extensions/...` project-local extension commands.
- `.pi/prompts/*.md` project prompt templates, when a lightweight Pi-only text expansion is the intended public surface.
- `skills/<name>/SKILL.md`, exposed through symlinks under `.agents/skills/<name>` for local asdl skills.

External or personal surface:

- Real directories under `.agents/skills/<name>/` are vendored or GitHub-sourced skills. They are live in Pi by default, but they are not repo products. Keep them as-shipped and exclude them from deep audits unless a task explicitly updates that vendored skill. Runtime policy: keep them enabled by default as developer aids; remove or disable them only through explicit skill-management work. No repo implementation change is required by this policy.
- User-local resources under `~/.pi/agent/...` may appear in a developer's Pi RPC inventory. Treat CMUX, `gh-pr`, `stack-latest`, and similar local workflow commands as advisory personal-resource findings, not closure-critical repo cleanup.

Rules:

- Repo-owned Pi extension command families should use `/namespace:command` names when introduced or renamed. Use the domain/CLI namespace when obvious, such as `/objective:list`, `/objective:next`, or `/objective:stack-impl`. Reserve `/skill:<name>` for Pi's skill-command namespace and do not register extension commands under `skill:*`.
- Existing short top-level extension commands may remain when they are deliberately standalone or awaiting explicit disposition. Do not add legacy aliases only for autocomplete convenience; visible aliases increase surface area.
- Avoid duplicate public slash-command names. If a wrapper and prompt share a name, choose one public entrypoint and make the other an internal asset, rename it, convert it to a skill, or document the intentional duplication.
- Mutating commands that touch git or GitHub state need either engineered tests/adapters or explicit docs saying why the vibecoded command is retained and what safety checks it owns.
- Command descriptions should distinguish adjacent commands in autocomplete. If two command names intentionally share behavior, say which one is the alias or focused entrypoint.
- For local command skills, use `description: "Command: <skill-name>"` rather than bare `Command`; keep richer routing in the skill body or original-description comment.

## Current cleanup ordering and dispositions

The resource-surface cleanup proceeds in small slices:

1. Metadata/docs first: record policy, normalize low-risk descriptions, and make aliases legible. Completed.
2. Resolve the duplicate Objective stack implementation surface by using the namespaced Pi wrapper `/objective:stack-impl` and the portable skill `/skill:objective-stack-impl`. Completed.
3. Promote and test the legacy `/land` behavior as namespaced `/gh:land`, and rename the stack landing entrypoint to Pi-only `/gt:land-stack` without legacy aliases. Completed.
4. Re-run Pi RPC command inventory after material changes and record the final surface as closure evidence. Completed for the landing, `/dev:*`, and handoff slices.
5. Remove manual worktree status slash commands while preserving automatic status-line refresh. Completed.
6. Consolidate the local development/source-control commands under `/dev:*` without legacy aliases. Completed; fresh RPC inventory reports `/dev:cp`, `/dev:autobranch`, `/dev:submit`, `/dev:land`, and `/dev:land-stack`, with no legacy `/cp`, `/newbr`, `/submit`, `/gh:land`, or `/gt:land-stack` aliases.
7. Categorize the remaining repo-owned workflow families. Completed; planned-branch commands are retained under their existing names, handoff artifacts use final `/handoff:*` command names and `handoff-*` skills, and branch retrospective remains intentionally skill/CLI-centered around `/skill:branch-retro` plus `aretro exec collect-evidence`.

| Surface                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<name>` local symlinked skills                                                    | Repo-owned; metadata cleanup is allowed. Command skills should use the explicit `Command: <skill-name>` description marker.                                                                                                                                                                                                                                                                                               |
| Real-directory skills under `.agents/skills/<name>/`                                      | External/vendored runtime skills; remain live by default, excluded from deep review, and edited only by explicit request.                                                                                                                                                                                                                                                                                                 |
| `worktree-status`, `brmem-status`, and `gt-status`                                        | Pruned as public Pi commands; worktree status remains automatic through extension lifecycle refresh hooks and footer status updates.                                                                                                                                                                                                                                                                                      |
| `/objective:stack-impl` plus `/skill:objective-stack-impl`                                | Resolved Objective stack implementation surface: Pi uses the namespaced picker wrapper; Codex/Claude use the portable skill; no public prompt-template duplicate remains.                                                                                                                                                                                                                                                 |
| `/dev:cp`                                                                                 | Checkpoint command: creates a checkpoint commit for the current diff with the package-tested pending-worktree/checkpoint helpers. Legacy `/cp` is removed by the `/dev:*` migration.                                                                                                                                                                                                                                      |
| `/dev:autobranch`                                                                         | Autobranch command: creates a Graphite branch from current uncommitted changes, generating both the branch name and checkpoint commit message. Legacy `/newbr` is removed by the `/dev:*` migration.                                                                                                                                                                                                                      |
| `/dev:submit`                                                                             | Graphite submit command: submits or updates the current stack with guarded package-tested submit behavior. Legacy `/submit` is removed by the `/dev:*` migration.                                                                                                                                                                                                                                                         |
| `/dev:land`                                                                               | Resolved GitHub landing surface: Pi single-PR squash merge entrypoint backed by package tests; legacy `/land` and `/gh:land` aliases removed. Codex/Claude should use the equivalent `gh pr view` plus `gh pr merge -s --match-head-commit ... --subject ... --body ...` flow rather than a Pi slash command.                                                                                                             |
| `/dev:land-stack`                                                                         | Pi-only Graphite stack landing surface backed by package tests; legacy `/land-stack` and `/gt:land-stack` aliases removed. No Codex/Claude stack-landing workflow is claimed yet.                                                                                                                                                                                                                                         |
| Planned branch workflow (`/write-plan`, `/create-planned-branch`, `/impl-planned-branch`) | Retained as the public Pi planning-layer command sequence. Portable core: the documented saved-plan and Branch Memory `brmem-plans` storage contracts in `docs/pi/planned-branch-workflow.md`; Pi entrypoints are the three commands plus `write_source_branch_plan_file`. Codex/Claude have no separate shortcut in this slice and should follow the documented storage/CLI recovery path only when explicitly directed. |
| Handoff artifact workflow (`/handoff:create`, `/handoff:pickup`, `/handoff:list`)         | Final project-local handoff surface. Users create, pick up, list, and resume from directed handoff artifacts without thinking in Branch Memory terms; storage details are technical locators only. No old `brmem`-named handoff aliases are retained.                                                                                                                                                                     |
| Branch retrospectives (`/skill:branch-retro`, `aretro exec collect-evidence`)             | Intentionally skill/CLI-centered and retained. The user-facing capability remains a branch/session retrospective, so the skill stays `branch-retro`; `aretro exec collect-evidence` is the deterministic evidence-collection boundary used by the skill, not a replacement Pi command name. Codex/Claude use the same installed skill surface.                                                                            |
| User-local CMUX, `gh-pr`, `stack-latest`, and skills                                      | Personal-resource findings only; do not promote or mutate unless explicitly requested.                                                                                                                                                                                                                                                                                                                                    |

## Planned branch workflow

The planned-branch workflow uses `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` to save reviewed plans, create implementation branches, attach plans through Branch Memory, and load them for implementation.

See [Planned Branch Workflow](./planned-branch-workflow.md).

## Handoff artifacts

A handoff is a directed, saved work-context artifact for a specific future continuation. Use save/pickup/list/resume language in normal user-facing copy; Branch Memory is the current technical storage layer, not the public model.

See [Handoff Artifacts](./handoff-artifacts.md).

## Extension message linkification

For clickable PR/issue links in custom Pi extension output, keep message content plain, carry URLs in `message.details`, and linkify in the registered renderer.

See [Extension message linkification](./extension-message-linkification.md).

## Runner subagent helper

The local runner subagent helper lets project extensions await a fresh runner subagent and receive either a structured terminal-capture result or final assistant text without slash-command handoff text.

See [Runner Subagent Helper](./runner-subagent-helper.md).

## Checked-in extensions and worktrees

If a project-local extension participates in worktree switching, it must be present in the target worktree too.

In practice, that means the extension should be:

- checked into the repo, and
- loaded from a path that exists in every worktree for that checkout

A local untracked extension in one checkout is not sufficient for a flow that switches Pi to another worktree.

## `/reload`

After editing project-local Pi resources, use:

```text
/reload
```

This reloads:

- extensions
- skills
- prompt templates
- themes
- context files

Use `/reload` after changing files under `.pi/extensions/`.

## Project-local vs global extensions

### Prefer project-local extensions when

- the behavior is specific to this repo
- the extension shells out to repo CLIs like `slot`
- the extension depends on repo conventions or checked-in files
- you want the behavior to travel with the repository

### Prefer global extensions when

- the behavior is editor- or terminal-wide rather than repo-specific
- you want it in all repositories
- the extension must remain available across cwd/session switches into projects that may not carry the same checked-in extension

Global extensions live under:

```text
~/.pi/agent/extensions/
```

## Core subagent and Objective stack rewrite proposals

- [Pi Core Subagent MVP Objective](../../.asdl/objective-archive/pi-core-subagent-mvp/objective.md): archived design record for the proposed Pi core foreground runner subagent primitive and terminal capture semantics.
- [Pi Core Subagent MVP Roadmap](../../.asdl/objective-archive/pi-core-subagent-mvp/roadmap.md): archived review-slice plan for the primitive.
- [Objective Stack Runner-Subagent Rewrite Brief](./objective-stack-subagent-rewrite-brief.md): goals, command parameters, failure analysis, and rewrite plan for rebuilding Objective stack implementation on the repo-local runner subagent helper.

## Session `cwd` semantics

Pi's working directory is **session-bound**, not shell-command-bound.

That means:

- `ctx.cwd` reflects the active Pi session/runtime
- shell commands like `cd ../other-worktree && git status` do **not** change Pi's session `cwd`
- Pi can move to another `cwd` when it replaces the active session/runtime

For details, see:

- [Session `cwd` semantics](./session-cwd-semantics.md)

## Recommended cross-worktree pattern

For repo workflows that intentionally move to another worktree:

1. resolve or create the target worktree using the repo CLI
2. create a **fresh** Pi session rooted at that worktree
3. switch Pi to that session

Do not try to infer a durable Pi cwd change from arbitrary shell `cd` commands.
