# Agent Resource Catalog

Fresh inventory from the repo checkout and Pi RPC `get_commands` on 2026-05-31.

This catalog separates repo-owned resources from live but non-owned runtime resources. Counts from Pi RPC include user-local and package-installed resources because those affect the visible command menu on this machine; first-party ownership is determined from checked-in paths and `skills-lock.json`, not from command names alone.

## Inventory method

Evidence used for this refresh:

- `find skills -mindepth 1 -maxdepth 1 -type d`
- symlink/provenance scan of `.agents/skills/` and `.claude/skills/`
- `skills-lock.json`
- Pi RPC: `PI_OFFLINE=1 pi --mode rpc --no-session --offline`, request `{"type":"get_commands"}`
- `.pi/extensions/`, `.pi/prompts/`, and `.pi/skills/` filesystem scan
- `objective exec --help`, `brmem exec --help`, `aretro exec --help`, `pr-address exec --help`, and `roaster exec --help`
- checked-in `AGENTS.md` and `CLAUDE.md` inventory, excluding `node_modules`

## Summary

| Surface                                      | Count | Notes                                                                                              |
| -------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------- |
| First-party skills under `skills/`           |    21 | Symlinked into `.agents/skills/` and then `.claude/skills/`.                                       |
| Installed project skills in Pi RPC           |    45 | 21 first-party symlinks plus 24 real-directory remote/vendored skills.                             |
| `.agents/skills/` entries                    |    45 | 21 symlinks to `skills/`, 24 real directories.                                                     |
| `.claude/skills/` entries                    |    45 | All 45 are symlinks into `.agents/skills/`.                                                        |
| `skills-lock.json` entries                   |    45 | 21 local and 24 GitHub-sourced entries; 2 local hashes are `PENDING_REGEN`.                         |
| Pi RPC commands, all visible scopes          |    81 | 31 extension commands and 50 skill commands; no duplicate command names observed.                   |
| Pi RPC project extension commands            |    20 | Registered by checked-in `.pi/extensions/*.ts` adapters.                                           |
| Pi RPC project skill commands                |    45 | Includes first-party and vendored project-installed skills.                                        |
| Pi RPC user-scope extension commands         |    11 | User-local or user package resources; advisory only for this repo.                                  |
| Pi RPC user-scope skill commands             |     5 | User-local or user package skills; advisory only for this repo.                                    |
| Project Pi extension adapter files           |     9 | 7 command adapters, 2 tool/status-only adapters.                                                    |
| Project Pi custom tools                      |     3 | `dispatch_runner_subagent`, `grill_ask`, and `write_source_branch_plan_file`.                       |
| Project Pi prompt templates                  |     0 | `.pi/prompts/` is absent.                                                                          |
| Project Pi-specific skill directory          |     0 | `.pi/skills/` is absent; project skills are exposed through `.agents/skills/`.                      |
| Checked-in agent instruction files           |    14 | `AGENTS.md` / `CLAUDE.md` files outside ignored dependency directories.                            |
| Relevant skill-facing CLI `exec` subcommands |    22 | Across `objective`, `brmem`, `aretro`, `pr-address`, and `roaster`.                                |

## Fresh findings

- The first-party visible skill set grew from the previous catalog's 19 to 21: `pi-grill-ui` and `proto-objective-impl` are now installed and visible as `/skill:*` commands.
- The project Pi command surface grew from 18 to 20 commands: `/grill-ui` and `/proto:objective-impl` are now visible project extension commands.
- No project prompt templates are present, so duplicate prompt/extension exposure is not currently a problem.
- Several first-party skill quality issues are mechanical and low risk: stale `Original description (preserved for reference):` H1s, missing H1 in `pi-grill-ui`, large `SKILL.md` files, and two `PENDING_REGEN` lock hashes.
- Internal skills with `metadata.internal: true` are still visible through Pi as `/skill:<name>` commands in this runtime inventory. The consolidation pass should decide whether that is acceptable, whether descriptions are enough, or whether some internals should move out of the installed skill command surface.
- User-local Pi extensions and skills add 16 visible commands on this machine. They should stay advisory unless explicitly promoted or removed by user request.

## First-party skills

