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
ts/packages/incubating/hosts/pi/runtime/pi-runtime/
ts/packages/incubating/hosts/pi/extensions/pi-ns-<domain>/
ts/packages/incubating/extensions/<extension>/src/pi/  # remaining extraction residue
ts/packages/internal/hosts/pi/tools/pi-tools/src/<tool>/
```

The engineered layer is for durable behavior that benefits from tests, fake adapters, shared modules, or package-level validation. Engineered Pi packages should declare their own `pi.extensions` entry points and be loaded directly through `.pi/settings.json`; a project-local discovery adapter is unnecessary when one package owns the complete integration. Project-local adapters can remain for repo-specific composition across packages or for implementations not yet packaged. Engineered behavior lives in `@nseng-ai/pi-runtime`, a separate host adapter such as `@nseng-ai/pi-ns-branch-context`, `@nseng-ai/pi-ns-flow`, or `@nseng-ai/pi-ns-objectives`, a remaining extension `pi` subpackage while extraction is incomplete, or a private Internal Pi-tool package.

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

| Area/file                                                                                    | Current layer                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nseng-ai/pi-ns-handoffs/claude-extension`                                                  | Engineered package extension                        | Provides interactive Claude Code Handoff launch behavior from the Handoffs Pi host adapter.                                                                                                                                                                                                                                                                                                                                                                                |
| `.pi/extensions/harness-session.ts`                                                          | Project-local adapter over engineered behavior      | Delegates harness-session lifecycle capture to `@nseng-ai/pi-runtime/sessions/harness-session`.                                                                                                                                                                                                                                                                                                                                                                            |
| `.pi/extensions/model-shortcuts.ts`                                                          | Project-local adapter over engineered behavior      | Delegates model shortcut commands to `@nseng-ai/pi-runtime/core/model-shortcuts/extension`.                                                                                                                                                                                                                                                                                                                                                                                |
| `.pi/extensions/code.ts`                                                                     | Project-local host composition adapter              | Composes internal `@internal/pi-tools/code-workflows/smart-restack` for `/code:gt-restack-resolve` with `@nseng-ai/pi-ns-flow/stack-squash` for `/gt:squash-stack`; neither owner imports the other.                                                                                                                                                                                                                                                                       |
| `.pi/extensions/code-workflows.ts`                                                           | Project-local adapter over Internal Pi-tool package | Delegates the `/code-workflows` picker and direct `/gh-ci-debug` route to `@internal/pi-tools/code-workflows/extension`.                                                                                                                                                                                                                                                                                                                                                   |
| `.pi/extensions/context-profiler.ts`                                                         | Project-local adapter over Internal Pi-tool package | Delegates context profiling to `@internal/pi-tools/context-profiler/extension`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `.pi/extensions/slash-command-rerank.ts`                                                     | Project-local adapter over Internal Pi-tool package | Delegates slash-command ranking to `@internal/pi-tools/slash-command-rerank/extension`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `.pi/extensions/stack-view.ts`                                                               | Project-local adapter over Internal Pi-tool package | Delegates the Graphite stack overlay to `@internal/pi-tools/stack-view/extension`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `.pi/extensions/thermo-council.ts`                                                           | Project-local adapter over Internal Pi-tool package | Delegates the Thermo Council workflow to `@internal/pi-tools/thermo-council/extension`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `.pi/extensions/pr.ts`                                                                       | Project-local host composition adapter              | Composes Pi-runtime PR commands, including `/pr:desc` for displaying the current PR title and description, with the internal PR-feedback-watch extension; neither owner imports the other.                                                                                                                                                                                                                                                                                 |
| `@nseng-ai/pi-ns-flow`                                                                       | Engineered package extension                        | Directly discovered from `.pi/settings.json`; registers the eleven grouped `/ns:flow:*` lifecycle mirrors over the `ns flow` CLI family with fresh CLI loading on each invocation. Its separately exported stack-squash adapter is composed only by `.pi/extensions/code.ts`.                                                                                                                                                                                              |
| `@nseng-ai/pi-ns-handoffs`                                                                   | Engineered package extension                        | Adds the Handoff Pi command family for directed Handoff Artifacts, including a custom list renderer.                                                                                                                                                                                                                                                                                                                                                                       |
| `@nseng-ai/pi-ns-branch-context`                                                             | Engineered package extension                        | Adds `/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, and `/ns:branch-context:impl-attached-plan`; its package entrypoint defaults `/ns:branch-context:from-plan` to Graphite.                                                                                                                                                                                                                     |
| `.pi/extensions/agents.ts`                                                                   | Project-local adapter over engineered behavior      | Registers the single `subagent` tool with `explorer` and `task` agent types plus the `/ns:agents:fleet` navigator through `@internal/ns-pi-subagents/extension`.                                                                                                                                                                                                                                                                                                           |
| `.pi/extensions/grill-ui.ts`                                                                 | Project-local adapter over Internal Pi-tool package | Adds `/pi:grill-me`, `/pi:grill-with-docs`, and the `grill_ask` structured question tool through `@internal/pi-tools/grill`, with structured choice, freeform, status, and end-session paths. `grill_ask` is catalog-registered but inactive at each session start; the first explicit structured-grill command (`/pi:grill-me`, `/pi:grill-with-docs`, or `/ns:plan:grill-and-save`) activates it for the remainder of that session.                                      |
| `.pi/extensions/skill-backed-commands.ts`                                                    | Project-local adapter over Internal Pi-tool package | Registers generated Skill-Backed Commands through `@internal/pi-tools/skill-backed-commands`.                                                                                                                                                                                                                                                                                                                                                                              |
| `.pi/extensions/worktree-status.ts`                                                          | Project-local adapter over engineered behavior      | Worktree/session status display backed by package code.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@nseng-ai/pi-ns-herdr`                                                                      | Engineered package extension                        | Directly discovers the twelve-entry Herdr catalog: eleven base space/tab operations plus conditional `/ns:herdr:tab:handoff`, over `@nseng-ai/herdr/api`.                                                                                                                                                                                                                                                                                                                  |
| `.pi/extensions/home-directory-guard.ts`                                                     | Vibecoded implementation                            | Tool-call guard that blocks model-visible tool calls targeting the home directory root itself (`/Users/schrockn`, `~`, `$HOME`, `${HOME}`) while allowing explicit subfolders; use `/reload` after changes under `.pi/extensions/`.                                                                                                                                                                                                                                        |
| `.pi/extensions/ripgrep-defaults.ts` and `.pi/ripgrep.conf`                                  | Project-local adapter over engineered behavior      | Sets process-scoped generated-file exclusions for ripgrep during the Pi session lifecycle through `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/search/ripgrep-defaults.ts`; task subagents inherit or share the environment, shutdown restores the prior value, and `rg --no-config` bypasses the defaults.                                                                                                                                                 |
| `.pi/extensions/just-fix.ts`                                                                 | Vibecoded implementation                            | Useful repo-local workflow; not yet promoted or package-tested.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ts/packages/incubating/hosts/pi/runtime/pi-runtime/CONTEXT.md`                              | Engineered context                                  | Domain language for this package and its project-local discovery adapters.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/`                               | Engineered host-adapter Pi package                  | Feature-branch package-tested Objective Pi behavior loaded directly from `.pi/settings.json` through the package's `pi.extensions` manifest, with no `.pi/extensions/objective.ts` adapter. It includes the unified `/ns:objective:next` front door and canonical `/ns:objective:autorun` command, owns Pi registration/presentation, and consumes only `@nseng-ai/objectives/api`; Objective domain ownership remains in `@nseng-ai/objectives`. Not landed or published. |
| `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/grill/extension.ts` and `grill-ui/*` | Engineered implementation                           | Structured grill UI commands/tool over the internal `pi-grill-ui` and `pi-grill-with-docs-ui` skills.                                                                                                                                                                                                                                                                                                                                                                      |
| `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/extension.ts`                     | Engineered host-adapter implementation              | Mirrors native ns flow commands into Pi as `/ns:flow:*`, owns registration, submit-check recovery presentation, and parity metadata, and intentionally does not register flat `/ns:*` or `/ns:code:*` lifecycle aliases.                                                                                                                                                                                                                                                   |
| `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts`           | Engineered implementation                           | Shared helper that invokes CLI command tables from Pi slash commands and displays captured stdout/stderr.                                                                                                                                                                                                                                                                                                                                                                  |
| `ts/packages/internal/hosts/pi/tools/pi-tools/src/code-workflows/`                           | Internal Pi-tool package                            | Owns the repo-specific `/code-workflows`, `/gh-ci-debug`, and `/code:gt-restack-resolve` implementations, tests, and parity metadata. Generic `/gt:squash-stack` presentation lives in `@nseng-ai/pi-ns-flow`; cross-owner composition occurs only in `.pi/extensions/code.ts`.                                                                                                                                                                                            |

