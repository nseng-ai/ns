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

| Area/file                                                                 | Current layer                                  | Notes                                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pi/extensions/objective.ts`                                             | Project-local adapter over engineered behavior | Loaded by Pi from `.pi/extensions/`; delegates namespaced `/objective:*` command wrappers to package code.                                                          |
| `.pi/extensions/asdl-dev.ts`                                              | Project-local adapter over engineered behavior | Mirrors the non-code `asdl-dev preview-url` command into Pi as `/dev:preview-url`.                                                                                  |
| `.pi/extensions/code.ts`                                                  | Project-local adapter over engineered behavior | Adds `/code:changes`, `/code:cp`, `/code:submit`, `/code:autobranch`, `/code:land`, and `/code:land-stack` code/source-control commands.                            |
| `.pi/extensions/handoff.ts`                                               | Project-local adapter over engineered behavior | Adds `/handoff:create`, `/handoff:pickup`, and `/handoff:list` for directed handoff artifacts, including a custom list renderer.                                    |
| `.pi/extensions/planned-branch.ts`                                        | Project-local adapter over engineered behavior | Adds `/planned-branch:write-plan`, `/planned-branch:create`, and `/planned-branch:impl`, defaulting this repo to Graphite creation.                                 |
| `.pi/extensions/dispatch-runner-subagent.ts`                              | Project-local adapter over engineered behavior | Registers the `dispatch_runner_subagent` final-text tool for agents.                                                                                                |
| `.pi/extensions/grill-ui.ts`                                              | Project-local adapter over engineered behavior | Adds `/grill-ui` and the `grill_ask` structured question tool for Pi grill sessions.                                                                                |
| `.pi/extensions/worktree-status.ts`                                       | Project-local adapter over engineered behavior | Worktree/session status display backed by package code.                                                                                                             |
| `.pi/extensions/cmux.ts`                                                  | Project-local adapter over engineered behavior | Registers `/cmux:pr-sidebar`, `/cmux:objective-sidebar`, `/cmux-slot:dispatch-plan`, `/cmux-slot:open-branch`, and `/cmux-dispatch` through the package cmux suite. |
| `.pi/extensions/just-fix.ts`                                              | Vibecoded implementation                       | Useful repo-local workflow; not yet promoted or package-tested.                                                                                                     |
| `.pi/extensions/roast.ts`                                                 | Project-local adapter over engineered behavior | Adds `/roast`, which lists changed-path-selected reviewers, runs selected review keys, and presents one aggregate result.                                           |
| `ts/packages/pi-extensions/CONTEXT.md`                                    | Engineered context                             | Domain language for this package and its project-local discovery adapters.                                                                                          |
| `ts/packages/pi-extensions/src/objective.ts`                              | Engineered implementation                      | Package-tested Objective extension behavior, including the unified `/objective:next` front door.                                                                    |
| `ts/packages/pi-extensions/src/grill-ui.ts` and `grill-ui/*`              | Engineered implementation                      | Structured grill UI command/tool over the internal `pi-grill-ui` skill.                                                                                             |
| `ts/packages/pi-extensions/src/asdl-dev-extension.ts`                     | Engineered implementation                      | Splits the `asdl-dev` command table by Pi domain namespace: `/dev:preview-url` plus `/code:cp` and `/code:submit`.                                                  |
| `ts/packages/pi-extensions/src/cli-command-extension.ts`                  | Engineered implementation                      | Shared helper that invokes CLI command tables from Pi slash commands and displays captured stdout/stderr.                                                           |
| `ts/packages/pi-extensions/src/code.ts`                                   | Engineered implementation                      | Aggregates the package-tested `/code:*` local code/source-control command family and the `asdl-dev` code-command mirrors for the project adapter.                   |
| `ts/packages/pi-extensions/src/land.ts`                                   | Engineered implementation                      | Package-tested GitHub single-PR squash landing behavior for `/code:land`.                                                                                           |
| `ts/packages/pi-extensions/src/land-stack.ts` and `land-stack/*`          | Engineered implementation                      | Package-tested Graphite stack landing behavior for Pi-only `/code:land-stack`; internals are split under `land-stack/`.                                             |
| `ts/packages/pi-extensions/src/handoff.ts`                                | Engineered implementation                      | Package-tested handoff save/pickup/list command behavior and card-style list rendering over the Branch Memory handoff storage contract.                             |
| `ts/packages/pi-extensions/src/planned-branch-extension.ts`               | Engineered implementation                      | Planned-branch Pi command/tool wiring over the `@asdl/planned-branch` package.                                                                                      |
| `ts/packages/pi-extensions/src/asdl-dev-checkpoint.ts` / `autobranch*.ts` | Engineered implementation                      | Shared checkpoint-message adapter plus autobranch workflows over pending-worktree, preparation, and transaction helpers.                                            |
| `ts/packages/asdl-dev/src/submit.ts`                                      | Engineered implementation                      | Headless Graphite submit command used by `asdl-dev submit` and mirrored into Pi as `/code:submit`; replaces the former Pi-only submit implementation.               |
| `ts/packages/pi-extensions/src/runner-subagent.ts` and submodules         | Engineered implementation                      | Runner-subagent subprocess, JSON-event parsing, generated runtime extension, terminal capture, and final-text results.                                              |
| `ts/packages/pi-extensions/src/cmux.ts` and `cmux/*`                      | Engineered implementation                      | Project cmux command suite, manual caller-workspace sidebar controller, slot helpers, and workspace-opening commands.                                               |
| `ts/packages/pi-extensions/src/terminal-presentation.ts`                  | Engineered implementation                      | Shared terminal hyperlink/linkification and custom-message text helpers.                                                                                            |
| `ts/packages/pi-extensions/src/roast.ts`                                  | Engineered implementation                      | Package-tested `/roast` orchestration over `roaster review list-matching`, `roaster harness show`, and selected `roaster review run <key>` calls.                   |

## Resource surface policy

Pi's visible slash-command inventory for this repo is the RPC `get_commands` result. When auditing the visible surface, capture each command's `name`, `description`, `source`, and `sourceInfo` or `path` instead of inferring ownership from command names.

Repo-owned project surface:

- `.pi/extensions/...` project-local extension commands.
- `.pi/prompts/*.md` project prompt templates, when a lightweight Pi-only text expansion is the intended public surface.
- `skills/<name>/SKILL.md`, exposed through symlinks under `.agents/skills/<name>` for local asdl skills.

External or personal surface:

- Real directories under `.agents/skills/<name>/` are vendored or GitHub-sourced skills. They are live in Pi by default, but they are not repo products. Keep them as-shipped and exclude them from deep audits unless a task explicitly updates that vendored skill. Runtime policy: keep them enabled by default as developer aids; remove or disable them only through explicit skill-management work. No repo implementation change is required by this policy.
- User-local resources under `~/.pi/agent/...` may appear in a developer's Pi RPC inventory. Treat `gh-pr`, `stack-latest`, and similar local workflow commands as advisory personal-resource findings, not closure-critical repo cleanup. The cmux command suite is now project-local for this repo.

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
3. Resolve the single-PR and stack landing surfaces without legacy top-level aliases; the current code namespace exposes them as `/code:land` and `/code:land-stack`. Completed.
4. Re-run Pi RPC command inventory after material changes and record the final surface as closure evidence. Completed for the landing, `/code:*`, and handoff slices.
5. Remove manual worktree status slash commands while preserving automatic status-line refresh. Completed.
6. Consolidate the local codebase/source-control commands under `/code:*` without legacy aliases. Completed; fresh RPC inventory should report `/code:changes`, `/code:cp`, `/code:submit`, `/code:autobranch`, `/code:land`, and `/code:land-stack` for the code extension, plus the non-code `asdl-dev` mirror `/dev:preview-url`, with no legacy `/dev:cp`, `/dev:submit`, `/cp`, `/newbr`, `/submit`, `/gh:land`, or `/gt:land-stack` aliases. The mirrored behavior is still sourced from the `asdl-dev` command table.
7. Categorize the remaining repo-owned workflow families. Completed; planned-branch now uses the `/planned-branch:*` Pi command family plus public Claude Code skills, handoff artifacts use final `/handoff:*` command names and `handoff-*` skills, and branch retrospective remains intentionally skill/CLI-centered around `/skill:branch-retro` plus `aretro exec collect-evidence`.

| Surface                                                                                                                                            | Disposition                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<name>` local symlinked skills                                                                                                             | Repo-owned; metadata cleanup is allowed. Command skills should use the explicit `Command: <skill-name>` description marker.                                                                                                                                                                                                                                               |
| Real-directory skills under `.agents/skills/<name>/`                                                                                               | External/vendored runtime skills; remain live by default, excluded from deep review, and edited only by explicit request.                                                                                                                                                                                                                                                 |
| `worktree-status`, `brmem-status`, and `gt-status`                                                                                                 | Pruned as public Pi commands; worktree status remains automatic through extension lifecycle refresh hooks and footer status updates.                                                                                                                                                                                                                                      |
| `/objective:stack-impl` plus `/skill:objective-stack-impl`                                                                                         | Resolved Objective stack implementation surface: Pi uses the namespaced picker wrapper; Codex/Claude use the portable skill; no public prompt-template duplicate remains.                                                                                                                                                                                                 |
| `/objective:next` plus `/skill:objective-next`                                                                                                     | Unified Objective advancement front door: recommends next work, steers planning, or offers an execution preview when explicit Runner Policy / Definition of Progress prose allows it. The removed proto runner surface is not retained as a separate Pi command or skill.                                                                                                 |
| `/grill-ui` plus `grill_ask`                                                                                                                       | Pi-only structured grill UI surface: `/grill-ui` invokes the internal `pi-grill-ui` backend skill and registers the `grill_ask` tool. Portable non-Pi grilling routes remain the installed `grill-me` and `grill-with-docs` skills, not `pi-grill-ui` directly.                                                                                                           |
| `/dev:preview-url`                                                                                                                                 | Mirrored `asdl-dev preview-url` command: prints the Vercel preview URL for a branch. It is exposed through `.pi/extensions/asdl-dev.ts`, not the Pi-only `code.ts` extension.                                                                                                                                                                                             |
| `/code:cp`                                                                                                                                         | Mirrored `asdl-dev cp` command: creates a checkpoint commit for the current diff with model-authored message generation. Legacy `/dev:cp` and `/cp` aliases are not registered.                                                                                                                                                                                           |
| `/code:changes`                                                                                                                                    | Read-only outstanding changes summary: presents the current pending worktree snapshot without staging, committing, stashing, or switching branches.                                                                                                                                                                                                                       |
| `/code:autobranch`                                                                                                                                 | Autobranch command: creates a Graphite branch from current uncommitted changes, generating both the branch name and checkpoint commit message. Legacy `/newbr` is removed by the `/code:*` migration.                                                                                                                                                                     |
| `/code:submit`                                                                                                                                     | Mirrored `asdl-dev submit` command: submits or updates the current Graphite stack with gateway-backed Graphite submit behavior and Pi-provided confirmations when available. Legacy `/dev:submit` and `/submit` aliases are not registered.                                                                                                                               |
| `/code:land`                                                                                                                                       | Resolved GitHub landing surface: Pi single-PR squash merge entrypoint backed by package tests; legacy `/land` and `/gh:land` aliases removed. Codex/Claude should use the equivalent `gh pr view` plus `gh pr merge -s --match-head-commit ... --subject ... --body ...` flow rather than a Pi slash command.                                                             |
| `/code:land-stack`                                                                                                                                 | Pi-only Graphite stack landing surface backed by package tests; legacy `/land-stack` and `/gt:land-stack` aliases removed. No Codex/Claude stack-landing workflow is claimed yet.                                                                                                                                                                                         |
| Planned branch workflow (`/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:impl`)                                           | Final public Pi planning-layer command sequence. Portable core: the `@asdl/planned-branch` package, `planned-branch` bin, local store `~/.asdl/planned-branch/plans/...`, and Branch Memory namespace `planned-branch`. Claude Code uses `/skill:planned-branch-write-plan`, `/skill:planned-branch-create`, and `/skill:planned-branch-impl` over the same CLI contract. |
| Handoff artifact workflow (`/handoff:create`, `/handoff:pickup`, `/handoff:list`)                                                                  | Final project-local handoff surface. Users create, pick up, list, and resume from directed handoff artifacts without thinking in Branch Memory terms; storage details are technical locators only. No old `brmem`-named handoff aliases are retained.                                                                                                                     |
| Branch retrospectives (`/skill:branch-retro`, `aretro exec collect-evidence`)                                                                      | Intentionally skill/CLI-centered and retained. The user-facing capability remains a branch/session retrospective, so the skill stays `branch-retro`; `aretro exec collect-evidence` is the deterministic evidence-collection boundary used by the skill, not a replacement Pi command name. Codex/Claude use the same installed skill surface.                            |
| Project cmux command suite (`/cmux:pr-sidebar`, `/cmux:objective-sidebar`, `/cmux-slot:dispatch-plan`, `/cmux-slot:open-branch`, `/cmux-dispatch`) | Promoted to `.pi/extensions/cmux.ts` plus `ts/packages/pi-extensions/src/cmux/`. Manual sidebar commands remain available; workspace-opening commands do not auto-queue sidebar summaries pending cmux extension rearchitecture. `/cmux:set-workspace-summary` and `/cmux-refresh-meta` are not retained as aliases.                                                      |
| Remaining user-local `gh-pr`, `stack-latest`, and skills                                                                                           | Personal-resource findings only; do not promote or mutate unless explicitly requested.                                                                                                                                                                                                                                                                                    |

## Exposing Pi commands through `asdl-dev`

Durable headless developer commands should live in the `asdl-dev` CLI first, then be mirrored into Pi under the domain namespace chosen by the project: currently `/dev:preview-url` for preview URL lookup and `/code:cp` / `/code:submit` for code/source-control workflows.

See [Exposing Pi Commands Through `asdl-dev`](./exposing-pi-commands-through-asdl-dev.md).

## cmux extension pattern

Manual cmux sidebar commands should target the caller workspace for summary updates, keep cmux mutations behind deterministic `asdl exec` commands, and avoid relying on stale local cmux source checkouts. Workspace-opening commands currently do not auto-run sidebar summaries. The project cmux suite lives behind `.pi/extensions/cmux.ts` and `ts/packages/pi-extensions/src/cmux/`.

See [cmux Extension Pattern for Pi](./cmux-extension-pattern.md) and [Querying cmux Help](../cmux/help-querying.md).

## Planned branch workflow

The planned-branch workflow uses `/planned-branch:write-plan`, `/planned-branch:create`, and `/planned-branch:impl` in Pi, plus the `planned-branch-write-plan`, `planned-branch-create`, and `planned-branch-impl` skills in Claude Code, to save reviewed plans, create implementation branches, attach plans through Branch Memory, and load them for implementation.

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