| Skill                    | Category now                     | Lines | Current disposition / audit note                                                                                     |
| ------------------------ | -------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------- |
| `branch-retro`           | Public workflow                  |   147 | Keep as human-facing retrospective workflow; `aretro exec collect-evidence` remains the deterministic boundary.       |
| `brmem`                  | Public infrastructure workflow   |   271 | Keep, but audit for progressive disclosure; large enough to consider references or more CLI push-down.                 |
| `dev-checkpoint`         | Internal command skill           |    74 | Keep as dev helper; lock hash is `PENDING_REGEN`.                                                                     |
| `dev-gh`                 | Internal routing/reference skill |    32 | Keep as GitHub API/CLI routing skill; H1 differs from skill name, likely acceptable only if deliberate.                |
| `dev-gh-ci-debug`        | Internal command skill           |   136 | Cleanup candidate: stale `Original description` H1.                                                                   |
| `dev-gt-restack-resolve` | Internal workflow                |   237 | Keep as specialized Graphite conflict workflow; audit size and push-down opportunities.                               |
| `dev-gt-stackify-branch` | Internal command skill           |   199 | Cleanup candidate: stale `Original description` H1; near large-skill threshold.                                       |
| `dev-just-fix`           | Internal command skill           |   101 | Cleanup candidate: stale `Original description` H1; clarify relationship to `/just`.                                  |
| `dev-stacker-agent`      | Internal command/prototype skill |   230 | Cleanup candidate: stale H1 and large body; decide whether it remains installed or yields to planned/objective flows. |
| `handoff-load`           | Public workflow                  |   115 | Keep as directed handoff pickup/list skill; coordinate with `/handoff:*` Pi commands.                                 |
| `handoff-save`           | Public workflow                  |   140 | Keep as directed handoff creation skill; coordinate with `/handoff:create`.                                           |
| `objective`              | Public grounding skill           |   105 | Keep as shared read-only Objective vocabulary.                                                                        |
| `objective-close`        | Command skill                    |    60 | Keep; command marker and H1 are clean.                                                                                |
| `objective-create`       | Command skill                    |    97 | Keep; lock hash is `PENDING_REGEN`.                                                                                   |
| `objective-current`      | Command skill                    |    52 | Keep; command marker and H1 are clean.                                                                                |
| `objective-next`         | Command skill                    |    69 | Keep; command marker and H1 are clean.                                                                                |
| `objective-stack-impl`   | Public workflow                  |   276 | Audit high priority: large body, H1 differs, and overlaps with prototype runner decisions.                            |
| `objective-update`       | Command skill                    |   191 | Keep; close to large-skill threshold but owns important semantic update rules.                                        |
| `pi-grill-ui`            | Internal backend skill           |    15 | Cleanup/visibility candidate: missing H1 and visible as `/skill:pi-grill-ui` despite being a Pi backend asset.        |
| `pr-address`             | Command workflow                 |   361 | Audit high priority: stale `Original description` H1 and largest first-party skill; likely reference/push-down win.   |
| `proto-objective-impl`   | Internal prototype workflow      |   236 | Audit high priority: prototype lifecycle decision; large body and H1 differs from skill name.                         |

## Installed skill surfaces and lock state

| Artifact             | Current state                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `.agents/skills/`    | 45 entries: 21 symlinks to first-party `skills/<name>` and 24 real-directory remote skills.    |
| `.claude/skills/`    | 45 symlinks to `.agents/skills/<name>`; vendored-vs-first-party follows the target.            |
| `skills-lock.json`   | 45 entries: 21 `local`, 24 `github`; `dev-checkpoint` and `objective-create` are `PENDING_REGEN`. |
| Remote skill policy  | Current repo policy says real-directory entries are live developer aids, not first-party code. |

### Remote/vendored installed skills by source

| Source | Skills |
| ------ | ------ |
| `dagster-io/fake-driven-testing` | `fdt-refactor-mock-to-fake` |
| `withgraphite/agent-skills` | `graphite` |
| `mattpocock/skills` | `grill-me`, `grill-with-docs`, `handoff`, `improve-codebase-architecture` |
| `nseng-ai/nonslop` | `ns-changelog-update`, `ns-create-py-dev-cli`, `ns-create-pypackage-project`, `ns-dignified-python`, `ns-fake-driven-test-layout`, `ns-py-fake-driven-testing`, `ns-pytest`, `ns-refac-cli-push-down`, `ns-refactor-swarm`, `ns-resolve-merge-conflicts`, `ns-setup-dprint`, `ns-setup-python-ci`, `ns-skill-audit`, `ns-skill-management`, `ns-skillx`, `nsx` |
| `anthropics/skills` | `skill-creator` |
| `cursor/plugins` | `thermo-nuclear-code-quality-review` |

