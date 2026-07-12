# Pi in This Repo

Repo-specific notes for using and extending Pi in `ns`.

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

Paths:

```text
ts/packages/hosts/pi/
ts/packages/capabilities/<capability>/src/pi/
ts/packages/internal/pi-tools/src/<tool>/
```

The engineered layer is for durable behavior that benefits from tests, fake adapters, shared modules, or package-level validation. Project-local discovery adapters can stay in `.pi/extensions/` while the implementation lives in `@nseng-ai/pi`, a capability `pi` subpackage such as `@nseng-ai/flow/pi`, or a private Internal Pi-tool package.

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

| Area/file                                                      | Current layer                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pi/extensions/objective.ts`                                  | Project-local adapter over engineered behavior      | Loaded by Pi from `.pi/extensions/`; delegates namespaced `/ns:objective:*` command wrappers to package code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `.pi/extensions/code.ts`                                       | Project-local adapter over engineered behavior      | Delegates to `@nseng-ai/flow/pi/code-extension` for `/code:gt-restack-resolve` and `/gt:squash-stack`. Review feedback commands live elsewhere.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.pi/extensions/ns.ts`                                         | Project-local adapter over engineered behavior      | Delegates to `@nseng-ai/flow/pi/ns-extension` for grouped `/ns:flow:*` lifecycle mirrors over the `ns flow` CLI family: changes, cp, autobranch, branch-latest-commit, autoslot, submit, regenerate-pr, push, land, and pull-trunk.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.pi/extensions/handoff.ts`                                    | Project-local adapter over engineered behavior      | Adds `/ns:handoff:create`, `/ns:handoff:pickup`, and `/ns:handoff:list` for directed handoff artifacts, including a custom list renderer; also registers `/ns:cmux:handoff-tab` when tool support is available.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.pi/extensions/branch-context.ts`                             | Project-local adapter over engineered behavior      | Adds `/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, and `/ns:branch-context:impl-attached-plan`; this repo defaults `/ns:branch-context:from-plan` to Graphite, while `upstack-impl-from-plan` is Graphite by built-in default.                                                                                                                                                                                                                                                                                                                                       |
| `.pi/extensions/agents.ts`                                     | Project-local adapter over engineered behavior      | Registers the single `subagent` tool with `explorer` and `task` agent types plus the `/ns:agents:fleet` navigator through `@internal/ns-pi-subagents/extension`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.pi/extensions/grill-ui.ts`                                   | Project-local adapter over Internal Pi-tool package | Adds `/pi:grill-me`, `/pi:grill-with-docs`, and the `grill_ask` structured question tool for Pi grill sessions through `@internal/pi-tools/grill`, plus the side-quest workflow: the first-class **Start a side quest** menu row prompts for a topic, marks the spot, and pauses the interview. `sq: <topic>` remains available in the freeform answer path, and `/pi:grill-sidequest <topic>` starts one while idle. Return happens via a session-tree jump to the ⚑ mark or `/pi:grill-return` with a Fold in / Note / Discard summary disposition, and a below-editor status widget shows pending question, answered count, and quest state. |
| `.pi/extensions/backing-skill-commands.ts`                     | Project-local adapter over Internal Pi-tool package | Registers generated command-backed skill commands through `@internal/pi-tools/backing-skill-commands`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `.pi/extensions/worktree-status.ts`                            | Project-local adapter over engineered behavior      | Worktree/session status display backed by package code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `.pi/extensions/cmux.ts`                                       | Project-local adapter over engineered behavior      | Registers `/ns:cmux:sidebar:session-summary`, `/ns:cmux:sidebar:branch-state-summary`, `/ns:cmux:sidebar:objective-summary`, `/ns:cmux:workspace:dispatch-plan`, `/ns:cmux:surface:dispatch-plan`, `/ns:cmux:workspace:open-branch`, and `/ns:cmux:workspace:dispatch-prompt` through the private cmux capability command suite.                                                                                                                                                                                                                                                                                                                |
| `.pi/extensions/home-directory-guard.ts`                       | Vibecoded implementation                            | Tool-call guard that blocks model-visible tool calls targeting the home directory root itself (`/Users/schrockn`, `~`, `$HOME`, `${HOME}`) while allowing explicit subfolders; use `/reload` after changes under `.pi/extensions/`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.pi/extensions/ripgrep-defaults.ts` and `.pi/ripgrep.conf`    | Project-local adapter over engineered behavior      | Sets process-scoped generated-file exclusions for ripgrep during the Pi session lifecycle through `ts/packages/hosts/pi/src/kit/search/ripgrep-defaults.ts`; task subagents inherit or share the environment, shutdown restores the prior value, and `rg --no-config` bypasses the defaults.                                                                                                                                                                                                                                                                                                                                                    |
| `.pi/extensions/just-fix.ts`                                   | Vibecoded implementation                            | Useful repo-local workflow; not yet promoted or package-tested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.pi/extensions/objective-autorun.ts`                          | Vibecoded implementation                            | Registers only the `objective_runner_step` tool (mechanically wraps one runner step: runner-begin → implementation subagent with live widget → runner-finish, returning the Runner Checkpoint). The canonical `/ns:objective:autorun` command lives in `ts/packages/capabilities/objectives/src/pi/extension.ts`. Tool promotion path stated in-file; not yet package-tested.                                                                                                                                                                                                                                                                   |
| `ts/packages/hosts/pi/CONTEXT.md`                              | Engineered context                                  | Domain language for this package and its project-local discovery adapters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ts/packages/capabilities/objectives/src/pi/extension.ts`      | Engineered implementation                           | Package-tested Objective extension behavior, including the unified `/ns:objective:next` front door and canonical `/ns:objective:autorun` command.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ts/packages/hosts/pi/src/grill/extension.ts` and `grill-ui/*` | Engineered implementation                           | Structured grill UI commands/tool over the internal `pi-grill-ui` and `pi-grill-with-docs-ui` skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ts/packages/capabilities/flow/src/pi/ns-extension.ts`         | Engineered implementation                           | Mirrors native ns flow commands into Pi as `/ns:flow:*` commands and intentionally does not register flat `/ns:*` or `/ns:code:*` lifecycle aliases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ts/packages/hosts/pi/src/commands/cli-extension.ts`           | Engineered implementation                           | Shared helper that invokes CLI command tables from Pi slash commands and displays captured stdout/stderr.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ts/packages/capabilities/flow/src/pi/code-extension.ts`       | Engineered implementation                           | Aggregates Flow/Code workflow Pi presentation for `/code:gt-restack-resolve` and `/gt:squash-stack` in `@nseng-ai/flow/pi`; `@nseng-ai/pi` does not import the extracted package.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ts/packages/internal/pi-tools/src/pr-previews/extension.ts`   | Internal Pi-tool package                            | Registers read-only `/pr:preview-feedback` and `/pr:preview-checks` modal previews; download/editor-prefill and feedback watch behavior remain in `@nseng-ai/pi`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

