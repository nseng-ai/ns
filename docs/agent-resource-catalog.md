# Agent Resource Catalog

Generated from the repo checkout on 2026-06-03.

This catalog covers repo-defined agent and harness resources with command-level rows where a resource exposes commands or tools.

Vendored, external, and user-local artifacts are intentionally separated at the bottom so first-party repo-owned surfaces stay distinct from live but non-owned developer aids.

## Summary

| Surface                                  | Count | Description                                                                                                            |
| ---------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------- |
| First-party skill commands               |    41 | Repo-owned Agent Skills exposed through `/skill:<name>` in Pi and through installed skill mirrors for other harnesses. |
| Project Pi extension commands            |    22 | Project-local Pi slash commands registered by checked-in files under `.pi/extensions/`.                                |
| Project Pi custom tools                  |     3 | Project-local Pi tools registered by checked-in extensions for agent invocation.                                       |
| Project Pi prompt templates              |     0 | No project prompt templates are currently defined under `.pi/prompts/`.                                                |
| Claude workflow scripts                  |     1 | Claude-only workflow scripts invoked through Claude's `Workflow` tool.                                                 |
| Harness instruction files                |     6 | `AGENTS.md` and `CLAUDE.md` files that define repo or package-level agent instructions.                                |
| Ignored vendored/external skill commands |     8 | Real-directory external skills are listed at the bottom for awareness but excluded from first-party ownership.         |

## Skill modes and catalog categories

The promoted first-party catalog uses flat semantic names instead of an organization prefix. Skill mode is encoded in the `SKILL.md` frontmatter:

- **Explicit invocation skills** use `description: "Command: <skill-name>"` and should only run when the user names the skill/command.
- **Ambient knowledge skills** use ordinary `Use when...` descriptions and may trigger from task matching.
- **Project-creation/scaffolding skills** are explicit-only and are not installed by default in projects initialized with `areg init`.

| Mode     | Category                       | Skills                                                                                             |
| -------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Explicit | Skill tooling                  | `skillx`                                                                                           |
| Explicit | Project creation / scaffolding | `create-bun-typescript-project`, `create-python-dev-cli`, `create-python-package`                  |
| Explicit | Repo setup and release         | `setup-dprint`, `setup-dprint-gh-ci`, `setup-python-gh-ci`, `setup-pypi-publish`, `setup-graphite` |
| Explicit | Maintenance                    | `changelog-update`                                                                                 |
| Ambient  | Skill authoring                | `skill-management`, `skill-audit`, `cli-push-down`                                                 |
| Ambient  | Python standards and testing   | `dignified-python`, `python-fake-driven-testing`, `python-fake-driven-test-layout`, `pytest`       |
| Ambient  | TypeScript standards/testing   | `typescript-style`, `typescript-fake-driven-testing`                                               |
| Ambient  | Workflow operations            | `refactor-swarm`, `code-resolve-merge-conflicts`                                                   |
| Internal | Pi UI                          | `pi-grill-ui`                                                                                      |

Projects initialized with `areg init` install only `skill-management` and `skillx` by default from `dagster-io/asdl-tools`.

## First-party skill commands