Notable remote/vendored routing issues to decide, not edit in place by default:

- `handoff` overlaps conceptually with first-party directed handoff skills.
- `graphite` overlaps with first-party `dev-gt-*` skills but remains the general Graphite workflow reference required by repo instructions.
- `grill-me` overlaps with `/grill-ui` and `pi-grill-ui`, though the latter is an internal structured-UI backend.
- `ns-setup-python-ci` and `skill-creator` expose bare `Command` descriptions, but they are vendored and should not be normalized as first-party edits without a skill-management decision.

## Project Pi extension commands

| Command                  | Source                       | Disposition / relationship                                                                                         |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/dev:cp`                | `.pi/extensions/dev.ts`      | Project dev/source-control command; related to `dev-checkpoint`.                                                    |
| `/dev:autobranch`        | `.pi/extensions/dev.ts`      | Project dev/source-control command; Graphite branch creation wrapper.                                               |
| `/dev:submit`            | `.pi/extensions/dev.ts`      | Project dev/source-control command; Graphite submit wrapper.                                                        |
| `/dev:land`              | `.pi/extensions/dev.ts`      | Project dev/source-control command; GitHub single-PR landing wrapper.                                               |
| `/dev:land-stack`        | `.pi/extensions/dev.ts`      | Project dev/source-control command; Pi-only Graphite stack landing wrapper.                                         |
| `/grill-ui`              | `.pi/extensions/grill-ui.ts` | Structured grill session wrapper; should be the user-facing Pi command, with `pi-grill-ui` treated as backend text. |
| `/handoff:create`        | `.pi/extensions/handoff.ts`  | Pi command for first-party directed handoff creation; related to `handoff-save`.                                    |
| `/handoff:pickup`        | `.pi/extensions/handoff.ts`  | Pi command for first-party directed handoff pickup; related to `handoff-load`.                                      |
| `/handoff:list`          | `.pi/extensions/handoff.ts`  | Pi command for first-party directed handoff listing; related to `handoff-load`.                                     |
| `/just`                  | `.pi/extensions/just-fix.ts` | Top-level convenience command; clarify relationship to `dev-just-fix` during audit.                                 |
| `/objective:list`        | `.pi/extensions/objective.ts` | Direct Objective inventory command; no agent skill required.                                                        |
| `/objective:gt-stacks`   | `.pi/extensions/objective.ts` | Direct Objective stack projection command; no agent skill required.                                                 |
| `/objective:next`        | `.pi/extensions/objective.ts` | Picker wrapper that invokes `objective-next`.                                                                       |
| `/objective:current`     | `.pi/extensions/objective.ts` | Picker wrapper that invokes `objective-current`.                                                                    |
| `/objective:update`      | `.pi/extensions/objective.ts` | Picker wrapper that invokes `objective-update`.                                                                     |
| `/objective:stack-impl`  | `.pi/extensions/objective.ts` | Picker wrapper that invokes `objective-stack-impl`; compare with `/proto:objective-impl`.                           |
| `/write-plan`            | `.pi/extensions/planned-branch.ts` | Top-level planned-branch command; consider whether a future namespace would reduce surface ambiguity.          |
| `/create-planned-branch` | `.pi/extensions/planned-branch.ts` | Top-level planned-branch command; no portable skill shortcut is currently claimed.                            |
| `/impl-planned-branch`   | `.pi/extensions/planned-branch.ts` | Top-level planned-branch command; uses Branch Memory plan attachment contract.                                |
| `/proto:objective-impl`  | `.pi/extensions/proto.ts`    | Prototype Objective implementation wrapper; lifecycle decision needed before it becomes permanent by default.       |

Project extension files that do not register public slash commands:

| File                                        | Surface |
| ------------------------------------------- | ------- |
| `.pi/extensions/dispatch-runner-subagent.ts` | Registers `dispatch_runner_subagent`. |
| `.pi/extensions/worktree-status.ts`          | Automatic worktree/session status display; no public command in RPC inventory. |

## Project Pi custom tools

| Tool                            | Source                                       | Disposition |
| ------------------------------- | -------------------------------------------- | ----------- |
| `dispatch_runner_subagent`      | `.pi/extensions/dispatch-runner-subagent.ts` | Keep as Pi runner helper for focused subagents; used by Objective stack workflows. |
| `grill_ask`                     | `.pi/extensions/grill-ui.ts`                 | Keep as structured UI helper for `/grill-ui`; not a general public skill by itself. |
| `write_source_branch_plan_file` | `.pi/extensions/planned-branch.ts`           | Keep as plan-store writer for `/write-plan`; local plan store is documented. |

## Skill-facing CLI `exec` helpers

| CLI | Hidden exec operations | Skill/wrapper relationship |
| --- | ---------------------- | -------------------------- |
| `objective exec` | `read-objective`, `runner-subagent-usage` | Used by Objective command skills and Objective stack implementation. |
| `brmem exec` | `resolve-prompt` | Used by `brmem` and prompt-resolution workflows. |
| `aretro exec` | `collect-evidence` | Used by `branch-retro`. |
| `pr-address exec` | `prepare-run`, `get-pr-for-branch`, `get-feedback`, `get-reviews`, `get-review-comments`, `get-discussion-comments`, `add-review-thread-reply`, `reply-to-review`, `reply-to-discussion`, `resolve-thread`, `resolve-thread-with-reply`, `unresolve-thread`, `add-issue-comment`, `add-reaction` | Used by `pr-address`; substantial deterministic workflow is already pushed down. |
| `roaster exec` | `classify-inline-findings`, `format-findings-comment`, `post-findings-comment`, `post-inline-findings` | CI/review automation surface; no first-party skill currently routes to it. |

## Cluster and disposition map

| Cluster | Current surfaces | Initial disposition / next decision |
| ------- | ---------------- | ----------------------------------- |
| Objective command skills | `objective`, `objective-create`, `objective-current`, `objective-next`, `objective-update`, `objective-close`; `/objective:*`; `objective exec` | Keep the core Objective command skills and Pi wrappers. Audit whether every command skill should stay visible as `/skill:*` or whether some are Pi-wrapper-only in practice. |
| Objective implementation runners | `objective-stack-impl`, `proto-objective-impl`, `/objective:stack-impl`, `/proto:objective-impl`, `dispatch_runner_subagent`, `objective exec runner-subagent-usage` | Highest-priority decision cluster. Decide prototype lifecycle: merge, retire, or keep explicitly experimental. Avoid two durable Objective implementation entrypoints with unclear semantics. |
| Handoff and Branch Memory | `handoff-save`, `handoff-load`, `brmem`, `/handoff:create`, `/handoff:pickup`, `/handoff:list`, `brmem exec resolve-prompt`, vendored `handoff` | Keep first-party directed handoff as repo public UX and `brmem` as storage/infrastructure. Decide whether vendored `handoff` should remain installed despite conceptual overlap. |
| Branch retrospective | `branch-retro`, `aretro exec collect-evidence` | Keep as skill/CLI-centered. No Pi command needed unless a future UI adds clear value. |
| Dev/source-control/GitHub/Graphite | `dev-checkpoint`, `dev-gh`, `dev-gh-ci-debug`, `dev-gt-restack-resolve`, `dev-gt-stackify-branch`, `dev-just-fix`, `dev-stacker-agent`, `/dev:*`, `/just`, vendored `graphite` | Keep as internal developer surface for now, but clean stale skill scaffolding and clarify how `/dev:*` relates to `dev-*` skills. Decide whether `dev-stacker-agent` remains separate from planned/objective implementation flows. |
| PR addressing and review automation | `pr-address`, `pr-address exec *`, `roaster exec *`, vendored review skills where present | Audit `pr-address` first: large skill and stale H1 despite strong CLI push-down. Keep `roaster exec` cataloged as CLI automation, not a visible skill unless a workflow needs it. |
| Grill / structured questioning | `/grill-ui`, `pi-grill-ui`, vendored `grill-me`, vendored `grill-with-docs`, `grill_ask` | Make `/grill-ui` the Pi public structured-UI path. Decide whether `pi-grill-ui` should stay installed as visible `/skill:pi-grill-ui` or move to an internal prompt asset. Keep vendored grill skills if their generic trigger value justifies surface cost. |
| Planned branch workflow | `/write-plan`, `/create-planned-branch`, `/impl-planned-branch`, `write_source_branch_plan_file`, docs under `docs/pi/` | Retained historically, but names are still top-level and not skill-centered. Decide whether to leave as a Pi planning layer or eventually namespace as `/plan:*`. |
| Remote/vendored skills | 24 real-directory `.agents/skills/*` entries and `.claude` symlinks | Decide keep/remove/document policy. Do not edit as first-party. Main consolidation lever is installation policy and trigger-surface cost. |
| User-local/personal runtime | 11 user extension commands and 5 user skill commands in Pi RPC | Advisory only. Do not mutate under this Objective unless explicitly requested. |

## User-local and package runtime commands observed by Pi RPC

These commands are visible on this machine but are outside the repo-owned closure-critical surface.

| Kind | Commands |
| ---- | -------- |
| User-local Pi extensions | `/cmux-dispatch`, `/cmux-refresh-meta`, `/cmux-slot:dispatch-plan`, `/cmux-slot:open-branch`, `/gh-pr`, `/stack-latest` |
| User/package Pi extensions | `/diff-review`, `/websearch`, `/curator`, `/google-account`, `/search` |
| User/package skills | `/skill:bk`, `/skill:obsidian-cli`, `/skill:pi`, `/skill:find-skills`, `/skill:librarian` |

## Checked-in instruction and documentation surfaces

Checked-in instruction files outside dependency directories:

- `AGENTS.md`
- `CLAUDE.md`
- `packages/asdl-core/AGENTS.md`
- `packages/asdl-core/CLAUDE.md`
- `packages/asdl-core/src/asdl_core/clinkr/AGENTS.md`
- `packages/asdl-core/src/asdl_core/clinkr/CLAUDE.md`
- `packages/asdl-core/src/asdl_core/gh/AGENTS.md`
- `packages/asdl-core/src/asdl_core/gh/CLAUDE.md`
- `packages/asdl-core/src/asdl_core/gt/AGENTS.md`
- `packages/asdl-core/src/asdl_core/gt/CLAUDE.md`
- `packages/asdl-core/src/asdl_core/sessions/AGENTS.md`
- `packages/asdl-core/src/asdl_core/sessions/CLAUDE.md`
- `packages/brmem/AGENTS.md`
- `packages/brmem/CLAUDE.md`

Primary docs that route or describe agent resources:

- `docs/agent-resource-catalog.md`
- `docs/pi/README.md`
- `docs/pi/handoff-artifacts.md`
- `docs/pi/planned-branch-workflow.md`
- `docs/pi/runner-subagent-helper.md`
- `docs/pi/objective-stack-subagent-rewrite-brief.md`
- `docs/dev-gh-skill-trim-plan.md`
- `docs/objective-system.md`
- `docs/aretro.md`

## Immediate cleanup candidates

Do these after disposition decisions, not as part of raw inventory:

1. Fix first-party stale H1 scaffolding in `dev-gh-ci-debug`, `dev-gt-stackify-branch`, `dev-just-fix`, `dev-stacker-agent`, and `pr-address`.
2. Add a proper H1 to `pi-grill-ui` or move it out of the visible skill command surface.
3. Decide whether `objective-stack-impl` and `proto-objective-impl` are one durable capability, a durable-plus-experiment pair, or a prototype that should retire.
4. Audit large first-party skills: `pr-address`, `objective-stack-impl`, `brmem`, `proto-objective-impl`, `dev-gt-restack-resolve`, and `dev-stacker-agent`.
5. Regenerate or otherwise settle `PENDING_REGEN` hashes for `dev-checkpoint` and `objective-create` through the repo's skill-management workflow.
6. Decide whether overlapping vendored skills (`handoff`, `grill-me`, `grill-with-docs`) should remain installed in this repo or be treated as removable surface-area noise.
7. Update `docs/pi/README.md` after decisions; its older current-inventory section should not remain the authoritative catalog once this consolidation pass lands.