| `ts/packages/capabilities/flow/src/land/stack/*` | Engineered implementation | Internal Graphite stack landing engine used by `/ns:flow:land`; internals remain split under `land-stack/`. |
| `ts/packages/capabilities/handoffs/src/pi/extension.ts` | Engineered implementation | Package-tested `/ns:handoff:create`, `/ns:handoff:pickup`, and `/ns:handoff:list` presentation adapters over the portable `ns handoff ...` command face and Handoff Capability API. |
| `ts/packages/capabilities/branch-context/src/pi/extension.ts` | Engineered implementation | Branch-context Pi command/tool wiring over the `@nseng-ai/branch-context` package. |
| `ts/packages/capabilities/flow/src/autobranch/*` and `checkpoint/*` | Engineered implementation | Autobranch workflow engine over pending-worktree, preparation, latest-commit extraction, and transaction helpers; the public surface is `ns flow autobranch` / `/ns:flow:autobranch`. |
| `ns flow submit` | ns project-local extension command | SDK-only project-local Graphite submit command mirrored into Pi as `/ns:flow:submit`; no flat or legacy submit aliases are retained. |
| `ts/packages/internal/ns-pi-subagents/src/runner-subagents/extension-api.ts` and submodules | Internal Pi-tool package | Runner-subagent subprocess, JSON-event parsing, generated runtime extension, terminal capture, and final-text results. |
| `ts/packages/capabilities/cmux/src/pi/extension.ts` and `core/*` | Engineered implementation | Private cmux capability command suite, manual caller-workspace sidebar controller, slot helpers, and workspace-opening commands that operate cmux workspaces. |
| `ts/packages/hosts/pi/src/terminal/presentation.ts` | Engineered implementation | Shared terminal hyperlink/linkification and custom-message text helpers. |

