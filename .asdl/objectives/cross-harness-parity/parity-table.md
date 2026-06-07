# Cross-Harness Parity Table

Living tracker for the `cross-harness-parity` Objective. One row per Pi extension command or custom tool. Seeded from the 2026-06-03 audit; refresh on every parity-relevant Objective update and via the parity-review skill's full-sweep mode. Shared primitive workstreams with no Pi command/tool yet, such as the subsumed command-output summaries work, stay in `objective.md` and `roadmap.md` until a Pi surface exists.

**Parity legend**

- **FULL** — shared CLI carries the logic, a skill drives it, Claude/Codex reach the workflow standalone; the Pi part is purely additive (picker, rendering, tool).
- **PARTIAL** — a CLI exists but no skill points to it, or a skill exists but key logic is Pi-only.
- **NONE** — no CLI and no skill; logic trapped in TypeScript.
- **WAIVED** — genuinely Pi-native primitive; acceptable Pi-only because its value is the Pi UI/session behavior, provided dependent workflows document an agent-neutral fallback.

**Owner**: which Objective closes the row (`cross-harness-parity`, or a sibling).

## ✅ FULL — Pi is purely additive

| Pi surface                        | Workflow                     | Shared CLI backing                                        | Skill                                 | Parity | Notes                                                                                  |
| --------------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `/objective:list`                 | Objective inventory          | `objective list --format md`                              | `objective`                           | FULL   | Markdown rendering owned by the Python CLI; Pi only wraps a chat card.                 |
| `/objective:next`                 | Recommend next work          | `objective list` + `objective exec read-objective`        | `objective-next`                      | FULL   | Picker + git-changed-first ordering are Pi ergonomics; skill accepts explicit slug.    |
| `/objective:current`              | Summarize one Objective      | `objective exec read-objective <slug> --format md`        | `objective-current`                   | FULL   |                                                                                        |
| `/objective:update`               | Update tracking              | `objective list` + `objective exec read-objective`        | `objective-update`                    | FULL   |                                                                                        |
| `/objective:stack-impl`           | Implement as a stack         | `objective list` + `objective exec runner-subagent-usage` | `objective-stack-impl`                | FULL   | Uses the WAIVED `dispatch_runner_subagent`; skill degrades (stop-and-ask) when absent. |
| (no Pi command)                   | Create / close Objective     | `objective list` + `objective exec read-objective`        | `objective-create`, `objective-close` | FULL   | Pure skill + CLI, no Pi layer at all.                                                  |
| `/handoff:create`                 | Save a directed handoff      | `brmem put --namespace handoff --file /dev/stdin`         | `handoff-create`                      | FULL   | Pi adds only the focus prompt.                                                         |
| `/handoff:pickup`                 | Resume a handoff             | `brmem get --namespace handoff`                           | `handoff-pickup`                      | FULL   | Pi adds picker + fuzzy match (mirrored in skill prose).                                |
| `/handoff:list`                   | List handoffs                | `handoff list --format json`                              | `handoff-pickup`                      | FULL   | Pi now consumes the dedicated CLI and keeps only the card renderer.                    |
| `/cmux:sidebar:pr-summary`        | Sidebar from current PR work | `asdl exec cmux-workspace-summary`                        | `cmux-sidebar`                        | FULL   | Mutation CLI is scenario-tested; Pi adds fast-model swap + auto-trigger.               |
| `/cmux:sidebar:objective-summary` | Sidebar from an Objective    | `asdl exec cmux-workspace-summary`                        | `cmux-sidebar`                        | FULL   |                                                                                        |
| `/just`                           | Run `just`, fix failures     | `just` + skill injection                                  | `internal-code-just-fix`              | FULL   | Claude/Codex get the same outcome by running `just` with the skill installed.          |
| `/dev:preview-url`                | Vercel preview URL           | `asdl-dev preview-url`                                    | `dev-preview-url`                     | FULL   | Skill delegates to the shared CLI; Pi only mirrors it under the dev namespace.         |
| `/code:cp`                        | Checkpoint commit            | `asdl-dev cp`                                             | `internal-code-checkpoint`            | FULL   | Skill now wraps the shared CLI instead of reimplementing checkpoint git logic.         |
| `brmem` (internal helper)         | Branch-scoped memory         | `brmem` CLI (put/get/list/check/copy/...)                 | `brmem`                               | FULL   | TS file only resolves the binary path.                                                 |