| `ts/packages/incubating/extensions/flow/src/land/stack/*` | Engineered implementation | Internal Graphite stack landing engine used by `/ns:flow:land`; internals remain split under `land-stack/`. |
| `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/extension.ts` | Engineered implementation | Package-tested `/ns:handoff:create`, `/ns:handoff:pickup`, and `/ns:handoff:list` presentation adapters over the portable `ns handoff ...` command face and Handoff extension package API. |
| `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/extension.ts` | Engineered host-adapter implementation | Branch Context and Saved Plan Pi command/tool wiring over `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`. |
| `ts/packages/incubating/extensions/flow/src/autobranch/*` and `checkpoint/*` | Engineered implementation | Autobranch workflow engine over pending-worktree, preparation, latest-commit extraction, and transaction helpers; the public surface is `ns flow autobranch` / `/ns:flow:autobranch`. |
| `ns flow submit` | ns project-local extension command | SDK-only project-local Graphite submit command mirrored into Pi as `/ns:flow:submit`; no flat or legacy submit aliases are retained. |
| `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/runner-subagents/extension-api.ts` and submodules | Internal Pi-tool package | Runner-subagent subprocess, JSON-event parsing, generated runtime extension, terminal capture, and final-text results. |
| `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/` | Engineered host-adapter implementation | Pi registration, interaction, presentation, launch construction, and optional Handoffs adapter composition over focused Herdr domain operations. |
| `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/terminal/presentation.ts` | Engineered implementation | Shared terminal hyperlink/linkification and custom-message text helpers. |