### Repository-local ripgrep defaults

The primary motivation is preventing context-destroying recursive searches: a single match in a source map can be one enormous line, causing Pi's bash tool to return roughly its full 50 KB output allowance and consume thousands of model-context tokens even when the useful result is only one ordinary source line. Result-count limits such as `head -n 200` do not protect against that case by themselves.

While this repository's Pi extension runtime is active, the ripgrep-defaults adapter sets `RIPGREP_CONFIG_PATH` to the current worktree's checked-in `.pi/ripgrep.conf`. The engineered lifecycle implementation preserves any prior value and restores it on `session_shutdown`, including reload or session replacement. Subprocess task agents inherit the parent Pi process environment, and in-process task agents share it, so no subagent-runtime customization is required.

The config excludes only source maps, minified JavaScript, and minified CSS by default. Use `rg --no-config` for an intentionally narrow generated-artifact search. This is repository-local Pi lifecycle behavior—not global shell or dotfile configuration, ordinary terminal behavior, or a generic command-output/context guard.

## Resource surface policy

Pi's visible slash-command inventory for this repo is the RPC `get_commands` result. When auditing the visible surface, capture each command's `name`, `description`, `source`, and `sourceInfo` or `path` instead of inferring ownership from command names.

Repo-owned project surface:

- `.pi/extensions/...` project-local extension commands.
- `.pi/prompts/*.md` project prompt templates, when a lightweight Pi-only text expansion is the intended public surface.
- `skills/<name>/SKILL.md`, exposed through symlinks under `.agents/skills/<name>` for local ns skills.

External or personal surface:

- Real directories under `.agents/skills/<name>/` are vendored or GitHub-sourced skills. They are not repo products. Keep them as-shipped and exclude them from deep audits unless a task explicitly updates that vendored skill. Runtime policy: invocation-kind overlays for vendored skills are managed by `areg skill apply`; remove or disable them only through explicit skill-management work.
- User-local resources under `~/.pi/agent/...` may appear in a developer's Pi RPC inventory. Treat `gh-pr`, `stack-latest`, and similar local workflow commands as advisory personal-resource findings, not closure-critical repo cleanup. The cmux capability workspace/sidebar command suite is now project-local for this repo.

Rules:

- Repo-owned first-party product/orchestration Pi extension command families should use `/ns:<extension>:<action...>` names when introduced or renamed, such as `/ns:objective:list`, `/ns:objective:next`, or `/ns:cmux:workspace:dispatch-plan`. Reserve `/skill:<name>` for Pi's skill-command namespace, and keep `/pi:*` for Pi-native UI/session affordances.
- Repo-owned Pi slash commands must show immediate acknowledgement that the command was received, before waiting for Pi idle state or doing slow I/O. Engineered commands should use `registerCommandWithImmediateAck` from `@nseng-ai/pi/commands/ack` at each command registration site. Default acknowledgement delivery is `none`: commands should not add a generic footer line unless they explicitly need one, because most command paths already provide their own live or durable progress surface. Use `{ delivery: "status" }` only for commands that genuinely need a footer acknowledgement; it starts as `received; starting…` and then settles to `received; started` so stale pending text does not linger. Use `{ delivery: "message" }` only for commands that genuinely need a persistent above-fold transcript breadcrumb.
- `ctx.ui.setStatus(...)` is footer/status UI and must not implicitly emit transcript progress. Use `sendCommandProgressOrNotify({ host, ctx, message, delivery, level, shouldNotifyWhenNoUi })` only at explicit transcript-progress milestones. See [Pi extension command checklist](extension-command-checklist.md) before adding or changing repo-owned Pi commands.
- Existing short top-level extension commands may remain when they are deliberately standalone or awaiting explicit disposition. Do not add legacy aliases only for autocomplete convenience; visible aliases increase surface area.
- Avoid duplicate public slash-command names. If a wrapper and prompt share a name, choose one public entrypoint and make the other an internal asset, rename it, convert it to a skill, or document the intentional duplication.
- Mutating commands that touch git or GitHub state need either engineered tests/adapters or explicit docs saying why the vibecoded command is retained and what safety checks it owns.
- Command descriptions should distinguish adjacent commands in autocomplete. If two command names intentionally share behavior, say which one is the alias or focused entrypoint.
- For command-backed skills, use `areg skill apply command-backed <skill>` after the replacement command exists; do not hand-edit `description: "Command: <skill-name>"` stubs or invocation-kind artifacts.

