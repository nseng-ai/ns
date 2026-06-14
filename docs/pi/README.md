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

| Area/file                                                                 | Current layer                                  | Notes                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pi/extensions/objective.ts`                                             | Project-local adapter over engineered behavior | Loaded by Pi from `.pi/extensions/`; delegates namespaced `/objective:*` command wrappers to package code.                                                                                                                                                                              |
| `.pi/extensions/asdl-dev.ts`                                              | Project-local adapter over engineered behavior | Mirrors the non-code `asdl-dev preview-url` command into Pi as `/dev:preview-url`.                                                                                                                                                                                                      |
| `.pi/extensions/code.ts`                                                  | Project-local adapter over engineered behavior | Adds `/code:push`, `/code:autobranch`, and unified `/code:land` code/source-control commands. Changes and submit now live under `/sdl:*`.                                                                                                                                               |
| `.pi/extensions/sdl.ts`                                                   | Project-local adapter over engineered behavior | Adds native `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` commands over the `sdl` CLI.                                                                                                                                                                                                   |
| `.pi/extensions/handoff.ts`                                               | Project-local adapter over engineered behavior | Adds `/handoff:create`, `/handoff:pickup`, and `/handoff:list` for directed handoff artifacts, including a custom list renderer; also registers `/ccc:handoff-tab` when tool support is available.                                                                                      |
| `.pi/extensions/branch-context.ts`                                        | Project-local adapter over engineered behavior | Adds `/enriched-plan:save`, `/enriched-plan:grill-and-save`, `/branch-context:from-plan`, `/branch-context:upstack-impl-session`, and `/branch-context:impl`; this repo defaults `/branch-context:from-plan` to Graphite, while `upstack-impl-session` is Graphite by built-in default. |
| `.pi/extensions/dispatch-runner-subagent.ts`                              | Project-local adapter over engineered behavior | Registers the `dispatch_runner_subagent` final-text tool for agents.                                                                                                                                                                                                                    |
| `.pi/extensions/grill-ui.ts`                                              | Project-local adapter over engineered behavior | Adds `/pi:grill-me`, `/pi:grill-with-docs`, and the `grill_ask` structured question tool for Pi grill sessions.                                                                                                                                                                         |
| `.pi/extensions/worktree-status.ts`                                       | Project-local adapter over engineered behavior | Worktree/session status display backed by package code.                                                                                                                                                                                                                                 |
| `.pi/extensions/ccc.ts`                                                   | Project-local adapter over engineered behavior | Registers `/ccc:sidebar:pr-summary`, `/ccc:sidebar:objective-summary`, `/ccc:workspace:dispatch-plan`, `/ccc:workspace:open-branch`, and `/ccc:workspace:dispatch-prompt` through the private CCC command suite.                                                                        |
| `.pi/extensions/just-fix.ts`                                              | Vibecoded implementation                       | Useful repo-local workflow; not yet promoted or package-tested.                                                                                                                                                                                                                         |
| `ts/packages/pi-extensions/CONTEXT.md`                                    | Engineered context                             | Domain language for this package and its project-local discovery adapters.                                                                                                                                                                                                              |
| `ts/packages/pi-extensions/src/objective.ts`                              | Engineered implementation                      | Package-tested Objective extension behavior, including the unified `/objective:next` front door.                                                                                                                                                                                        |
| `ts/packages/pi-extensions/src/grill-ui.ts` and `grill-ui/*`              | Engineered implementation                      | Structured grill UI commands/tool over the internal `pi-grill-ui` and `pi-grill-with-docs-ui` skills.                                                                                                                                                                                   |
| `ts/packages/pi-extensions/src/asdl-dev-extension.ts`                     | Engineered implementation                      | Splits the remaining `asdl-dev` command table by Pi domain namespace: `/dev:preview-url` plus `/code:pr-regen`.                                                                                                                                                                         |
| `ts/packages/pi-extensions/src/sdl-extension.ts`                          | Engineered implementation                      | Mirrors native `sdl cp` into Pi as `/sdl:cp`, replacing the former `/code:cp` registration without a compatibility alias.                                                                                                                                                               |
| `ts/packages/pi-extensions/src/cli-command-extension.ts`                  | Engineered implementation                      | Shared helper that invokes CLI command tables from Pi slash commands and displays captured stdout/stderr.                                                                                                                                                                               |
| `ts/packages/pi-extensions/src/code.ts`                                   | Engineered implementation                      | Aggregates the package-tested `/code:*` local code/source-control command family and the `asdl-dev` code-command mirrors for the project adapter.                                                                                                                                       |
| `ts/packages/pi-extensions/src/land.ts`                                   | Engineered implementation                      | Package-tested adapter for unified `/code:land`, delegating Graphite-proven single-PR and stack landing behavior to CCC.                                                                                                                                                                |
| `ts/packages/ccc/src/land-stack/*`                                        | Engineered implementation                      | Internal Graphite stack landing engine used by unified `/code:land`; internals remain split under `land-stack/`.                                                                                                                                                                        |
| `ts/packages/pi-extensions/src/handoff.ts`                                | Engineered implementation                      | Package-tested handoff create/pickup/list command behavior and card-style list rendering over the Branch Memory handoff storage contract.                                                                                                                                               |
| `ts/packages/pi-extensions/src/branch-context-extension.ts`               | Engineered implementation                      | Branch-context Pi command/tool wiring over the `@asdl/branch-context` package.                                                                                                                                                                                                          |
| `ts/packages/pi-extensions/src/asdl-dev-checkpoint.ts` / `autobranch*.ts` | Engineered implementation                      | Shared checkpoint-message adapter plus autobranch workflows over pending-worktree, preparation, latest-commit extraction, and transaction helpers.                                                                                                                                      |
| `.asdl/commands/submit.ts`                                                | Repo-local SDL command module                  | Headless Graphite submit command used by `sdl submit` and mirrored into Pi as `/sdl:submit`; replaces the transitional `asdl-dev submit` / `/code:submit` surfaces.                                                                                                                     |
| `ts/packages/pi-extensions/src/runner-subagent.ts` and submodules         | Engineered implementation                      | Runner-subagent subprocess, JSON-event parsing, generated runtime extension, terminal capture, and final-text results.                                                                                                                                                                  |
| `ts/packages/ccc/src/ccc.ts` and `cmux/*`                                 | Engineered implementation                      | Private CCC command suite, manual caller-workspace sidebar controller, slot helpers, and workspace-opening commands that operate cmux workspaces.                                                                                                                                       |
| `ts/packages/pi-extensions/src/terminal-presentation.ts`                  | Engineered implementation                      | Shared terminal hyperlink/linkification and custom-message text helpers.                                                                                                                                                                                                                |

## Resource surface policy

Pi's visible slash-command inventory for this repo is the RPC `get_commands` result. When auditing the visible surface, capture each command's `name`, `description`, `source`, and `sourceInfo` or `path` instead of inferring ownership from command names.

Repo-owned project surface:

- `.pi/extensions/...` project-local extension commands.
- `.pi/prompts/*.md` project prompt templates, when a lightweight Pi-only text expansion is the intended public surface.
- `skills/<name>/SKILL.md`, exposed through symlinks under `.agents/skills/<name>` for local asdl skills.

External or personal surface:

- Real directories under `.agents/skills/<name>/` are vendored or GitHub-sourced skills. They are live in Pi by default, but they are not repo products. Keep them as-shipped and exclude them from deep audits unless a task explicitly updates that vendored skill. Runtime policy: keep them enabled by default as developer aids; remove or disable them only through explicit skill-management work. No repo implementation change is required by this policy.
- User-local resources under `~/.pi/agent/...` may appear in a developer's Pi RPC inventory. Treat `gh-pr`, `stack-latest`, and similar local workflow commands as advisory personal-resource findings, not closure-critical repo cleanup. The CCC workspace/sidebar command suite is now project-local for this repo.

Rules:

- Repo-owned Pi extension command families should use `/namespace:command` names when introduced or renamed. Use the domain/CLI namespace when obvious, such as `/objective:list`, `/objective:next`, or `/objective:stack-impl`. Reserve `/skill:<name>` for Pi's skill-command namespace and do not register extension commands under `skill:*`.
- Existing short top-level extension commands may remain when they are deliberately standalone or awaiting explicit disposition. Do not add legacy aliases only for autocomplete convenience; visible aliases increase surface area.
- Avoid duplicate public slash-command names. If a wrapper and prompt share a name, choose one public entrypoint and make the other an internal asset, rename it, convert it to a skill, or document the intentional duplication.
- Mutating commands that touch git or GitHub state need either engineered tests/adapters or explicit docs saying why the vibecoded command is retained and what safety checks it owns.
- Command descriptions should distinguish adjacent commands in autocomplete. If two command names intentionally share behavior, say which one is the alias or focused entrypoint.
- For local command skills, use `description: "Command: <skill-name>"` rather than bare `Command`; keep richer routing in the skill body or original-description comment.

### Command namespace conventions

Use command namespaces to communicate workflow ownership, not implementation file location:

- `/pi:*` — Pi-native UI or session affordances whose portable counterpart is a skill or ordinary harness behavior. Current examples: `/pi:grill-me` and `/pi:grill-with-docs`.
- `/ccc:*` — command-and-control orchestration, especially cmux/session/workspace flows. Current examples: `/ccc:handoff-tab`, `/ccc:sidebar:*`, and `/ccc:workspace:*`.
- `/code:*` — codebase/source-control management workflows that have not moved to SDL yet, such as branch movement, already-committed pushes, and landing.
- `/handoff:*` — durable Handoff artifact lifecycle: create, pick up, and list. Session launchers built on handoffs belong in the orchestration namespace, not the artifact lifecycle namespace.
- `/objective:*`, `/branch-context:*`, and `/enriched-plan:*` — domain-owned planning/objective workflows.

Recent rename decisions:

- `/grill-ui` → `/pi:grill-me` because the command is a Pi-native structured UI over the public `grill-me` skill.
- `/grill-with-docs-ui` → `/pi:grill-with-docs` for the same reason, over the public `grill-with-docs` skill.
- `/handoff-tab` → `/ccc:handoff-tab` because the command is focused cmux/session orchestration over the portable handoff artifact contract.

Do not register compatibility aliases for these old names unless an explicit migration requirement outweighs the surface-area cost.

### Parity metadata scope

The `@asdl/pi-extensions` typed parity gate tracks package-owned Pi **command** registrations. Pi model-visible tools are host-native bridges and do not require standalone parity metadata rows. If a command depends on a tool, put the fallback and parity rationale on the command row. Examples of tool bridges that are intentionally not rows: `grill_ask`, `dispatch_runner_subagent`, `write_saved_plan_file`, `derive_handoff_slug_from_content`, and `handoff_tab_launch`.

## Skill/extension router pattern

Rare internal workflow skills can be consolidated behind one terse router skill, with full playbooks lazy-loaded from `references/` and optional Pi selector commands for deterministic route choice without starting an LM turn.

See [Skill/Extension Router Pattern](../skill-extension-router-pattern.md).

## Current cleanup ordering and dispositions

The resource-surface cleanup proceeds in small slices:

1. Metadata/docs first: record policy, normalize low-risk descriptions, and make aliases legible. Completed.
2. Resolve the duplicate Objective stack implementation surface by using the namespaced Pi wrapper `/objective:stack-impl` and the portable skill `/skill:objective-stack-impl`. Completed.
3. Resolve the single-PR and stack landing surfaces without legacy top-level aliases; the current code namespace exposes only unified `/code:land` for landing. Completed.
4. Re-run Pi RPC command inventory after material changes and record the final surface as closure evidence. Completed for the landing, `/code:*`, and handoff slices.
5. Remove manual worktree status slash commands while preserving automatic status-line refresh. Completed.
6. Consolidate the local codebase/source-control commands under `/code:*` without legacy aliases. Completed; after the native `sdl changes` slice, fresh RPC inventory should report `/code:push`, `/code:autobranch`, and `/code:land` for the code extension, `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` for SDL workflows, plus the non-code `asdl-dev` mirror `/dev:preview-url`, with no legacy `/code:changes`, `/code:cp`, `/dev:cp`, `/dev:submit`, `/cp`, `/newbr`, `/submit`, `/gh:land`, `/land-stack`, or `/gt:land-stack` aliases. Changes, checkpoint, and submit behavior are now sourced from `sdl`; `pr-regen` remains sourced from the `asdl-dev` command table.
7. Categorize the remaining repo-owned workflow families. Completed; branch-context now uses the `/branch-context:*` Pi command family plus public installed agent skills, handoff artifacts use final `/handoff:*` command names and `handoff-*` skills, and branch retrospective remains intentionally skill/CLI-centered around `/skill:branch-retro` plus `aretro exec collect-evidence`.

| Surface                                                                                                                                                                                                                       | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<name>` local symlinked skills                                                                                                                                                                                        | Repo-owned; metadata cleanup is allowed. Command skills should use the explicit `Command: <skill-name>` description marker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Real-directory skills under `.agents/skills/<name>/`                                                                                                                                                                          | External/vendored runtime skills; remain live by default, excluded from deep review, and edited only by explicit request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `worktree-status`, `brmem-status`, and `gt-status`                                                                                                                                                                            | Pruned as public Pi commands; worktree status remains automatic through extension lifecycle refresh hooks and footer status updates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/objective:stack-impl` plus `/skill:objective-stack-impl`                                                                                                                                                                    | Resolved Objective stack implementation surface: Pi uses the namespaced picker wrapper; Codex/Claude use the portable skill; no public prompt-template duplicate remains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/objective:next` plus `/skill:objective-next`                                                                                                                                                                                | Unified Objective advancement front door: recommends next work, steers planning, or offers an execution preview when explicit Runner Policy / Definition of Progress prose allows it. The removed proto runner surface is not retained as a separate Pi command or skill.                                                                                                                                                                                                                                                                                                                                                                                   |
| `/pi:grill-me`, `/pi:grill-with-docs`, plus `grill_ask`                                                                                                                                                                       | Pi-only structured grill UI surface: `/pi:grill-me` invokes internal `pi-grill-ui` for plain grilling, `/pi:grill-with-docs` invokes internal `pi-grill-with-docs-ui` for docs-aware grilling, and both share the `grill_ask` tool. Portable non-Pi routes remain the installed `grill-me` and `grill-with-docs` skills, not the internal Pi wrapper skills directly.                                                                                                                                                                                                                                                                                       |
| `/dev:preview-url`                                                                                                                                                                                                            | Mirrored `asdl-dev preview-url` command: prints the Vercel preview URL for a branch. It is exposed through `.pi/extensions/asdl-dev.ts`, not the Pi-only `code.ts` extension.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/sdl:changes`                                                                                                                                                                                                                | Mirrored `sdl changes` command: presents the current pending worktree snapshot without staging, committing, stashing, or switching branches. Legacy `/code:changes` is not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/sdl:cp`                                                                                                                                                                                                                     | Mirrored `sdl cp` command: creates a checkpoint commit for the current diff with model-authored message generation. Legacy `/code:cp`, `/dev:cp`, and `/cp` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/code:autobranch`                                                                                                                                                                                                            | Autobranch command: creates a Graphite branch from current uncommitted changes, or when the worktree is clean extracts the latest unpushed single-parent commit into a new Graphite branch while preserving its SHA. It refuses trunk, pushed latest commits, root/merge commits, and ambiguous dirty-plus-unpublished states. Legacy `/newbr` is removed by the `/code:*` migration.                                                                                                                                                                                                                                                                       |
| `/sdl:submit`                                                                                                                                                                                                                 | Mirrored `sdl submit` command: submits or updates the current Graphite stack with gateway-backed Graphite submit behavior and Pi-provided confirmations when available. Legacy `/dev:submit` and `/submit` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/code:push`                                                                                                                                                                                                                  | Git push convenience command: requires a clean worktree, runs `git push`, and renders bounded output. It is not a replacement for `/sdl:submit`; use it only for already-committed branch pushes where Graphite submission/PR metadata updates are not desired.                                                                                                                                                                                                                                                                                                                                                                                             |
| `/code:land`                                                                                                                                                                                                                  | Unified landing surface backed by package tests: requires Graphite stack proof, fast-path squash merges an isolated single PR into `gt trunk`, and stack-mode lands bottom-to-current while preserving descendant maintenance. Legacy `/land`, `/gh:land`, `/land-stack`, and `/gt:land-stack` aliases are not registered. Codex/Claude should use equivalent `gt`/`gh` CLI flows rather than a Pi slash command.                                                                                                                                                                                                                                           |
| Branch context workflow (`/enriched-plan:save`, `/enriched-plan:grill-and-save`, `/branch-context:from-plan`, `/branch-context:upstack-impl-session`, `/branch-context:impl`)                                                 | Final public Pi planning-layer command sequence. Portable core: the `@asdl/plans` package and `enriched-plan` bin for Saved plan authoring/inspection/resolution, the `@asdl/branch-context` package and `branch-context` bin for branch workflow, local store `~/.asdl/enriched-plan/...`, and Branch Memory namespace `branch-context` with named Markdown attached-plan keys (`plan.md` remains legacy readable storage). Installed agent skills use `/skill:enriched-plan-save`, `/skill:branch-context-from-plan`, and `/skill:branch-context-impl` over the same CLI contract; the grilled interaction itself is Pi-only structured UI orchestration. |
| Handoff artifact workflow (`/handoff:create`, `/handoff:pickup`, `/handoff:list`)                                                                                                                                             | Final project-local Pi handoff lifecycle surface. Users create, pick up, list, and review directed handoff artifacts without Branch Memory vocabulary; pickup presents a summary before further action. Storage details are technical locators only. The standalone TypeScript `handoff` CLI exposes `handoff delete`; no Pi delete command yet. No old `brmem` aliases are retained. Focused tab launch is `/ccc:handoff-tab`, not part of the artifact lifecycle namespace.                                                                                                                                                                               |
| Branch retrospectives (`/skill:branch-retro`, `aretro exec collect-evidence`)                                                                                                                                                 | Intentionally skill/CLI-centered and retained. The user-facing capability remains a branch/session retrospective, so the skill stays `branch-retro`; `aretro exec collect-evidence` is the deterministic evidence-collection boundary used by the skill, not a replacement Pi command name. Codex/Claude use the same installed skill surface.                                                                                                                                                                                                                                                                                                              |
| CCC workspace/sidebar/session command suite (`/ccc:handoff-tab`, `/ccc:sidebar:pr-summary`, `/ccc:sidebar:objective-summary`, `/ccc:workspace:dispatch-plan`, `/ccc:workspace:open-branch`, `/ccc:workspace:dispatch-prompt`) | Promoted to `.pi/extensions/ccc.ts` plus engineered CCC-backed adapters. Manual sidebar commands remain available; workspace-opening commands do not auto-queue sidebar updates pending CCC/cmux targeting rearchitecture. `/ccc:handoff-tab` creates a handoff via the portable handoff workflow, then opens a focused cmux tab; old cmux-prefixed compatibility aliases and old `/handoff-tab` are not current project commands.                                                                                                                                                                                                                          |
| Remaining user-local `gh-pr`, `stack-latest`, and skills                                                                                                                                                                      | Personal-resource findings only; do not promote or mutate unless explicitly requested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Exposing Pi commands through `asdl-dev`

Durable headless developer commands should live in a native CLI first, then be mirrored into Pi under the domain namespace chosen by the project: currently `/dev:preview-url` for preview URL lookup, `/sdl:changes` for pending-worktree inspection, `/sdl:cp` for checkpoint creation, and `/sdl:submit` for the source-control submit workflow.

See [Exposing Pi Commands Through `asdl-dev`](./exposing-pi-commands-through-asdl-dev.md).

## CCC workspace/sidebar pattern

Manual CCC sidebar commands should target the caller cmux workspace for sidebar updates, keep cmux mutations behind deterministic `asdl exec` commands, and avoid relying on stale local cmux source checkouts. Workspace-opening commands currently do not auto-run sidebar updates. The project command suite lives behind `.pi/extensions/ccc.ts` and `ts/packages/ccc/src/cmux/`; `.pi/extensions/worktree-status.ts` remains the project-local adapter for the automatic worktree-status renderer backed by `@asdl/pi-extensions`, which delegates operational facts and presentation to `@asdl/ccc/worktree-status`.

See [CCC Workspace/Sidebar Pattern for Pi](./cmux-extension-pattern.md) and [Querying cmux Help](../cmux/help-querying.md).

## Branch context workflow

The branch-context workflow uses `/enriched-plan:save`, `/enriched-plan:grill-and-save`, `/branch-context:from-plan`, `/branch-context:upstack-impl-session`, and `/branch-context:impl` in Pi, plus the `enriched-plan-save`, `branch-context-from-plan`, and `branch-context-impl` skills for other agents, to save reviewed plans, create implementation branches, attach their branch context under a named Markdown Branch Memory key, and load it for implementation. Saved-plan TypeScript APIs live in `@asdl/plans`; `@asdl/branch-context` owns branch creation, Branch Memory attachment, and implementation loading. The static `/enriched-plan:save` prompt body is repo-editable at `.asdl/prompts/plans-write.md` and resolved with `asdl exec resolve-prompt plans-write --format json`; `/enriched-plan:grill-and-save` is Pi-only structured UI orchestration over the same Saved plan artifact. `/branch-context:upstack-impl-session` is the Pi-only convenience flow for Graphite-stacked branch creation on the current branch by default, exact `git checkout <branch>`, starting a fresh Pi session, implementation kickoff, and narrow re-run reuse of an existing branch with branch context when the Local plan store is missing.

See [Branch Context Workflow](./branch-context-workflow.md).

## Handoff artifacts

A handoff is a directed, durable work-context artifact for a specific future continuation. Use create, pick up, list, and continuation-focus language in normal user-facing copy; pickup presents a summary and waits for the user's next instruction. Branch Memory is the current technical storage layer, not the public model. The project-local Pi handoff lifecycle surface remains `/handoff:create`, `/handoff:pickup`, and `/handoff:list`; focused cmux pickup launch is `/ccc:handoff-tab`. Explicit single-handoff deletion is currently available through the standalone TypeScript CLI as `handoff delete [--branch <branch>] [-f|--force] <slug>`.

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

## Core subagent proposal records

- [Pi Core Subagent MVP Objective](../../.asdl/objective-archive/pi-core-subagent-mvp/objective.md): archived design record for the proposed Pi core foreground runner subagent primitive and terminal capture semantics.
- [Pi Core Subagent MVP Roadmap](../../.asdl/objective-archive/pi-core-subagent-mvp/roadmap.md): archived review-slice plan for the primitive.

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