### Repository-local ripgrep defaults

The primary motivation is preventing context-destroying recursive searches: a single match in a source map can be one enormous line, causing Pi's bash tool to return roughly its full 50 KB output allowance and consume thousands of model-context tokens even when the useful result is only one ordinary source line. Result-count limits such as `head -n 200` do not protect against that case by themselves.

While this repository's Pi extension runtime is active, the ripgrep-defaults adapter sets `RIPGREP_CONFIG_PATH` to the current worktree's checked-in `.pi/ripgrep.conf`. The engineered lifecycle implementation preserves any prior value and restores it on `session_shutdown`, including reload or session replacement. Subprocess task agents inherit the parent Pi process environment, and in-process task agents share it, so no subagent-runtime customization is required.

The config excludes only source maps, minified JavaScript, and minified CSS by default. Use `rg --no-config` for an intentionally narrow generated-artifact search. This is repository-local Pi lifecycle behavior—not global shell or dotfile configuration, ordinary terminal behavior, or a generic command-output/context guard.

## Resource surface policy

Pi's visible slash-command inventory for this repo is the RPC `get_commands` result. When auditing the visible surface, capture each command's `name`, `description`, `source`, and `sourceInfo` or `path` instead of inferring ownership from command names.

Repo-owned project surface:

- `.pi/extensions/...` project-local extension commands.
- `.pi/prompts/*.md` project prompt templates, when a lightweight Pi-only text expansion is the intended public surface.
- Nested canonical first-party sources under `skills/<disposition>/<family>/<name>/SKILL.md` (plus approved top-level product exceptions), exposed through the flat `.agents/skills/<name>` overlay.

External or personal surface:

- Real directories under `.agents/skills/<name>/` are vendored or GitHub-sourced skills. They are not repo products. Keep them as-shipped and exclude them from deep audits unless a task explicitly updates that vendored skill. Deliberate repository-owned invocation metadata for vendored skills is maintained and reviewed directly; change it only through explicit invocation-policy work.
- User-local resources under `~/.pi/agent/...` may appear in a developer's Pi RPC inventory. Treat `gh-pr`, `stack-latest`, and similar local workflow commands as advisory personal-resource findings, not closure-critical repo cleanup.

Rules:

- Repo-owned first-party product/orchestration Pi extension command families should use `/ns:<extension>:<action...>` names when introduced or renamed, such as `/ns:objective:list`, `/ns:objective:next`, or `/ns:herdr:impl:plan:space`. Reserve `/skill:<name>` for Pi's skill-command namespace, and keep `/pi:*` for Pi-native UI/session affordances.
- Repo-owned Pi slash commands must acknowledge receipt synchronously before waiting for Pi idle state or doing slow I/O. Engineered commands should use `registerCommandWithImmediateAck` from `@nseng-ai/pi-runtime/commands/ack` at each registration site and must choose an explicit delivery. The helper implementation default remains `none`, but repository policy normally requires `options: { delivery: "message" }` for a durable above-fold transcript acknowledgement. Use `{ delivery: "status" }` only when transcript output is inappropriate and the registration states why; do not omit delivery and rely on the helper default.
- `ctx.ui.setStatus(...)` is footer/status UI and must not implicitly emit transcript progress. Use `sendCommandProgressOrNotify({ host, ctx, message, delivery, level, shouldNotifyWhenNoUi })` only at explicit transcript-progress milestones. See [Pi extension command checklist](extension-command-checklist.md) before adding or changing repo-owned Pi commands.
- Existing short top-level extension commands may remain when they are deliberately standalone or awaiting explicit disposition. Do not add legacy aliases only for autocomplete convenience; visible aliases increase surface area.
- Avoid duplicate public slash-command names. If a wrapper and prompt share a name, choose one public entrypoint and make the other an internal asset, rename it, convert it to a skill, or document the intentional duplication.
- Mutating commands that touch git or GitHub state need either engineered tests/adapters or explicit docs saying why the vibecoded command is retained and what safety checks it owns.
- Command descriptions should distinguish adjacent commands in autocomplete. If two command names intentionally share behavior, say which one is the alias or focused entrypoint.
- For a skill whose preferred surface is a Skill-Backed Command, retain the Skill-Backed Command mechanism and registration. After registration exists, maintain the skill's invoke-only frontmatter, Codex sidecar, and `.pi/settings.json` exclusion directly as reviewed repository files. The command mechanism may exist independently, while invocation metadata controls cross-harness exposure. `npx skills` does not create the Pi exclusion or all of this metadata.