### Command namespace conventions

Use command namespaces to communicate workflow ownership, not implementation file location:

- `/pi:*` — Pi-native UI or session affordances whose portable counterpart is a skill or ordinary harness behavior. Current examples: `/pi:grill-me` and `/pi:grill-with-docs`.
- `/ns:cmux:*` — command-and-control orchestration, especially cmux/session/workspace flows. Current examples: `/ns:cmux:handoff-tab`, `/ns:cmux:sidebar:*`, and `/ns:cmux:workspace:*`.
- `/code:*` — review/watch or code-management workflows intentionally outside the ns code-lifecycle family. Current project-owned use is `/code:pr-feedback-watch`, which is being retargeted to download-feedback-only behavior; migrated code-lifecycle workflows should not keep `/code:*` compatibility aliases.
- `/ns:handoff:*` — durable Handoff artifact lifecycle: create, pick up, and list. Session launchers built on handoffs belong in the orchestration namespace, not the artifact lifecycle namespace.
- `/ns:objective:*` — domain-owned Objective workflows.
- `/ns:plan:*` and `/ns:branch-context:*` — current Pi branch-context planning-layer workflows. The portable CLIs remain `enriched-plan` for Saved plan authoring/inspection/resolution and `branch-context` for branch workflow operations.

Recent rename decisions:

- `/grill-ui` → `/pi:grill-me` because the command is a Pi-native structured UI over the public `grill-me` skill.
- `/grill-with-docs-ui` → `/pi:grill-with-docs` for the same reason, over the public `grill-with-docs` skill.
- `/handoff-tab` → `/ns:cmux:handoff-tab` because the command is focused cmux/session orchestration over the portable handoff artifact contract.

Do not register compatibility aliases for these old names unless an explicit migration requirement outweighs the surface-area cost.

### Parity metadata scope

The `@nseng-ai/pi` typed parity gate tracks package-owned Pi **command** registrations. Pi model-visible tools are host-native bridges and do not require standalone parity metadata rows. If a command depends on a tool, put the fallback and parity rationale on the command row. Examples of tool bridges that are intentionally not rows: `grill_ask`, `subagent`, `write_saved_plan_file`, `derive_handoff_slug_from_content`, and `handoff_tab_launch`.

## Skill/extension router pattern

Rare internal workflow skills can be consolidated behind one terse router skill, with full playbooks lazy-loaded from `references/` and optional Pi selector commands for deterministic route choice without starting an LM turn.

See [Skill/Extension Router Pattern](../patterns/skill-extension-router-pattern.md).

## Current cleanup ordering and dispositions

The resource-surface cleanup proceeds in small slices:

