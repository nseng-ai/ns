# Agent Resource Catalog

Generated from the repo checkout on 2026-05-31.

This catalog covers repo-defined agent and harness resources with command-level rows where a resource exposes commands or tools.

Vendored, external, and user-local artifacts are intentionally separated at the bottom so first-party repo-owned surfaces stay distinct from live but non-owned developer aids.

## Summary

| Surface                                  | Count | Description                                                                                                            |
| ---------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------- |
| First-party skill commands               |    19 | Repo-owned Agent Skills exposed through `/skill:<name>` in Pi and through installed skill mirrors for other harnesses. |
| Project Pi extension commands            |    18 | Project-local Pi slash commands registered by checked-in files under `.pi/extensions/`.                                |
| Project Pi custom tools                  |     2 | Project-local Pi tools registered by checked-in extensions for agent invocation.                                       |
| Project Pi prompt templates              |     0 | No project prompt templates are currently defined under `.pi/prompts/`.                                                |
| Claude workflow scripts                  |     1 | Claude-only workflow scripts invoked through Claude's `Workflow` tool.                                                 |
| Harness instruction files                |     6 | `AGENTS.md` and `CLAUDE.md` files that define repo or package-level agent instructions.                                |
| Ignored vendored/external skill commands |    24 | Real-directory external skills are listed at the bottom for awareness but excluded from first-party ownership.         |

## First-party skill commands