| Command                                   | Source                                             | Description                                                                                                         |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/skill:branch-retro`                     | `skills/branch-retro/SKILL.md`                     | Collects deterministic branch/session evidence and turns it into retrospective recommendations.                     |
| `/skill:brmem`                            | `skills/brmem/SKILL.md`                            | Guides use of the `brmem` CLI for branch-scoped durable memory.                                                     |
| `/skill:handoff-save`                     | `skills/handoff-save/SKILL.md`                     | Saves a directed handoff artifact for a specific future continuation.                                               |
| `/skill:handoff-load`                     | `skills/handoff-load/SKILL.md`                     | Picks up, chooses, or lists saved handoff artifacts so another session can resume focused work.                     |
| `/skill:internal-code-checkpoint`         | `skills/internal-code-checkpoint/SKILL.md`         | Creates a terse checkpoint commit for the current non-main branch diff.                                             |
| `/skill:internal-code-gh`                 | `skills/internal-code-gh/SKILL.md`                 | Routes GitHub CLI, REST, and GraphQL work to the right command/API references.                                      |
| `/skill:internal-code-gh-ci-debug`        | `skills/internal-code-gh-ci-debug/SKILL.md`        | Diagnoses GitHub Actions failures from a run URL or run ID.                                                         |
| `/skill:code-gt-restack-resolve`          | `skills/code-gt-restack-resolve/SKILL.md`          | Restacks a Graphite stack and resolves mechanically safe conflicts with verification.                               |
| `/skill:internal-code-gt-stackify-branch` | `skills/internal-code-gt-stackify-branch/SKILL.md` | Splits a mixed branch into an ordered Graphite stack while preserving the source branch.                            |
| `/skill:internal-code-just-fix`           | `skills/internal-code-just-fix/SKILL.md`           | Runs `just`, categorizes failures, fixes root causes, and reruns the suite until green or blocked.                  |
| `/skill:internal-code-stacker-agent`      | `skills/internal-code-stacker-agent/SKILL.md`      | Executes a multi-slice implementation plan as a serial local branch stack or commit series.                         |
| `/skill:changelog-update`                 | `skills/changelog-update/SKILL.md`                 | Runs the changelog update command workflow.                                                                         |
| `/skill:create-bun-typescript-project`    | `skills/create-bun-typescript-project/SKILL.md`    | Creates a Bun TypeScript project with strict linting, formatting, and test setup.                                   |
| `/skill:create-python-dev-cli`            | `skills/create-python-dev-cli/SKILL.md`            | Creates a Python developer CLI project.                                                                             |
| `/skill:create-python-package`            | `skills/create-python-package/SKILL.md`            | Creates a Python package project scaffold.                                                                          |
| `/skill:dignified-python`                 | `skills/dignified-python/SKILL.md`                 | Applies modern production Python coding standards and version-specific guidance.                                    |
| `/skill:python-fake-driven-test-layout`   | `skills/python-fake-driven-test-layout/SKILL.md`   | Defines per-package test directory layout for fake-driven Python projects.                                          |
| `/skill:python-fake-driven-testing`       | `skills/python-fake-driven-testing/SKILL.md`       | Guides Python gateway and fake-driven testing architecture.                                                         |
| `/skill:pytest`                           | `skills/pytest/SKILL.md`                           | Provides pytest style guidance for fixtures, helpers, parametrization, and test cleanup.                            |
| `/skill:typescript-fake-driven-testing`   | `skills/typescript-fake-driven-testing/SKILL.md`   | Guides TypeScript gateway and fake-driven testing architecture.                                                     |
| `/skill:typescript-style`                 | `skills/typescript-style/SKILL.md`                 | Guides strict TypeScript style, type design, boundary validation, and review defaults.                              |
| `/skill:cli-push-down`                    | `skills/cli-push-down/SKILL.md`                    | Identifies deterministic prompt work that should move into tested CLI commands.                                     |
| `/skill:refactor-swarm`                   | `skills/refactor-swarm/SKILL.md`                   | Coordinates parallel file-local refactors across many independent files.                                            |
| `/skill:code-resolve-merge-conflicts`     | `skills/code-resolve-merge-conflicts/SKILL.md`     | Resolves merge conflicts from an in-progress rebase.                                                                |
| `/skill:setup-dprint`                     | `skills/setup-dprint/SKILL.md`                     | Sets up dprint formatting.                                                                                          |
| `/skill:setup-dprint-gh-ci`               | `skills/setup-dprint-gh-ci/SKILL.md`               | Adds GitHub Actions CI for dprint checks.                                                                           |
| `/skill:setup-pypi-publish`               | `skills/setup-pypi-publish/SKILL.md`               | Sets up PyPI publishing.                                                                                            |
| `/skill:setup-python-gh-ci`               | `skills/setup-python-gh-ci/SKILL.md`               | Sets up Python GitHub Actions CI.                                                                                   |
| `/skill:setup-graphite`                   | `skills/setup-graphite/SKILL.md`                   | Configures a repo to use Graphite (`gt`).                                                                           |
| `/skill:skill-audit`                      | `skills/skill-audit/SKILL.md`                      | Audits and improves skills for trigger quality, concision, progressive disclosure, and CLI push-down opportunities. |
| `/skill:skill-management`                 | `skills/skill-management/SKILL.md`                 | Manages skills with `npx skills` across local and installed skill surfaces.                                         |
| `/skill:skillx`                           | `skills/skillx/SKILL.md`                           | Runs a GitHub-hosted skill transiently with `areg exec skillx`.                                                     |
| `/skill:objective`                        | `skills/objective/SKILL.md`                        | Provides read-only shared vocabulary and rules for asdl Objectives.                                                 |
| `/skill:objective-close`                  | `skills/objective-close/SKILL.md`                  | Closes one Objective by adding closure narrative and a `closed.md` marker.                                          |
| `/skill:objective-create`                 | `skills/objective-create/SKILL.md`                 | Creates a new Objective record under `.asdl/objectives/<slug>/`.                                                    |
| `/skill:objective-current`                | `skills/objective-current/SKILL.md`                | Reads and summarizes the current state of one Objective without mutation.                                           |
| `/skill:objective-next`                   | `skills/objective-next/SKILL.md`                   | Recommends, steers planning, or offers confirmed execution when Objective policy allows it.                         |
| `/skill:objective-stack-impl`             | `skills/objective-stack-impl/SKILL.md`             | Orchestrates implementing one Objective as a small Graphite stack from the current session.                         |
| `/skill:objective-update`                 | `skills/objective-update/SKILL.md`                 | Updates durable tracking for exactly one selected Objective using landed-state semantics.                           |
| `/skill:pi-grill-ui`                      | `skills/pi-grill-ui/SKILL.md`                      | Internal backend skill for the Pi `/grill-ui` structured-question extension.                                        |
| `/skill:pr-address`                       | `skills/pr-address/SKILL.md`                       | Addresses current-branch PR review feedback end-to-end without pushing.                                             |

## Skill installation surfaces

| Artifact                             | Description                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `.agents/skills/<first-party-skill>` | Symlink installation surface for every first-party skill in `skills/<name>/`.                       |
| `.claude/skills/<skill>`             | Claude Code skill mirror that symlinks each project-visible skill through `.agents/skills/<skill>`. |

## Project Pi extension commands

| Command                  | Source                             | Description                                                                                         |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/handoff:create`        | `.pi/extensions/handoff.ts`        | Create a directed handoff artifact for a future continuation.                                       |
| `/handoff:pickup`        | `.pi/extensions/handoff.ts`        | Pick up a saved handoff by slug, selector, or picker.                                               |
| `/handoff:list`          | `.pi/extensions/handoff.ts`        | List saved handoffs on this branch or across all branches with a card-style renderer.               |
| `/code:changes`          | `.pi/extensions/code.ts`           | Summarizes outstanding worktree changes without committing.                                         |
| `/code:cp`               | `.pi/extensions/code.ts`           | Mirrors `asdl-dev cp` to create a checkpoint commit for the current diff.                           |
| `/code:submit`           | `.pi/extensions/code.ts`           | Mirrors `asdl-dev submit` to submit or update the current Graphite stack with headless guards.      |
| `/code:autobranch`       | `.pi/extensions/code.ts`           | Creates a Graphite branch from current uncommitted changes, generating branch and commit messages.  |
| `/code:land`             | `.pi/extensions/code.ts`           | Squash-merges the current branch's GitHub PR into `master` with guarded package-tested behavior.    |
| `/code:land-stack`       | `.pi/extensions/code.ts`           | Lands the current Graphite stack path bottom-to-current through the Pi-only stack landing workflow. |
| `/dev:preview-url`       | `.pi/extensions/asdl-dev.ts`       | Prints the Vercel preview URL for a branch.                                                         |
| `/grill-ui`              | `.pi/extensions/grill-ui.ts`       | Starts a grill-me session using the structured `grill_ask` question UI.                             |
| `/just`                  | `.pi/extensions/just-fix.ts`       | Runs `just` and injects the `internal-code-just-fix` workflow prompt when the suite fails.          |
| `/roast`                 | `.pi/extensions/roast.ts`          | Runs matching roaster reviewers for the current branch diff through the local `roaster` CLI.        |
| `/objective:list`        | `.pi/extensions/objective.ts`      | Lists active Objectives without invoking the agent.                                                 |
| `/objective:gt-stacks`   | `.pi/extensions/objective.ts`      | Shows Objective work across Graphite-tracked branches without invoking the agent.                   |
| `/objective:next`        | `.pi/extensions/objective.ts`      | Picks an active Objective and invokes `objective-next` to recommend, steer, or preview execution.   |
| `/objective:current`     | `.pi/extensions/objective.ts`      | Picks an Objective and invokes `objective-current` for the selected slug.                           |
| `/objective:update`      | `.pi/extensions/objective.ts`      | Picks an active Objective and invokes `objective-update` for the selected slug.                     |
| `/objective:stack-impl`  | `.pi/extensions/objective.ts`      | Picks an active Objective and invokes the portable Objective stack implementation skill.            |
| `/write-plan`            | `.pi/extensions/planned-branch.ts` | Starts a reviewed implementation-plan authoring flow and saves the approved plan.                   |
| `/create-planned-branch` | `.pi/extensions/planned-branch.ts` | Creates a planned branch from a saved plan and attaches the plan in Branch Memory.                  |
| `/impl-planned-branch`   | `.pi/extensions/planned-branch.ts` | Loads the current branch's attached plan and injects an implementation prompt.                      |