1. Metadata/docs first: record policy, normalize low-risk descriptions, and make aliases legible. Completed.
2. Resolve the duplicate Objective stack implementation surface by using a namespaced Pi wrapper plus a portable skill. Completed; the surface later consolidated into `/ns:objective:autorun` plus `objective-autorun` when the pre-runner `objective-stack-impl` skill was retired into the runner-backed loop (2026-07-05).
3. Resolve the single-PR and stack landing surfaces without legacy top-level aliases; landing is now exposed as `/ns:flow:land` without old landing aliases. Completed.
4. Re-run Pi RPC command inventory after material changes and record the final surface as closure evidence. Completed for the landing, `/code:*`, and handoff slices.
5. Remove manual worktree status slash commands while preserving automatic status-line refresh. Completed.
6. Consolidate the local codebase/source-control commands into grouped ns flow surfaces without legacy aliases. Fresh RPC inventory should report `/code:pr-feedback-watch` as the remaining non-ns review watch surface and `/ns:flow:changes`, `/ns:flow:cp`, `/ns:flow:autobranch`, `/ns:flow:branch-latest-commit`, `/ns:flow:autoslot`, `/ns:flow:submit`, `/ns:flow:regenerate-pr`, `/ns:flow:push`, `/ns:flow:land`, and `/ns:flow:pull-trunk` as the ns lifecycle mirrors, with no legacy `/code:*`, flat lifecycle `/ns:*`, or `/ns:code:*` aliases.
7. Categorize the remaining repo-owned workflow families. Completed; branch-context planning now uses the `/ns:plan:*` and `/ns:branch-context:*` Pi command families plus public installed agent skills, handoff artifacts use final `/ns:handoff:*` plus `/ns:handoff:list` command names and `handoff-*` skills, and branch retrospective remains intentionally skill/CLI-centered around `/skill:branch-retro` plus `ns retro exec collect-evidence`.