| Command                         | Source                                   | Description                                                                                        |
| ------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/skill:branch-retro`           | `skills/branch-retro/SKILL.md`           | Collects deterministic branch/session evidence and turns it into retrospective recommendations.    |
| `/skill:brmem`                  | `skills/brmem/SKILL.md`                  | Guides use of the `brmem` CLI for branch-scoped durable memory.                                    |
| `/skill:handoff-save`           | `skills/handoff-save/SKILL.md`           | Saves a directed handoff artifact for a specific future continuation.                              |
| `/skill:handoff-load`           | `skills/handoff-load/SKILL.md`           | Picks up, chooses, or lists saved handoff artifacts so another session can resume focused work.    |
| `/skill:dev-checkpoint`         | `skills/dev-checkpoint/SKILL.md`         | Creates a terse checkpoint commit for the current non-main branch diff.                            |
| `/skill:dev-gh`                 | `skills/dev-gh/SKILL.md`                 | Routes GitHub CLI, REST, and GraphQL work to the right command/API references.                     |
| `/skill:dev-gh-ci-debug`        | `skills/dev-gh-ci-debug/SKILL.md`        | Diagnoses GitHub Actions failures from a run URL or run ID.                                        |
| `/skill:dev-gt-restack-resolve` | `skills/dev-gt-restack-resolve/SKILL.md` | Restacks a Graphite stack and resolves mechanically safe conflicts with verification.              |
| `/skill:dev-gt-stackify-branch` | `skills/dev-gt-stackify-branch/SKILL.md` | Splits a mixed branch into an ordered Graphite stack while preserving the source branch.           |
| `/skill:dev-just-fix`           | `skills/dev-just-fix/SKILL.md`           | Runs `just`, categorizes failures, fixes root causes, and reruns the suite until green or blocked. |
| `/skill:dev-stacker-agent`      | `skills/dev-stacker-agent/SKILL.md`      | Executes a multi-slice implementation plan as a serial local branch stack or commit series.        |
| `/skill:objective`              | `skills/objective/SKILL.md`              | Provides read-only shared vocabulary and rules for asdl Objectives.                                |
| `/skill:objective-close`        | `skills/objective-close/SKILL.md`        | Closes one Objective by adding closure narrative and a `closed.md` marker.                         |
| `/skill:objective-create`       | `skills/objective-create/SKILL.md`       | Creates a new Objective record under `.asdl/objectives/<slug>/`.                                   |
| `/skill:objective-current`      | `skills/objective-current/SKILL.md`      | Reads and summarizes the current state of one Objective without mutation.                          |
| `/skill:objective-next`         | `skills/objective-next/SKILL.md`         | Recommends the next useful work for one active Objective after checking for stale tracking.        |
| `/skill:objective-stack-impl`   | `skills/objective-stack-impl/SKILL.md`   | Orchestrates implementing one Objective as a small Graphite stack from the current session.        |
| `/skill:objective-update`       | `skills/objective-update/SKILL.md`       | Updates durable tracking for exactly one selected Objective using landed-state semantics.          |
| `/skill:pr-address`             | `skills/pr-address/SKILL.md`             | Addresses current-branch PR review feedback end-to-end without pushing.                            |

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
| `/handoff:list`          | `.pi/extensions/handoff.ts`        | List saved handoffs on this branch or across all branches.                                          |
| `/dev:cp`                | `.pi/extensions/dev.ts`            | Creates a checkpoint commit for the current diff.                                                   |
| `/dev:autobranch`        | `.pi/extensions/dev.ts`            | Creates a Graphite branch from current uncommitted changes, generating branch and commit messages.  |
| `/dev:submit`            | `.pi/extensions/dev.ts`            | Submits or updates the current Graphite stack with the repo's guarded submit workflow.              |
| `/dev:land`              | `.pi/extensions/dev.ts`            | Squash-merges the current branch's GitHub PR into `master` with guarded package-tested behavior.    |
| `/dev:land-stack`        | `.pi/extensions/dev.ts`            | Lands the current Graphite stack path bottom-to-current through the Pi-only stack landing workflow. |
| `/just`                  | `.pi/extensions/just-fix.ts`       | Runs `just` and injects the `dev-just-fix` workflow prompt when the suite fails.                    |
| `/objective:list`        | `.pi/extensions/objective.ts`      | Lists active Objectives without invoking the agent.                                                 |
| `/objective:gt-stacks`   | `.pi/extensions/objective.ts`      | Shows Objective work across Graphite-tracked branches without invoking the agent.                   |
| `/objective:next`        | `.pi/extensions/objective.ts`      | Picks an active Objective and invokes `objective-next` for the selected slug.                       |
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
| `write_source_branch_plan_file` | `.pi/extensions/planned-branch.ts`           | Writes a reviewed Markdown implementation plan into the local source-branch plan store.          |

## Repo-owned workflow family dispositions

| Family                | Disposition                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planned branches      | Retain `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` as the Pi planning-layer sequence; storage contracts are documented for inspection/recovery by other harnesses, but no Codex/Claude shortcut is claimed. |
| Handoff artifacts     | Final first-party surface: `/handoff:create`, `/handoff:pickup`, `/handoff:list`, `/skill:handoff-save`, and `/skill:handoff-load`. No old `brmem`-named handoff aliases are retained.                                              |
| Branch retrospectives | Retain `/skill:branch-retro` as the human-facing retrospective workflow; `aretro exec collect-evidence` remains the deterministic evidence-collection command behind the skill rather than a replacement public name.               |

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
| `docs/pi/extension-message-linkification.md`            | Describes how Pi extension custom messages should carry and render clickable links.                                       |
| `docs/pi/handoff-artifacts.md`                          | Defines the directed handoff artifact vocabulary and distinguishes handoffs from compaction and generic summaries.        |
| `docs/pi/objective-stack-subagent-rewrite-brief.md`     | Preserves the historical Objective stack subagent rewrite design with current staleness notes.                            |
| `docs/pi/planned-branch-workflow.md`                    | Documents the planned-branch flow from saved plans to implementation branches and Branch Memory attachments.              |
| `docs/pi/runner-subagent-helper.md`                     | Documents the repo-local runner subagent helper, return modes, statuses, and parent integration rules.                    |
| `docs/pi/session-cwd-semantics.md`                      | Explains Pi session-bound working-directory semantics and cross-worktree patterns.                                        |
| `docs/specs/objective-gt-stacks.md`                     | Specifies `objective gt stacks` and the companion `/objective:gt-stacks` Pi display command.                              |
| `docs/dev-gh-skill-trim-plan.md`                        | Records a plan for trimming and restructuring the `dev-gh` skill and its references.                                      |
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

| Command                                     | Source                                                       | Description                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `/skill:fdt-refactor-mock-to-fake`          | `.agents/skills/fdt-refactor-mock-to-fake/SKILL.md`          | Refactors Python tests from `unittest.mock` or `MagicMock` patterns to gateway-based fakes.                         |
| `/skill:graphite`                           | `.agents/skills/graphite/SKILL.md`                           | Guides Graphite stacked-PR creation, navigation, submission, and stack management.                                  |
| `/skill:grill-me`                           | `.agents/skills/grill-me/SKILL.md`                           | Interviews the user to stress-test a plan until key design branches are resolved.                                   |
| `/skill:grill-with-docs`                    | `.agents/skills/grill-with-docs/SKILL.md`                    | Stress-tests a plan against project language and documentation while updating docs as decisions crystallize.        |
| `/skill:handoff`                            | `.agents/skills/handoff/SKILL.md`                            | Compacts the current conversation into a handoff document for another agent.                                        |
| `/skill:improve-codebase-architecture`      | `.agents/skills/improve-codebase-architecture/SKILL.md`      | Finds architecture-deepening opportunities using project domain language and ADRs.                                  |
| `/skill:ns-changelog-update`                | `.agents/skills/ns-changelog-update/SKILL.md`                | Runs the nonslop changelog update command workflow.                                                                 |
| `/skill:ns-create-py-dev-cli`               | `.agents/skills/ns-create-py-dev-cli/SKILL.md`               | Runs the nonslop Python developer-CLI creation workflow.                                                            |
| `/skill:ns-create-pypackage-project`        | `.agents/skills/ns-create-pypackage-project/SKILL.md`        | Runs the nonslop Python package project creation workflow.                                                          |
| `/skill:ns-dignified-python`                | `.agents/skills/ns-dignified-python/SKILL.md`                | Applies modern production Python coding standards and version-specific guidance.                                    |
| `/skill:ns-fake-driven-test-layout`         | `.agents/skills/ns-fake-driven-test-layout/SKILL.md`         | Defines per-package test directory layout for fake-driven Python projects.                                          |
| `/skill:ns-py-fake-driven-testing`          | `.agents/skills/ns-py-fake-driven-testing/SKILL.md`          | Guides Python gateway and fake-driven testing architecture.                                                         |
| `/skill:ns-pytest`                          | `.agents/skills/ns-pytest/SKILL.md`                          | Provides pytest style guidance for fixtures, helpers, parametrization, and test cleanup.                            |
| `/skill:ns-refac-cli-push-down`             | `.agents/skills/ns-refac-cli-push-down/SKILL.md`             | Identifies deterministic prompt work that should move into tested CLI commands.                                     |
| `/skill:ns-refactor-swarm`                  | `.agents/skills/ns-refactor-swarm/SKILL.md`                  | Coordinates parallel file-local refactors across many independent files.                                            |
| `/skill:ns-resolve-merge-conflicts`         | `.agents/skills/ns-resolve-merge-conflicts/SKILL.md`         | Resolves merge conflicts from an in-progress rebase.                                                                |
| `/skill:ns-setup-dprint`                    | `.agents/skills/ns-setup-dprint/SKILL.md`                    | Runs the nonslop dprint setup workflow.                                                                             |
| `/skill:ns-setup-python-ci`                 | `.agents/skills/ns-setup-python-ci/SKILL.md`                 | Runs the nonslop Python CI setup workflow.                                                                          |
| `/skill:ns-skill-audit`                     | `.agents/skills/ns-skill-audit/SKILL.md`                     | Audits and improves skills for trigger quality, concision, progressive disclosure, and CLI push-down opportunities. |
| `/skill:ns-skill-management`                | `.agents/skills/ns-skill-management/SKILL.md`                | Manages skills with `npx skills` across local and installed skill surfaces.                                         |
| `/skill:ns-skillx`                          | `.agents/skills/ns-skillx/SKILL.md`                          | Runs the nonslop `ns-skillx` command workflow.                                                                      |
| `/skill:nsx`                                | `.agents/skills/nsx/SKILL.md`                                | Runs the nonslop `nsx` command workflow.                                                                            |
| `/skill:skill-creator`                      | `.agents/skills/skill-creator/SKILL.md`                      | Provides tooling and evaluation assets for creating, packaging, and improving Agent Skills.                         |
| `/skill:thermo-nuclear-code-quality-review` | `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` | Runs an extremely strict maintainability review focused on abstraction quality and spaghetti-condition growth.      |

### External runtime surfaces not defined by this repo

| Surface                                                                  | Description                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| User-local Pi extensions under `~/.pi/agent/extensions/`                 | User-local Pi commands may appear in RPC inventory but are personal runtime resources outside this repo. |
| User-local Pi skills under `~/.pi/agent/skills/` and `~/.agents/skills/` | User-local skills may appear in a developer's available-skill list but are not repo-defined artifacts.   |