## 🔴 Orphan orchestration gaps — owned here

| Pi surface                        | Workflow                        | Shared CLI backing                                | Skill  | Parity  | Notes                                                                                                        |
| --------------------------------- | ------------------------------- | ------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `/code:land-stack`                | Land a Graphite stack           | _none_ (uses `gt`/`gh` as raw prims)              | _none_ | NONE    | ~50KB TS: stack-walk, merge/preflight guards, sequenced merge loop. Highest risk; push down to a tested CLI. |
| `/cmux:workspace:dispatch-plan`   | Plan → branch → slot → cmux     | `slot`/`brmem`/`cmux` prims; no orchestration CLI | _none_ | NONE    | ~1020 lines of TS sequence + Pi-session plan source. Push down with explicit inputs.                         |
| `/cmux:workspace:dispatch-prompt` | Prompt → branch → slot → cmux   | `git`/`gt`/`slot`/`cmux` prims                    | _none_ | NONE    | Hardcodes `pi @file` launch; needs orchestration CLI + agent-neutral launch.                                 |
| `/cmux:workspace:open-branch`     | Branch → slot → cmux            | `slot checkout` + `cmux new-workspace`            | _none_ | PARTIAL | Explicit-branch case is two runnable CLIs; needs a thin skill. Planned-branch inference is Pi-only.          |
| `/code:autobranch`                | Branch from uncommitted changes | _none_ (commit step reuses `asdl-dev cp`)         | _none_ | NONE    | Slug gen + name selection + stash/create/restore/commit transaction. Push down to `asdl-dev autobranch`.     |
| `/code:land`                      | Land a single PR                | `gh pr merge` (no wrapper)                        | _none_ | PARTIAL | Thin `gh` wrapper; guard logic (base, `--match-head-commit`) undocumented. Skill-only fix.                   |
| `/code:changes`                   | Summarize pending changes       | _none_ (Pi-only model draft)                      | _none_ | NONE    | Cosmetic; skill-only or WAIVE.                                                                               |

## ⚪ WAIVED — genuinely Pi-native primitives (fallback required)

| Pi surface                        | Workflow                      | Agent-neutral fallback                                  | Parity | Notes                                                                                                                                                            |
| --------------------------------- | ----------------------------- | ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch_runner_subagent` (tool) | Delegate a focused subagent   | Host Task/subagent primitive                            | WAIVED | Spawns a `pi` subprocess + parses Pi JSONL. Dependent skills (`objective-stack-impl`, `proto`) already stop-and-ask when absent. Telemetry CLI assumes Pi JSONL. |
| `grill_ask` (tool) + `/grill-ui`  | Structured grilling interview | `grill-me` / `grill-with-docs` skills (prose interview) | WAIVED | TUI is a pure UI accelerator with a documented prose fallback chain.                                                                                             |
| `/code:pr-feedback-watch`         | Ambient PR feedback watcher   | `pr-address` skill/CLI manual invocation                | WAIVED | Pi owns opt-in live polling and prompt injection; `pr-address exec prepare-run`/`get-feedback` own feedback normalization and GitHub mutations.                  |
| worktree status line              | Ambient repo/Graphite status  | `git`/`gt`/`brmem` queries                              | WAIVED | Live TUI widget; no command contract. Underlying facts independently queryable.                                                                                  |

## 🔗 Sibling-owned — tracked, not closed here

| Pi surface                             | Workflow                 | Owning Objective                | Parity    | Notes                                                                                                                                      |
| -------------------------------------- | ------------------------ | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/code:submit`                         | Submit a Graphite stack  | `asdl-dev-submit-consolidation` | FULL      | `asdl-dev submit` is canonical and `internal-code-submit` now provides the skill pointer; sibling still owns broader submit consolidation. |
| `/write-plan`                          | Author a reviewed plan   | `planned-branch-ts-cli`         | PARTIAL → | Extracted into `@asdl/planned-branch` core + bin + skills by the sibling.                                                                  |
| `/create-planned-branch`               | Branch from a saved plan | `planned-branch-ts-cli`         | PARTIAL → |                                                                                                                                            |
| `/impl-planned-branch`                 | Implement attached plan  | `planned-branch-ts-cli`         | PARTIAL → |                                                                                                                                            |
| `write_source_branch_plan_file` (tool) | Write a plan file        | `planned-branch-ts-cli`         | PARTIAL → | Becomes a `planned-branch exec` op + skill.                                                                                                |