| Surface                                                                                                                                                                                                                                                                                                                                           | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<name>` local symlinked skills                                                                                                                                                                                                                                                                                                            | Repo-owned; metadata cleanup is allowed. Command skills should use the explicit `Command: <skill-name>` description marker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Real-directory skills under `.agents/skills/<name>/`                                                                                                                                                                                                                                                                                              | External/vendored runtime skills; remain live by default, excluded from deep review, and edited only by explicit request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `worktree-status`, `brmem-status`, and `gt-status`                                                                                                                                                                                                                                                                                                | Pruned as public Pi commands; worktree status remains automatic through extension lifecycle refresh hooks and footer status updates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/ns:objective:autorun` plus `/skill:objective-autorun`                                                                                                                                                                                                                                                                                           | Objective stack implementation surface: Pi uses the namespaced picker wrapper; Codex/Claude use the portable skill. Replaced `/ns:objective:stack-impl` plus `objective-stack-impl` when that pre-runner skill was retired into the runner-backed autorun loop; no public prompt-template duplicate remains.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/ns:objective:next` plus `/skill:objective-next`                                                                                                                                                                                                                                                                                                 | Unified Objective advancement front door: recommends next work, steers planning, offers an execution preview when explicit Runner Policy / Definition of Progress prose allows it, or executes a concrete current-session recommendation when the user gives a clear affirmative confirmation. The removed proto runner surface is not retained as a separate Pi command or skill.                                                                                                                                                                                                                                                                                                                                                 |
| `/pi:grill-me`, `/pi:grill-with-docs`, plus `grill_ask`                                                                                                                                                                                                                                                                                           | Pi-only structured grill UI surface: `/pi:grill-me` invokes internal `pi-grill-ui` for plain grilling, `/pi:grill-with-docs` invokes internal `pi-grill-with-docs-ui` for docs-aware grilling, and both share the `grill_ask` tool. Portable direct routes are the installed `/skill:grill-me` and `/skill:grill-with-docs` skills in Pi and other skill-aware harnesses; no `/grill:*` compatibility wrapper is registered.                                                                                                                                                                                                                                                                                                       |
| `/ns:flow:changes`                                                                                                                                                                                                                                                                                                                                | Primary mirrored `ns flow changes` command: presents the current pending worktree snapshot without staging, committing, stashing, or switching branches. Legacy `/ns:changes`, `/ns:code:changes`, and `/code:changes` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/ns:flow:cp`                                                                                                                                                                                                                                                                                                                                     | Primary mirrored `ns flow cp` command: creates a checkpoint commit for the current diff with model-authored message generation. Legacy `/ns:cp`, `/code:cp`, `/code:checkpoint`, `/dev:cp`, and `/cp` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/ns:flow:branch-latest-commit`                                                                                                                                                                                                                                                                                                                   | Focused `ns flow branch-latest-commit` mirror: requires a clean worktree and moves the latest eligible unpushed single-parent commit to a new local Graphite child branch using the extension-local recovery transaction. Use it instead of manual `git reset HEAD^` plus `gt create` when the goal is to split the latest commit. It refuses dirty worktrees with guidance to use `ns flow autobranch`, and it does not push, publish, submit, or update PRs.                                                                                                                                                                                                                                                                     |
| `/ns:flow:autobranch`                                                                                                                                                                                                                                                                                                                             | Primary mirrored `ns flow autobranch` command from the project-local SDK-only ns extension: creates a Graphite branch from current uncommitted changes, then creates a checkpoint commit on that branch. It refuses clean worktrees with guidance to use `ns flow branch-latest-commit`. Legacy `/ns:autobranch`, `/ns:code:autobranch`, `/code:autobranch`, and `/newbr` are not registered.                                                                                                                                                                                                                                                                                                                                      |
| `/ns:flow:submit`                                                                                                                                                                                                                                                                                                                                 | Primary mirrored `ns flow submit` command: checkpoints pending work, preflights/restacks/submits the current Graphite stack, verifies the submitted PR, and updates managed PR descriptions. Legacy `/ns:submit`, `/ns:code:submit`, `/dev:submit`, and `/submit` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/ns:flow:regenerate-pr`                                                                                                                                                                                                                                                                                                                          | Primary mirrored `ns flow regenerate-pr` command: regenerates the current branch PR title and ns-managed generated description region, preserves human body text outside that region, and asks before `gh pr edit`. Legacy `/ns:regenerate-pr`, `/ns:code:regenerate-pr`, `/code:pr-regen`, and `/ns:pr-regen` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                         |
| `/ns:flow:autoslot`                                                                                                                                                                                                                                                                                                                               | Autoslot command: creates a Graphite branch from current work, then moves it into a managed slot worktree when the post-branch worktree is clean. Legacy `/ns:code:autoslot` and `/code:autoslot` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/ns:flow:push`                                                                                                                                                                                                                                                                                                                                   | Primary mirrored `ns flow push` command: requires a clean worktree, runs plain `git push`, and renders generic ns CLI output. It does not update Graphite metadata and is not a replacement for `/ns:flow:submit`; do not use it on Graphite-tracked PR branches or anywhere Graphite submission/PR metadata updates are desired. Legacy `/ns:push`, `/ns:code:push`, and `/code:push` aliases are not registered.                                                                                                                                                                                                                                                                                                                 |
| `/ns:flow:land`                                                                                                                                                                                                                                                                                                                                   | Unified landing surface backed by package tests: requires Graphite stack proof, fast-path squash merges an isolated single PR into `gt trunk`, and stack-mode lands bottom-to-current while preserving descendant maintenance. Legacy `/code:land`, `/land`, `/gh:land`, `/land-stack`, and `/gt:land-stack` aliases are not registered. Codex/Claude should use equivalent `gt`/`gh` CLI flows rather than a Pi slash command.                                                                                                                                                                                                                                                                                                    |
| Branch context workflow (`/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, `/ns:branch-context:impl-attached-plan`)                                                                                                                                                        | Final public Pi planning-layer command sequence. Portable core: the `@nseng-ai/plans` package and `enriched-plan` bin for Saved plan authoring/inspection/resolution, the `@nseng-ai/branch-context` package and `ns branch-context exec` command surface for branch workflow, XDG local store `$XDG_STATE_HOME/ns/enriched-plan/...` (default `$HOME/.local/state/ns/enriched-plan/...`), and Branch Memory namespace `branch-context` with named Markdown attached-plan keys such as `<slug>.md`. Installed agent skills use `/skill:enriched-plan-save`, `/skill:branch-context-from-plan`, and `/skill:branch-context-impl` over the same CLI contract; the grilled interaction itself is Pi-only structured UI orchestration. |
| Handoff artifact workflow (`/ns:handoff:create`, `/ns:handoff:pickup`, `/ns:handoff:list`)                                                                                                                                                                                                                                                        | Final project-local Pi handoff lifecycle surface. Users create, pick up, list, and review directed handoff artifacts without Branch Memory vocabulary; pickup presents a summary before further action. Storage details are technical locators only. The portable command face is `ns handoff ...`; no Pi delete command yet. No old `brmem` aliases are retained. Focused tab launch is `/ns:cmux:handoff-tab`, not part of the artifact lifecycle namespace.                                                                                                                                                                                                                                                                     |
| Branch retrospectives (`/skill:branch-retro`, `ns retro exec collect-evidence`)                                                                                                                                                                                                                                                                   | Intentionally skill/CLI-centered and retained. The user-facing capability remains a branch/session retrospective, so the skill stays `branch-retro`; `ns retro exec collect-evidence` is the deterministic evidence-collection boundary used by the skill, not a Pi slash command. Codex/Claude use the same installed skill surface.                                                                                                                                                                                                                                                                                                                                                                                              |
| cmux capability workspace/sidebar/session command suite (`/ns:cmux:handoff-tab`, `/ns:cmux:sidebar:session-summary`, `/ns:cmux:sidebar:branch-state-summary`, `/ns:cmux:sidebar:objective-summary`, `/ns:cmux:workspace:dispatch-plan`, `/ns:cmux:surface:dispatch-plan`, `/ns:cmux:workspace:open-branch`, `/ns:cmux:workspace:dispatch-prompt`) | Promoted to `.pi/extensions/cmux.ts` plus engineered cmux capability-backed adapters. Manual sidebar commands remain available; workspace-opening commands do not auto-queue sidebar updates pending cmux workspace-targeting rearchitecture. `/ns:cmux:surface:dispatch-plan` launches the dispatch-plan child Pi in a new cmux surface in the caller workspace instead of opening a new workspace. `/ns:cmux:handoff-tab` creates a handoff via the portable handoff workflow, then opens a focused cmux tab; old cmux-prefixed compatibility aliases and old `/handoff-tab` are not current project commands.                                                                                                                   |
| Remaining user-local `gh-pr`, `stack-latest`, and skills                                                                                                                                                                                                                                                                                          | Personal-resource findings only; do not promote or mutate unless explicitly requested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Exposing ns CLI commands through Pi