### Command namespace conventions

Use command namespaces to communicate workflow ownership, not implementation file location:

- `/pi:*` — Pi-native UI or session affordances whose portable counterpart is a skill or ordinary harness behavior. Current examples: `/pi:grill-me` and `/pi:grill-with-docs`.
- `/ns:herdr:space:*` and `/ns:herdr:tab:*` — direct Herdr resource operations. Implementation uses `/ns:herdr:impl:prompt:{space,tab}`, `/ns:herdr:impl:session:{space,tab}`, and `/ns:herdr:impl:plan:{space,tab}`; each selects current branch or existing local trunk contextually without fetching or refreshing trunk, then implements a prompt, the current session, or a Saved Plan with the existing agent instructions and workflow behavior. Handoff launch remains the optional `/ns:herdr:tab:handoff` integration.
- `/code:*` — review/watch or code-management workflows intentionally outside the ns code-lifecycle family. Current project-owned use is `/code:pr-feedback-watch`, which is being retargeted to download-feedback-only behavior; migrated code-lifecycle workflows should not keep `/code:*` compatibility aliases.
- `/ns:handoff:*` — durable Handoff Artifact lifecycle: create, pick up, and list. `/ns:herdr:tab:handoff` composes that lifecycle with a Herdr tab destination; it does not move artifact ownership into Herdr.
- `/ns:objective:*` — domain-owned Objective workflows.
- `/ns:plan:*` and `/ns:branch-context:*` — current Pi branch-context planning-layer workflows. The portable CLIs remain `enriched-plan` for Saved plan authoring/inspection/resolution and `branch-context` for branch workflow operations.

Recent rename decisions:

- `/grill-ui` → `/pi:grill-me` because the command is a Pi-native structured UI over the public `grill-me` skill.
- `/grill-with-docs-ui` → `/pi:grill-with-docs` for the same reason, over the public `grill-with-docs` skill.
- The former cmux Handoff launcher is replaced by `/ns:herdr:tab:handoff`, a resource-first Herdr command over the portable Handoff Artifact contract.

Do not register compatibility aliases for these old names unless an explicit migration requirement outweighs the surface-area cost.

### Parity metadata scope

The `@nseng-ai/pi-runtime` typed parity gate tracks package-owned Pi **command** registrations. Pi model-visible tools are host-native bridges and do not require standalone parity metadata rows. If a command depends on a tool, put the fallback and parity rationale on the command row. Examples of tool bridges that are intentionally not rows: `grill_ask`, `subagent`, `write_saved_plan_file`, `derive_handoff_slug_from_content`, and `handoff_tab_launch`.

## Skill/extension router pattern

Rare internal workflow skills can be consolidated behind one terse router skill, with full playbooks lazy-loaded from `references/` and optional Pi selector commands for deterministic route choice without starting an LM turn.

See [Skill/Extension Router Pattern](../patterns/skill-extension-router-pattern.md).

## Current cleanup ordering and dispositions

The resource-surface cleanup proceeds in small slices:

1. Metadata/docs first: record policy, normalize low-risk descriptions, and make aliases legible. Completed.
2. Resolve the duplicate Objective stack implementation surface by using a namespaced Pi wrapper plus a portable skill. Completed; the surface consolidated into `/ns:objective:autorun` plus `objective-autorun` when the pre-runner `objective-stack-impl` skill was retired (2026-07-05). Autorun now supports portable Git and optional ns-bookended execution without a project-local autorun tool.
3. Resolve the single-PR and stack landing surfaces without legacy top-level aliases; landing is now exposed as `/ns:flow:land` without old landing aliases. Completed.
4. Re-run Pi RPC command inventory after material changes and record the final surface as closure evidence. Completed for the landing, `/code:*`, and handoff slices.
5. Remove manual worktree status slash commands while preserving automatic status-line refresh. Completed.
6. Consolidate the local codebase/source-control commands into grouped ns flow surfaces without legacy aliases. Fresh RPC inventory should report `/code:pr-feedback-watch` as the remaining non-ns review watch surface and `/ns:flow:changes`, `/ns:flow:cp`, `/ns:flow:autobranch`, `/ns:flow:branch-latest-commit`, `/ns:flow:autoslot`, `/ns:flow:submit`, `/ns:flow:generate-pr-inventory`, `/ns:flow:push`, `/ns:flow:land`, `/ns:flow:pull-trunk`, and `/ns:flow:squash-stack` as the ns lifecycle mirrors, with no legacy `/code:*`, flat lifecycle `/ns:*`, or `/ns:code:*` aliases.
7. Categorize the remaining repo-owned workflow families. Completed; branch-context planning now uses the `/ns:plan:*` and `/ns:branch-context:*` Pi command families plus public installed agent skills, and handoff artifacts use final `/ns:handoff:*` plus `/ns:handoff:list` command names and `handoff-*` skills.