## Project Pi custom tools

| Tool                            | Source                                       | Description                                                                                      |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `dispatch_runner_subagent`      | `.pi/extensions/dispatch-runner-subagent.ts` | Launches a focused Pi runner subagent in the current cwd and returns final-text/status evidence. |
| `grill_ask`                     | `.pi/extensions/grill-ui.ts`                 | Asks one grill-me question through structured choices, freeform input, or an end-session path.   |
| `write_source_branch_plan_file` | `.pi/extensions/planned-branch.ts`           | Writes a reviewed Markdown implementation plan into the local source-branch plan store.          |

## Repo-owned workflow family dispositions

| Family                | Disposition                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planned branches      | Retain `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` as the Pi planning-layer sequence; storage contracts are documented for inspection/recovery by other harnesses, but no Codex/Claude shortcut is claimed.                  |
| Handoff artifacts     | Final first-party surface: `/handoff:create`, `/handoff:pickup`, `/handoff:list`, `/skill:handoff-save`, and `/skill:handoff-load`. List output uses grouped cards with copyable pickup commands. No old `brmem`-named handoff aliases are retained. |
| Branch retrospectives | Retain `/skill:branch-retro` as the human-facing retrospective workflow; `aretro exec collect-evidence` remains the deterministic evidence-collection command behind the skill rather than a replacement public name.                                |
| Structured grill UI   | Retain `/grill-ui`, `grill_ask`, and internal `/skill:pi-grill-ui` as a Pi-specific structured UI layer. Portable non-Pi grilling routes remain the installed `grill-me` and `grill-with-docs` skills.                                               |
| Objective execution   | General Objective execution is folded into `objective-next` behind explicit Runner Policy and preview confirmation. `objective-stack-impl` remains the specialized stack implementation runner.                                                      |