Durable headless developer commands should live in a native CLI first where practical, then be mirrored into Pi under the domain namespace chosen by the project. ns lifecycle mirrors now use the grouped flow family: `/ns:flow:changes`, `/ns:flow:cp`, `/ns:flow:autobranch`, `/ns:flow:branch-latest-commit`, `/ns:flow:autoslot`, `/ns:flow:submit`, `/ns:flow:regenerate-pr`, `/ns:flow:push`, `/ns:flow:land`, and `/ns:flow:pull-trunk`.

ns extension discovery is currently CLI-only. Pi does not dynamically register arbitrary `/ns:<name>` commands from `.ns/extensions` at runtime; exact Pi mirrors are static engineered adapters over selected ns commands and need package tests/parity metadata when added or renamed. Current Flow mirrors are owned by `@nseng-ai/flow/pi`, whose `.pi/extensions/ns.ts` discovery adapter imports the package through its exports. Treat dynamic Pi mirror discovery as future ns/Pi design work, not an implicit property of project-local ns extensions.

## Cmux workspace/sidebar pattern

Manual cmux sidebar commands should target the caller cmux workspace for sidebar updates, keep cmux mutations behind deterministic `ns cmux exec` commands, and avoid relying on stale local cmux source checkouts. Workspace-opening commands currently do not auto-run sidebar updates. The project command suite lives behind `.pi/extensions/cmux.ts` and `ts/packages/capabilities/cmux/src/core/`; `.pi/extensions/worktree-status.ts` remains the project-local adapter for the automatic worktree-status renderer backed by `@nseng-ai/pi`, which delegates operational facts and presentation to the `hosts/pi` worktree-status modules (`ts/packages/hosts/pi/src/worktree-status/`).

See [Cmux Workspace/Sidebar Pattern for Pi](./cmux-extension-pattern.md) and [Querying cmux Help](../cmux/help-querying.md).

## Branch context workflow