| Surface                                                                                                                                                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nested `skills/<disposition>/<family>/<name>` canonical sources with flat `.agents/skills/<name>` overlays                                                                                 | Repo-owned; metadata cleanup is allowed. Command skills should use the explicit `Command: <skill-name>` description marker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Real-directory skills under `.agents/skills/<name>/`                                                                                                                                       | External/vendored runtime skills; remain live by default, excluded from deep review, and edited only by explicit request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `worktree-status`, `brmem-status`, and `gt-status`                                                                                                                                         | Pruned as public Pi commands; worktree status remains automatic through extension lifecycle refresh hooks and footer status updates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/ns:objective:autorun` plus `/skill:objective-autorun`                                                                                                                                    | Repeated Objective implementation surface. The self-contained skill supports two explicitly different trust modes: optional `ns-bookended` execution uses the strict ADR 0024 begin/finish protocol and produces runner-attested Runner Checkpoints; `portable` execution needs no ns CLI once the skill and Objective Markdown are present, keeps the run on one non-trunk feature branch, and creates one parent-verified ordinary commit per accepted slice. The Pi command is only an optional Objective picker and prompt injector over that skill. ADR 0037 Runner Checkpoint publication is unavailable in portable mode. This replaced `/ns:objective:stack-impl` plus `objective-stack-impl`; no public prompt-template duplicate remains.                                                                    |
| `/ns:objective:next` plus `/skill:objective-next`                                                                                                                                          | Unified Objective advancement front door: recommends next work, steers planning, offers an execution preview when explicit Runner Policy / Definition of Progress prose allows it, or executes a concrete current-session recommendation when the user gives a clear affirmative confirmation. In Pi, an ordinary packet with exactly one proposed prompt adds a host-native choice to execute the exact prompt as a same-session follow-up, replace the full input area, or dismiss; co-equal prompts, `Declined` packets, and noninteractive/missing-capability runs remain usable recommendation text with no automatic action. This chooser is Pi presentation, not portable Objective semantics or a separate parity surface. The removed proto runner surface is not retained as a separate Pi command or skill. |
| `/pi:grill-me`, `/pi:grill-with-docs`, plus `grill_ask`                                                                                                                                    | Pi-only structured grill UI surface: `/pi:grill-me` invokes internal `pi-grill-ui` for plain grilling, `/pi:grill-with-docs` invokes internal `pi-grill-with-docs-ui` for docs-aware grilling, and both share the `grill_ask` tool. `grill_ask` is registered but inactive until one of these commands (or `/ns:plan:grill-and-save`) runs, then stays active for the rest of the session; its behavioral contract lives in the self-contained kickoff skills/prompts, not in global tool prompt metadata. Portable direct routes are the installed `/skill:grill-me` and `/skill:grill-with-docs` skills in Pi and other skill-aware harnesses; no `/grill:*` compatibility wrapper is registered.                                                                                                                    |
| `/ns:flow:changes`                                                                                                                                                                         | Primary mirrored `ns flow changes` command: presents the current pending worktree snapshot without staging, committing, stashing, or switching branches. Legacy `/ns:changes`, `/ns:code:changes`, and `/code:changes` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/ns:flow:cp`                                                                                                                                                                              | Primary mirrored `ns flow cp` command: creates a checkpoint commit for the current diff with model-authored message generation. Legacy `/ns:cp`, `/code:cp`, `/code:checkpoint`, `/dev:cp`, and `/cp` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/ns:flow:branch-latest-commit`                                                                                                                                                            | Focused `ns flow branch-latest-commit` mirror: requires a clean worktree; eligible latest single-parent commit relationships are no upstream, local-ahead, and synchronized non-trunk. Remote-ahead, diverged, and synchronized trunk relationships refuse. It uses local tracking refs without fetching. A local-only split does not push, publish, submit, or update PRs; after synchronized success, run `ns flow submit` from the new child.                                                                                                                                                                                                                                                                                                                                                                       |
| `/ns:flow:autobranch`                                                                                                                                                                      | Primary mirrored `ns flow autobranch` command from the project-local SDK-only ns extension: creates a Graphite branch from current uncommitted changes, then creates a checkpoint commit on that branch. It refuses clean worktrees with guidance to use `ns flow branch-latest-commit`. Legacy `/ns:autobranch`, `/ns:code:autobranch`, `/code:autobranch`, and `/newbr` are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/ns:flow:submit`                                                                                                                                                                          | Primary mirrored `ns flow submit` command: checkpoints pending work, preflights/restacks/submits the current Graphite stack, and by default adds Assembled PR inventories only to newly created PRs. `--generate-pr-inventory` widens replacement to every reconciled PR only after early confirmation; Flow prepares all replacements before sequential destructive title/body edits. Legacy `/ns:submit`, `/ns:code:submit`, `/dev:submit`, and `/submit` aliases are not registered.                                                                                                                                                                                                                                                                                                                                |
| `/ns:flow:generate-pr-inventory`                                                                                                                                                           | Primary mirror of `ns flow generate-pr-inventory`: confirms, then completely replaces the current branch PR title and body with an Assembled PR inventory. The best-effort inventory uses diff and commit headlines without author steering, interview, or approval; a short italicized note identifies it as automatically generated, and a footer records evidence, command, prompt source, and exact model. It is not authored/co-authored rationale. No `regenerate-pr` compatibility alias is registered.                                                                                                                                                                                                                                                                                                         |
| `/ns:flow:autoslot`                                                                                                                                                                        | Autoslot command: creates a Graphite branch from current work, then moves it into a managed slot worktree when the post-branch worktree is clean. Legacy `/ns:code:autoslot` and `/code:autoslot` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/ns:flow:push`                                                                                                                                                                            | Primary mirrored `ns flow push` command: requires a clean worktree, runs plain `git push`, and renders generic ns CLI output. It does not update Graphite metadata and is not a replacement for `/ns:flow:submit`; do not use it on Graphite-tracked PR branches or anywhere Graphite submission/PR metadata updates are desired. Legacy `/ns:push`, `/ns:code:push`, and `/code:push` aliases are not registered.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/ns:flow:land`                                                                                                                                                                            | Unified landing surface backed by package tests: requires Graphite stack proof, single-branch fast path squash-merges a PR into `gt trunk`, and stack-mode lands bottom-to-current while preserving descendant maintenance. Legacy `/code:land`, `/land`, `/gh:land`, `/land-stack`, and `/gt:land-stack` aliases are not registered. Codex/Claude should use equivalent `gt`/`gh` CLI flows rather than a Pi slash command.                                                                                                                                                                                                                                                                                                                                                                                           |
| Branch context workflow (`/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, `/ns:branch-context:impl-attached-plan`) | Final public Pi planning-layer command sequence. Portable core: the `@nseng-ai/plans` package and `enriched-plan` bin for Saved Plan inspection/resolution, the `@nseng-ai/branch-context` package and `ns branch-context exec` command surface for branch workflow, XDG local store `$XDG_STATE_HOME/ns/enriched-plan/...` (default `$HOME/.local/state/ns/enriched-plan/...`), and Branch Memory namespace `branch-context` with named Markdown attached-plan keys such as `<slug>.md`. Installed agent skills use `/skill:branch-context-from-plan` and `/skill:branch-context-impl` for the portable branch workflow; Saved Plan authoring is Pi-only, and the grilled interaction is Pi-only structured UI orchestration.                                                                                         |
| Handoff Artifact workflow (`/ns:handoff:create`, `/ns:handoff:pickup`, `/ns:handoff:list`)                                                                                                 | Final project-local Pi Handoff lifecycle surface. Users create, pick up, list, and review directed Handoff Artifacts without Branch Memory vocabulary; pickup presents a summary before further action. Storage details are technical locators only. The portable command face is `ns handoff ...`; no Pi delete command yet. No old `brmem` aliases are retained. `/ns:herdr:tab:handoff` is an optional Herdr destination integration, not another artifact-lifecycle command.                                                                                                                                                                                                                                                                                                                                       |
| Branch retrospectives (`/skill:branch-retro`, `ns retro exec collect-evidence`)                                                                                                            | Intentionally skill/CLI-centered and retained. The user-facing capability remains a branch/session retrospective, so the skill stays `branch-retro`; `ns retro exec collect-evidence` is the deterministic evidence-collection boundary used by the skill, not a Pi slash command. Codex/Claude use the same installed skill surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Herdr resource and implementation suite (`/ns:herdr:space:*`, `/ns:herdr:tab:*`, `/ns:herdr:impl:*`)                                                                                       | Engineered Herdr extension adapters expose the twelve-entry catalog: eleven base registrations and optional `/ns:herdr:tab:handoff`. Space and tab identity are explicit; prompt, session, and Saved Plan implementation are symmetric across space and tab destinations; the Handoff command is the only Herdr command that creates a Handoff Artifact. See [`../herdr/command-catalog.md`](../herdr/command-catalog.md) for the exact catalog and migration history.                                                                                                                                                                                                                                                                                                                                                 |
| Remaining user-local `gh-pr`, `stack-latest`, and skills                                                                                                                                   | Personal-resource findings only; do not promote or mutate unless explicitly requested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Exposing ns CLI commands through Pi

Durable headless developer commands should live in a native CLI first where practical, then be mirrored into Pi under the domain namespace chosen by the project. ns lifecycle mirrors now use the grouped flow family: `/ns:flow:changes`, `/ns:flow:cp`, `/ns:flow:autobranch`, `/ns:flow:branch-latest-commit`, `/ns:flow:autoslot`, `/ns:flow:submit`, `/ns:flow:generate-pr-inventory`, `/ns:flow:push`, `/ns:flow:land`, `/ns:flow:pull-trunk`, and `/ns:flow:squash-stack`.

ns extension discovery is currently CLI-only. Pi does not dynamically register arbitrary `/ns:<name>` commands from `.ns/extensions` at runtime; exact Pi mirrors are static engineered adapters over selected ns commands and need package tests/parity metadata when added or renamed. Current Flow mirrors are owned by `@nseng-ai/pi-ns-flow`, whose lifecycle entrypoint is discovered directly through its `pi.extensions` manifest and `.pi/settings.json`; there is no `.pi/extensions/ns.ts` adapter. Treat dynamic Pi mirror discovery as future ns/Pi design work, not an implicit property of project-local ns extensions.

### Embedded command I/O

Pi owns every in-process structured command invocation. The bridge provides a finite JSON request reader that never falls back to ambient `process.stdin`, invocation-local stdout/stderr capture sinks, and `canEmitAnsi: false` because Pi—not the physical terminal—owns rendering. Pi slash commands currently have no JSON request body, so selecting `--input-json` receives the invocation-owned empty value and fails through normal Clinkr validation instead of waiting on process input.

Confirmation and selection are semantic operations delegated to the current command context's `ctx.ui`; the bridge does not emulate terminal input. Required interaction fails closed when no applicable Pi UI exists. Captured command text is sanitized for terminal escape and control sequences at the Pi presentation seam before it reaches the TUI. Raw commands retain their separate invocation-scoped byte sinks; this bridge does not virtualize a PTY, raw mode, key events, or terminal streams.

## Herdr resources

Herdr direct operations are organized by destination resource: `/ns:herdr:space:*` for spaces and `/ns:herdr:tab:*` for tabs. Prompt, session, and Saved Plan implementation workflows are symmetric across `/ns:herdr:impl:*:{space,tab}`. Each session command privately derives a prompt from a non-interactive fork of the persisted source session, then displays the complete prompt as a TUI-only transcript entry before offering an **Implement on a new branch in an isolated Slot / Load into editor for review/edit / Cancel** approval menu. The action labels do not embed prompt text, and the entry remains absent from the source session's LLM context. Implementing stores and verifies the prompt at retained Branch Memory Entry `ns-impl/prompt.md` on the destination branch; the destination Pi starts prompt-free with only a non-sensitive branch marker, and a Herdr-owned one-shot startup bootstrap loads that Entry directly from Branch Memory and injects it as the destination session's first user prompt. Loading into the editor is the explicit review/editing path; cancel or dismissal stops without implementation mutation. Apart from the TUI-only prompt entry, the source transcript receives compact identifiers, locator/byte evidence, and actionable failures without adding the generated prompt to model context. Retries create collision-resolved branches; payload collisions refuse overwrite. They select current branch or existing local trunk contextually and never update trunk; no branch-basis flags or aliases are registered. `impl` is shorter, avoids collision with remote-system dispatch terminology, and describes implementing a prompt or Saved Plan more accurately than `launch`. The rename preserves existing agent instructions and workflow behavior.

Launch vocabulary remains valid for lower-level mechanics: Prepared Herdr Launch owns destination startup, Pi launch mechanics start the process, and `ns-impl` identifies prompt transport/storage. Handoff launch remains the optional `/ns:herdr:tab:handoff` flow over a durable artifact. User-facing terms are **space**, **tab**, and **caller space**; reserve **workspace** for upstream Herdr mechanics such as workspace IDs. Caller identity is resolved through one typed Herdr gateway caller-pane operation backed by Herdr's caller-aware `pane current --current` query; it returns complete workspace, tab, and pane identity from that single query. Never use environment transport, interchange workspace and tab IDs, or fall back to UI focus.

See [Herdr migration history and current command catalog](../herdr/command-catalog.md).

## Branch context workflow

The branch-context workflow uses `/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, and `/ns:branch-context:impl-attached-plan` in Pi, plus the `branch-context-from-plan` and `branch-context-impl` skills for other agents, to save reviewed plans in Pi, create implementation branches, attach their branch context under a named Markdown Branch Memory key, and load it for implementation. Saved-plan TypeScript APIs live in `@nseng-ai/plans`; `@nseng-ai/branch-context` owns branch creation, Branch Memory attachment, and implementation loading. The static `/ns:plan:save` prompt body is repo-editable at `.ns/prompts/plans-write.md` and resolved inside the TypeScript Pi extension from the current Git root with built-in fallback; `/ns:plan:grill-and-save` is Pi-only structured UI orchestration over the same Saved plan artifact. `/ns:branch-context:upstack-impl-from-plan` is the Pi-only convenience flow for Graphite-stacked branch creation on the current branch by default, exact `git checkout <branch>`, starting a fresh Pi session, implementation kickoff, and narrow re-run reuse of an existing branch with branch context when the Local plan store is missing.

See [Branch Context Workflow](./branch-context-workflow.md).

## Handoff artifacts

A Handoff Artifact is directed, durable work context for a specific future continuation. Use create, pick up, list, and continuation-focus language in normal user-facing copy; pickup presents a summary and waits for the user's next instruction. Branch Memory is the current technical storage layer, not the public model. The project-local Pi lifecycle surface remains `/ns:handoff:create`, `/ns:handoff:pickup`, and `/ns:handoff:list`; the portable command face is `ns handoff ...`, with explicit single-handoff deletion available as `ns handoff delete [--branch <branch>] [--yes] <slug>`. `/ns:herdr:tab:handoff` first uses the Handoff-owned create flow and then launches pickup in a new Herdr tab. Herdr owns the destination, not artifact lifecycle or storage.

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

## Autonomous Objectives (autoobjectives)

- [Standing Objectives & Objective Runners](./standing-objectives-and-runners.md): the conceptual design brief — the bounded↔standing / human↔autonomous axes, prior-art loop shapes, and anti-goals for autonomously pursued Objectives.
- [Authoring a Remediation Autoobjective](./authoring-remediation-autoobjectives.md): procedural playbook for turning a large review/audit backlog into one execution-friendly Objective a runner works down slice by slice (sweep → verify → `references/` → cluster roadmap → runner policy + dispositions).
- [Autonomous Objective lessons](../../.ns/objectives/eliminate-redundant-optional-undefined/autonomous-objective-lessons.md): lessons from running the standing (maintain-forever) autoobjective variant.
- **Advancing one generally:** use `objective-next`, the recommend/steer/confirmed-execution front door for one selected active Objective.
- **Running repeated implementation steps:** invoke the self-contained `objective-autorun` skill directly, or optionally use `/ns:objective:autorun [<slug>] [scope / step budget / standing guidance]` from the packaged Objective Pi extension (`ts/packages/incubating/extensions/objectives/src/pi/extension.ts`) to pick an Objective and inject the same skill. The command owns no execution protocol.
- **Execution modes:** `ns-bookended` uses the stricter, optional ADR 0024 `runner-begin` / harness dispatch / `runner-finish` bookends; accepted work is a runner-attested Runner Checkpoint with runner-owned provenance. `portable` requires only Git, the skill, Objective Markdown, and harness implementation capability—no ns CLI once those inputs are present. It uses one attached non-trunk feature branch for the run, and the parent verifies each accepted slice before creating one ordinary local commit. A portable commit is not a Runner Checkpoint.
- **Publication boundary:** ADR 0037 publication can apply only after a real committed Runner Checkpoint in `ns-bookended` mode and separate authorization. It is unavailable/not applicable in portable mode. Implementation children never push, submit, publish, merge, land, create or update PRs, deploy, or perform other write-capable external actions.

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