## Engineered Pi extension package

| Artifact                                 | Description                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ts/packages/pi-extensions/package.json` | Defines the private TypeScript workspace package that holds tested implementations for project-local Pi behavior.                       |
| `ts/packages/pi-extensions/CONTEXT.md`   | Defines the package's domain language for discovery adapters, engineered behavior, planned branches, checkpoints, and runner subagents. |
| `ts/packages/pi-extensions/src/`         | Contains the tested implementation modules used by the thin `.pi/extensions/*.ts` discovery adapters.                                   |
| `ts/packages/pi-extensions/test/`        | Contains Bun tests for the engineered Pi extension package and its promoted workflows.                                                  |

## Claude workflow artifacts

| Artifact                                       | Description                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/workflows/refactor-swarm-workflow.js` | Runs a detached Claude workflow for executing disjoint file-local refactor slices and returning a structured verification report. |

## Harness instruction files

| Artifact                       | Description                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                    | Defines repo-wide agent rules for skills, package imports, formatting, GitHub usage, Graphite workflow, and CLI testing. |
| `CLAUDE.md`                    | Defines Claude-facing project context, status, tech stack, and development principles for the asdl repo.                 |
| `packages/asdl-core/AGENTS.md` | Defines asdl-core labs/incubator layering and import rules.                                                              |
| `packages/asdl-core/CLAUDE.md` | Points Claude agents at the package-level asdl-core `AGENTS.md` rules.                                                   |
| `packages/brmem/AGENTS.md`     | Defines Branch Memory package boundaries, allowed imports, and self-contained testing rules.                             |
| `packages/brmem/CLAUDE.md`     | Points Claude agents at the package-level brmem `AGENTS.md` rules.                                                       |

## Pi settings, prompt templates, and package hooks

| Artifact            | Description                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `.pi/settings.json` | Defines project-local Pi settings and currently declares no additional Pi packages.                              |
| `.pi/prompts/`      | Is absent, so the repo currently defines no project-local Pi prompt templates.                                   |
| `.pi/skills/`       | Is absent, so repo-local skills are exposed through `.agents/skills/` rather than Pi-specific skill directories. |
| `ts/package.json`   | Defines the TypeScript workspace scripts used to check and test the Pi extension package.                        |

## Harness-facing documentation and specs

| Artifact                                                | Description                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docs/pi/README.md`                                     | Documents repo-specific Pi extension layers, resource-surface policy, current dispositions, and reload/worktree guidance. |
| `docs/pi/exposing-pi-commands-through-asdl-dev.md`      | Guides promotion of headless Pi workflows into `asdl-dev` CLI commands mirrored as `/dev:*` Pi commands.                  |
| `docs/pi/extension-message-linkification.md`            | Describes how Pi extension custom messages should carry and render clickable links.                                       |
| `docs/pi/handoff-artifacts.md`                          | Defines the directed handoff artifact vocabulary and distinguishes handoffs from compaction and generic summaries.        |
| `docs/pi/objective-stack-subagent-rewrite-brief.md`     | Preserves the historical Objective stack subagent rewrite design with current staleness notes.                            |
| `docs/pi/planned-branch-workflow.md`                    | Documents the planned-branch flow from saved plans to implementation branches and Branch Memory attachments.              |
| `docs/pi/runner-subagent-helper.md`                     | Documents the repo-local runner subagent helper, return modes, statuses, and parent integration rules.                    |
| `docs/pi/session-cwd-semantics.md`                      | Explains Pi session-bound working-directory semantics and cross-worktree patterns.                                        |
| `docs/specs/objective-gt-stacks.md`                     | Specifies `objective gt stacks` and the companion `/objective:gt-stacks` Pi display command.                              |
| `docs/internal-code-gh-skill-trim-plan.md`              | Historical plan for trimming the GitHub CLI skill; current skill name is `internal-code-gh`.                              |
| `docs/objective-stack-prompt-smoke-test/README.md`      | Documents historical smoke-test setup for the Objective stack prompt workflow.                                            |
| `docs/objective-stack-prompt-smoke-test/walkthrough.md` | Provides the historical Objective stack prompt smoke-test walkthrough.                                                    |

## Absent first-party surfaces

| Surface        | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `.codex/`      | No Codex-specific checked-in resource directory exists in this checkout. |
| `.pi/prompts/` | No project-local Pi prompt template directory exists in this checkout.   |
| `.pi/skills/`  | No Pi-specific project skill directory exists in this checkout.          |

## Ignored vendored or external artifacts

These artifacts are live in some harnesses but are not first-party asdl-owned resources for this catalog's main sections.

### Checked-in vendored or external skill commands

| Command                                     | Source                                                       | Description                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `/skill:fdt-refactor-mock-to-fake`          | `.agents/skills/fdt-refactor-mock-to-fake/SKILL.md`          | Refactors Python tests from `unittest.mock` or `MagicMock` patterns to gateway-based fakes.                    |
| `/skill:graphite`                           | `.agents/skills/graphite/SKILL.md`                           | Guides Graphite stacked-PR creation, navigation, submission, and stack management.                             |
| `/skill:grill-me`                           | `.agents/skills/grill-me/SKILL.md`                           | Interviews the user to stress-test a plan until key design branches are resolved.                              |
| `/skill:grill-with-docs`                    | `.agents/skills/grill-with-docs/SKILL.md`                    | Stress-tests a plan against project language and documentation while updating docs as decisions crystallize.   |
| `/skill:handoff`                            | `.agents/skills/handoff/SKILL.md`                            | Compacts the current conversation into a handoff document for another agent.                                   |
| `/skill:improve-codebase-architecture`      | `.agents/skills/improve-codebase-architecture/SKILL.md`      | Finds architecture-deepening opportunities using project domain language and ADRs.                             |
| `/skill:skill-creator`                      | `.agents/skills/skill-creator/SKILL.md`                      | Provides tooling and evaluation assets for creating, packaging, and improving Agent Skills.                    |
| `/skill:thermo-nuclear-code-quality-review` | `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` | Runs an extremely strict maintainability review focused on abstraction quality and spaghetti-condition growth. |

### External runtime surfaces not defined by this repo

| Surface                                                                  | Description                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| User-local Pi extensions under `~/.pi/agent/extensions/`                 | User-local Pi commands may appear in RPC inventory but are personal runtime resources outside this repo. |
| User-local Pi skills under `~/.pi/agent/skills/` and `~/.agents/skills/` | User-local skills may appear in a developer's available-skill list but are not repo-defined artifacts.   |