The branch-context workflow uses `/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, and `/ns:branch-context:impl-attached-plan` in Pi, plus the `enriched-plan-save`, `branch-context-from-plan`, and `branch-context-impl` skills for other agents, to save reviewed plans, create implementation branches, attach their branch context under a named Markdown Branch Memory key, and load it for implementation. Saved-plan TypeScript APIs live in `@nseng-ai/plans`; `@nseng-ai/branch-context` owns branch creation, Branch Memory attachment, and implementation loading. The static `/ns:plan:save` prompt body is repo-editable at `.ns/prompts/plans-write.md` and resolved inside the TypeScript Pi extension from the current Git root with built-in fallback; `/ns:plan:grill-and-save` is Pi-only structured UI orchestration over the same Saved plan artifact. `/ns:branch-context:upstack-impl-from-plan` is the Pi-only convenience flow for Graphite-stacked branch creation on the current branch by default, exact `git checkout <branch>`, starting a fresh Pi session, implementation kickoff, and narrow re-run reuse of an existing branch with branch context when the Local plan store is missing.

See [Branch Context Workflow](./branch-context-workflow.md).

## Handoff artifacts

A handoff is a directed, durable work-context artifact for a specific future continuation. Use create, pick up, list, and continuation-focus language in normal user-facing copy; pickup presents a summary and waits for the user's next instruction. Branch Memory is the current technical storage layer, not the public model. The project-local Pi handoff lifecycle surface remains `/ns:handoff:create`, `/ns:handoff:pickup`, and `/ns:handoff:list`; focused cmux pickup launch is `/ns:cmux:handoff-tab`. The portable command face is `ns handoff ...`; explicit single-handoff deletion is currently available as `ns handoff delete [--branch <branch>] [--yes] <slug>`.

See [Handoff Artifacts](./handoff-artifacts.md).

## Extension message linkification

For clickable PR/issue links in custom Pi extension output, keep message content plain, carry URLs in `message.details`, and linkify in the registered renderer.

See [Extension message linkification](./extension-message-linkification.md).

## Runner subagent helper

The local runner subagent helper lets project extensions await a fresh runner subagent and receive either a structured terminal-capture result or final assistant text without slash-command handoff text.

See [Runner Subagent Helper](./runner-subagent-helper.md).

## External case study: how `flue` consumes pi

A contrasting consumption pattern from another project (`withastro/flue`), kept as external reference. flue **embeds** pi as a runtime engine (`pi-agent-core` + `pi-ai`, constructing and driving an `Agent`), whereas ns **extends** pi as a host (`pi-coding-agent` + `pi-tui`, registering extensions). The genuine overlap is pi-ai's model layer and `completeSimple`, which ns's `ns` package also uses. Not a description of anything ns ships.

See [flue pi consumption case study](./flue-pi-consumption-case-study.md).

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

## Autonomous Objectives (autoobjectives)

- [Standing Objectives & Objective Runners](./standing-objectives-and-runners.md): the conceptual design brief — the bounded↔standing / human↔autonomous axes, prior-art loop shapes, and anti-goals for autonomously pursued Objectives.
- [Authoring a Remediation Autoobjective](./authoring-remediation-autoobjectives.md): procedural playbook for turning a large review/audit backlog into one execution-friendly Objective a runner works down slice by slice (sweep → verify → `references/` → cluster roadmap → runner policy + dispositions).
- [Autonomous Objective lessons](../../.ns/objectives/eliminate-redundant-optional-undefined/autonomous-objective-lessons.md): lessons from running the standing (maintain-forever) autoobjective variant.
- **Executing one:** the supported runner is the `/ns:objective:autorun [<slug>] [scope / step budget / standing guidance]` Pi command from the packaged Objective Pi extension (`ts/packages/capabilities/objectives/src/pi/extension.ts`) — without a slug it opens the same active-Objective picker logic as `/ns:objective:next`; with a slug it expands the repo `objective-autorun` skill so the parent session agent owns the loop and every between-step judgment. Each mechanical step (runner-begin → implementation subagent → runner-finish) runs through the `objective_runner_step` tool from `.pi/extensions/objective-autorun.ts` and returns a Runner Checkpoint to judge. The run ends with local stacked branches handed back to the normal Graphite/flow workflow and obeys the canonical forbidden-action wording in `ts/packages/capabilities/objectives/src/runner/prompt.ts` (`OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE`): "Do not push, submit, publish, merge, land, create or update pull requests, or perform any other write-capable external action — no `git push`, `gt submit`, `gh pr create`, `ns flow submit`, or PR mutation may leave the machine from an Objective Runner step; the runner owns staging and the local commit, and the parent owns any later push/submit/handoff decision after separate human authorization."

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
