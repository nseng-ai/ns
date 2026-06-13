# Agent Tooling Vocabulary Survey

**Researched:** 2026-06-12, against live official vendor docs and changelogs.
**Why it exists:** input to renaming/reframing asdl plan management (planned-branch family) to be additive to the plan systems agent harnesses already ship. This doc records what every major coding-agent product calls the concepts asdl touches: plans, execution instances, standing automation, execution environments, orchestration, and reusable instruction artifacts.
**Staleness warning:** this space renames aggressively (see the renames table). Treat anything here as a snapshot, not a contract.

## The concept frame

Each vendor was surveyed against seven concepts:

- **(a) Plan artifact** — the what-to-build document and its lifecycle
- **(b) Execution instance** — one unit of agent work with an identity and record
- **(c) Standing automation** — trigger-bound or scheduled unattended work
- **(d) Execution environment** — where agent work runs
- **(e) Multi-agent orchestration** — subagents, parallelism, fleets
- **(f) Reusable instruction artifacts** — skills, rules, playbooks
- **(g) Attachment** — binding agent work to a branch, PR, or issue

## Cross-vendor summary matrix

| Concept              | Claude Code                               | OpenAI Codex                  | Cursor                     | GitHub Copilot                       | Field consensus                                    |
| -------------------- | ----------------------------------------- | ----------------------------- | -------------------------- | ------------------------------------ | -------------------------------------------------- |
| Plan artifact        | plan / plan files, Ultraplan              | plan, `PLANS.md`              | plan (saved Markdown)      | implementation plan                  | "plan"; heavier artifact = "spec"                  |
| Execution instance   | session (routine runs = "runs")           | task (automation runs)        | agent run                  | agent session                        | session (interactive), run (triggered)             |
| Standing automation  | **routine**                               | **Automations**               | **Automations**            | — (assign/@mention only)             | **automation**                                     |
| Trigger noun         | trigger                                   | schedule, @codex              | trigger ("fires")          | assign, @copilot                     | **trigger**                                        |
| Environment          | cloud environment, sandbox                | **environment**, container    | VM, cloud sandbox          | Actions-powered environment, sandbox | **environment** + **sandbox**                      |
| Orchestration        | subagents, agent teams, dynamic workflows | subagents, best-of-N attempts | parallel agents, subagents | Agent HQ, mission control, fleet     | subagent universal; no fleet-noun consensus        |
| Instruction artifact | skills, rules, CLAUDE.md                  | skills, AGENTS.md             | skills, rules              | custom agents, instructions files    | **Skills** (`.agents/skills/` standard), AGENTS.md |

## Vendor glossaries

### Anthropic — Claude Code / Claude Agent SDK

Canonical term list: <https://code.claude.com/docs/en/glossary> (includes an official renamed-terms table).

- **Plan / Plan mode / plan files** — plan mode produces a "plan" you approve; persisted plan files live under `~/.claude/plans/`, relocatable into a repo via the `plansDirectory` setting. **Ultraplan** (research preview, Apr 2026) hands planning to a cloud session and supports "save the plan to a file without executing it," with a browser review view and inline comments. No saved-plan-library or plan-reuse concept beyond files on disk. (<https://code.claude.com/docs/en/permission-modes>, <https://code.claude.com/docs/en/ultraplan>)
- **Session** — the canonical execution-instance noun: "a conversation tied to your current directory, with its own independent context window." Verbs: resume, continue, fork, branch, name, teleport (cloud→local), `--remote` (local→cloud), archive. **Task** is the unit submitted to Claude Code on the web. **Run** is used for routine firings and workflow executions ("Each run creates a new session"). (<https://code.claude.com/docs/en/sessions>)
- **Routine** (research preview, Apr 2026) — the standing-automation noun: "a saved Claude Code configuration: a prompt, one or more repositories, and a set of connectors, packaged once and run automatically." **Trigger** types: Scheduled, API (per-routine fire endpoint), GitHub (repo events). Adjacent: session-scoped **scheduled tasks** (`/loop`), **`/goal`** + **verification loop** for unattended completion conditions, **Channels** (event push into running sessions). (<https://code.claude.com/docs/en/routines>)
- **Cloud environment / sandbox** — cloud sessions run "in an isolated sandbox" on Anthropic-managed infrastructure; the Managed Agents API (beta, Apr 2026) formalizes **Agent / Environment / Session / Events**, with self-hosted sandboxes. Anthropic never uses "runner" for its own compute. (<https://platform.claude.com/docs/en/managed-agents/overview>)
- **Subagent / Agent tool / agent teams / dynamic workflows** — subagents are the delegation primitive (the spawning tool was renamed Task tool → **Agent tool**, v2.1.63). **Agent teams** (experimental): team lead, teammates, shared task list. **Dynamic workflows** (May 2026): "a JavaScript script that orchestrates subagents at scale," with workflow scripts, runtime, runs, phases, and saved workflows in `.claude/workflows/`. "Swarm" is not official Anthropic vocabulary. (<https://code.claude.com/docs/en/workflows>)
- **Skills / commands / hooks / rules / plugins** — skills (`SKILL.md`, Agent Skills open standard) are "the recommended successor to custom commands"; "slash" was dropped from "commands"; plugins bundle skills+hooks+subagents+MCP servers. Claude Code reads CLAUDE.md, not AGENTS.md (import or symlink is the official workaround). (<https://code.claude.com/docs/en/skills>)
- **Attachment** — sessions are linked to the PRs they create (`claude --from-pr <n>` resumes the linked session; the `/resume` picker accepts PR URLs). Cloud/routine work lands on `claude/`-prefixed branches. `@claude` mentions on PRs/issues via the GitHub App; routines' GitHub triggers start a session per matching event. There is **no concept of attaching a plan to a branch**. (<https://code.claude.com/docs/en/github-actions>)

### OpenAI — Codex

- **Plan / Plan mode** — same shape as Claude's: gather context, propose, approve. The cookbook formalizes **execution plans** in `PLANS.md` (Progress, Surprises & Discoveries, Decision Log, Outcomes & Retrospective sections) for "multi-hour problem solving." **Goal mode** (GA May 2026) is the long-horizon noun: "persistent objectives that keep a thread working toward a defined outcome across turns," with completion conditions. (<https://developers.openai.com/cookbook/articles/codex_exec_plans>)
- **Task** — the universal unit of work; verbs: **delegate**, kick off, spin up, launch, assign (Linear). Cloud tasks run remotely; results vocabulary: diff, create a pull request, apply diffs locally. **Thread** is the conversation container; CLI persists **sessions**. Automation executions are **runs**. (<https://developers.openai.com/codex/cloud>)
- **Automations** — the Codex app feature: "schedule recurring Codex tasks" in dedicated worktrees. **Thread automations** (heartbeat wake-ups attached to a thread) vs **standalone automations** (fresh runs on a schedule, reporting into **Triage**, the findings inbox). (<https://developers.openai.com/codex/app/automations>)
- **Environment** — the cloud configuration unit: setup/maintenance scripts, secrets, cached containers, the `codex-universal` image. **Container** runs the task; **sandbox** is the local isolation noun, paired with approval modes (Read Only / Auto / Full Access). (<https://developers.openai.com/codex/cloud/environments>)
- **Subagent workflows / best-of-N** — spawn specialized agents in parallel; **attempts** (`--attempts 3`) for best-of-N. Custom agents with their own model configs. (<https://developers.openai.com/codex/subagents>)
- **AGENTS.md / skills / plugins** — AGENTS.md is "an open-format README for agents," layered global→repo→subdirectory. Custom prompts were deprecated in favor of **skills** (Jan 2026); **plugins** (Mar 2026) are the installable distribution unit. (<https://developers.openai.com/codex/skills>)
- **Attachment** — `@codex` mention idiom on PRs/issues ("delegate a task"); `@codex review`, `@codex fix`; Linear issue assignment creates a cloud task that posts a summary back. (<https://developers.openai.com/codex/integrations/github>)

### Cursor

- **Plan / Plan Mode** — plans are reviewable Markdown files (saved to home dir; "Save to workspace" moves them into the repo), containing **to-dos** that can be sent to new agents. Cross-model planning: plan with one model, "build the plan" with another, foreground or background. (<https://cursor.com/docs/agent/plan-mode>)
- **Agent / agent run / Cloud Agent** — cloud agents run "in isolated VMs in the cloud" (**renamed from Background Agents**, ~Oct 2025). **Cloud Handoff**: prepend `&` to push a local conversation to a cloud agent. (<https://cursor.com/docs/cloud-agent>)
- **Automations** (Mar 2026) — "run cloud agents in the background, either on a schedule or in response to events from GitHub, GitLab, Slack, webhooks, Linear, and more." **Trigger** is the official noun; triggers **fire**; an automation runs "when *any* trigger fires." Sharing scopes: Private / Team Visible / Team Owned (verb: promote). (<https://cursor.com/docs/cloud-agent/automations>)
- **Parallel agents / subagents** — up to eight agents in parallel on one prompt, isolated via git worktrees or remote machines; **Multi-Agent Judging** (2.2) has agents judge parallel outputs; **subagents** (2.4, Jan 2026) are context-isolated workers that can spawn their own subagents (2.5). (<https://cursor.com/docs/subagents>)
- **Rules / Skills** — Project/User/Team Rules plus AGENTS.md; **Agent Skills** (2.4) adopted the open standard, with `/migrate-to-skills` absorbing old commands and dynamic rules. **BUGBOT.md** holds natural-language review rules. (<https://cursor.com/docs/skills>)
- **Attachment** — cloud agents work on a separate branch and produce "merge-ready PRs"; kick off from GitHub/Slack/Linear with `@cursor`; **Bugbot** reviews every PR update. (<https://cursor.com/docs/bugbot>)

### GitHub Copilot

- **Implementation plan** — first-class, approvable artifact since Apr 2026 ("review Copilot's proposed approach and approve or provide feedback before any code is written"), decoupled from PR creation. VS Code has **Plan Mode** / a **Plan agent**. Predecessor **Copilot Workspace** (spec → plan → implementation) sunset May 2025. (<https://github.blog/changelog/2026-04-01-research-plan-and-code-with-copilot-cloud-agent/>)
- **Agent session / agent task** — a session is one autonomous work instance with a **session log**; verbs: assign, delegate, steer. **Agent tasks REST API** (May 2026) starts sessions programmatically. Session subtypes: research, plan, code. (<https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management>)
- **Copilot cloud agent** — **renamed from "Copilot coding agent," Apr 2026**; works "autonomously in a GitHub Actions-powered environment," triggered by assigning issues or @copilot mentions. No cron/scheduled-automation noun. (<https://docs.github.com/copilot/concepts/agents/coding-agent/about-coding-agent>)
- **Agent HQ / mission control** — blog-level vocabulary for the multi-agent surface ("choose from a fleet of agents, assign them work in parallel"); docs standardize on **Agents page** / **Agents tab**. Third-party agents (Anthropic, OpenAI, Google, Cognition, xAI) plug into the same surface. (<https://github.blog/news-insights/company-news/welcome-home-agents/>)
- **Custom agents / agent profiles** — Markdown + YAML frontmatter at `.github/agents/`; VS Code renamed "chat modes" → custom agents (v1.106). Repository/path/org/personal **custom instructions** plus AGENTS.md support. (<https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents>)
- **Attachment** — the core contract: changes on a branch → draft PR, commits authored by Copilot with session-log links. Since Apr 2026, code-on-branch can exist **without** a PR. **Branch controls** gate CI for agent-created code. (<https://github.blog/changelog/2026-04-01-research-plan-and-code-with-copilot-cloud-agent/>)

### Devin (Cognition)

- **Plan / Interactive Planning** — scoped plan with code citations after codebase search; confidence ratings (green/yellow/red) gate whether Devin waits for approval. (<https://docs.devin.ai/work-with-devin/interactive-planning>)
- **Session** — canonical unit (verbs: message, tag, archive, sleep/wake); metered in **ACUs** (Agent Compute Units). **Parent/child sessions** (2026) group nested work; **MultiDevin** = one manager + up to ten worker Devins. (<https://docs.devin.ai/api-reference/v1/sessions/create-a-new-devin-session>)
- **Automation** — Trigger + Conditions + Action; a run is an **invocation**; triggers: Slack, GitHub, Linear, schedule (cron), webhook. **Scheduled Sessions are deprecated in favor of Automations** — direct evidence of "automation" winning the category. (<https://docs.devin.ai/product-guides/automations>)
- **Environment / Blueprint / Snapshot** — Blueprint (YAML, Dockerfile-analog) builds a Snapshot (frozen bootable image; fresh copy per session); replaced "Devin's Machine." (<https://docs.devin.ai/onboard-devin/environment/blueprints>)
- **Playbook / Knowledge / Skills** — **Playbooks** are "like a custom system prompt for a repeated task," with required sections: Procedure, Specifications, Advice, **Forbidden Actions**, Required from User — the closest existing relative of an asdl orchestration pattern's boundary-constraints/authorized-judgment split. **Knowledge** items carry a Trigger Description controlling recall. Skills follow the `.agents/skills/` standard. (<https://docs.devin.ai/product-guides/creating-playbooks>)
- **Attachment** — assign Jira/Linear tickets to Devin (playbook labels `!plan` / `!implement` / `!triage`); plan tracking syncs to Linear's plan UI; **Devin Review** + Autofix on PRs. (<https://docs.devin.ai/integrations/linear>)

### Others, condensed

- **Google Jules** — **plan** with an explicit approve verb (`requirePlanApproval`); **Planning Critic** (Jan 2026) reviews auto-approved plans. UI says **task**, API says **session**/**activity**. **Scheduled Tasks** for recurring work; per-task VMs with setup-script **snapshots**; `jules` label on a GitHub issue starts a task; **CI Fixer** auto-fixes Actions failures on its own PRs. (<https://jules.google/docs/>)
- **Factory** — agent is a **Droid**. **Specification Mode** produces a spec (acceptance criteria + implementation plan) saved to `.factory/docs`. **Missions**: a **mission plan** of features/milestones; the Droid "spawns **worker sessions** … coordinates handoffs through git," with **validation workers** per milestone — the nearest existing thing to per-phase orchestration with quality riders. **Droid Computers** = persistent compute with snapshots (managed or BYOM). (<https://docs.factory.ai/cli/features/missions>)
- **Amp** — **thread** (fork, hand off, mention); **Handoff** replaced compaction; **Oracle** for second-opinion planning/review; execute mode (`amp -x`) for CI; skills + plugins; no PR/issue binding (drives `gh` from threads). (<https://ampcode.com/manual>)
- **OpenHands** (née OpenDevin) — **conversation** is the unit; **Automations** (prompt-based, plugin-based, event-based) run in fresh sandboxes; resolver triggered by `fix-me` label or `@openhands-agent`; **skills** renamed from "microagents." (<https://docs.openhands.dev/openhands/usage/automations/overview>)
- **Charlie Labs** — the most distinctive coinages: **Daemon**, "a repo-defined Charlie role for recurring maintenance" ("Agents create work. Daemons maintain it."), authored in `DAEMON.md` (`watch`, `routines`, `deny`, `schedule`); a daemon run is an **activation** with **wake context**. **Devbox** + **Blueprint** for compute; **CAOS** ("Coding Agent Operating System") durable-execution kernel; durable **Task** trees with **Effects** (human-visible action tracking). (<https://docs.charlielabs.ai/daemons.md>)
- **Augment Code (Cosmos)** — **Expert** = reusable agent template; **Automation** = "persistent, event-driven rule that tells Cosmos to launch an agent — or wake up a running one"; **Trigger** = "the binding that listens for an event and points it at the Expert"; **Environment** = reusable VM; **Artifact** = durable outputs (PRs, branches, Linear issues). (<https://docs.augmentcode.com/cosmos/automations.md>)
- **Warp (Oz)** — **Oz** is "the orchestration platform for cloud agents" (Feb 2026); plans are reusable **Warp Drive** objects; **triggers and schedules** for cloud agents; **environments** ("define how an agent runs, not what it does"); **artifacts** = PRs, branches, plans. (<https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents>)
- **AWS Kiro** — **Spec** (requirements.md with EARS acceptance criteria, design.md, tasks.md); **Waves** — dependency-graph-driven parallel execution of spec tasks; **agent hooks** (IDE event triggers); **steering** files for persistent workspace knowledge. (<https://kiro.dev/docs/specs/>)
- **Devin Desktop** (née Windsurf, renamed Jun 2026) — planner agent, **trajectories**, **Workflows** (reusable markdown slash commands), **Agent Command Center** (Kanban over local + cloud agents), **Spaces** (grouping sessions, PRs, files, shared context). (<https://devin.ai/blog/windsurf-is-now-devin-desktop/>)
- **Qoder (Alibaba)** — **Quest** as the unit of agent-first work; **Spec-driven mode**; worktree-per-task; **Experts Mode** (parallel Frontend/Backend/QA/Code Review experts). (<https://docs.qoder.com/user-guide/quest/overview>)
- **goose** — **Recipes** (reusable workflows packaging extensions, prompts, settings) + sub-recipes as parallel isolated workers; scheduled recipes via the **Scheduler**. Donated to the Linux Foundation's Agentic AI Foundation (Apr 2026). (<https://goose-docs.ai/docs/guides/recipes/>)
- **Cline** — Plan mode / Act mode; `/deep-planning` produces a referenced implementation plan; **Workflows** in `.clinerules/workflows/`. (<https://docs.cline.bot/core-workflows/plan-and-act>)
- **Replit** — Plan mode → ordered task list → "Start building"; **Checkpoints** (app-state snapshots, also the billing unit); "Agents & Automations" refers to artifacts the agent builds *for you*, not scheduled runs of the agent. (<https://docs.replit.com/replitai/plan-mode>)
- **Zed** — **threads** in the Agent Panel; **Parallel Agents** + Threads Sidebar (Apr 2026); **ACP** (Agent Client Protocol) connects any agent to any editor; Skills replaced the Rules Library. (<https://zed.dev/blog/parallel-agents>)
- **Tembo** — orchestration layer over other agents: a **Harness** is "the coding agent running the session" (Claude Code, Codex, Cursor, OpenCode, Amp, Pi) — the only vendor using "harness" as a product noun; **Agents** run on scheduled/event triggers; `@tembo !<macro>`. (<https://docs.tembo.io/features/agents.md>)
- **Google Antigravity** — **Artifacts** (task lists, implementation plans, walkthroughs); Workspaces renamed **Projects** (2.0); Scheduled Tasks; Skills. (<https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/>)

## Convergence patterns

1. **"Automation" won the standing-automation category.** Cursor, Devin, OpenHands, Augment, and the Codex app all use it with near-identical semantics (trigger + standing instructions + unattended runs). Devin deprecated "Scheduled Sessions" in its favor. Claude Code is the major outlier (**routine**); Charlie's **daemon** is the most evocative alternative coinage.
2. **"Trigger" is the universal sub-noun**, and triggers "fire" (Cursor's verb). Trigger taxonomies are converging on: schedule (cron), repo events (GitHub/GitLab), chat (@mention), issue trackers (Linear/Jira), webhooks, observability (Sentry/PagerDuty).
3. **Session vs run split.** "Session" is the interactive-conversation-lineage noun (Devin, Factory, Copilot, Claude); "run" is what automations/triggers produce (Claude routines, Codex automations, Cursor, Charlie, Codegen). Claude composes them explicitly: "Each trigger firing creates a run; each run creates a new session."
4. **"Environment" beat "runner."** Codex, Devin, Warp, Augment, and Claude's Managed Agents API all chose **environment** for where agent work executes, with **sandbox** as the isolation sub-noun and snapshot/blueprint/image for prepared state. No agent vendor uses "runner" for its own compute.
5. **Skills converged hard** as the reusable-instruction standard: `.agents/skills/<name>/SKILL.md` ("open Agent Skills standard") is shared by Claude Code, Codex, Cursor, Devin, Amp, OpenHands (née microagents), Charlie, Tembo, Zed, Factory, Augment, and Antigravity. **AGENTS.md is lingua franca** everywhere except Claude Code (CLAUDE.md) and a few proprietary holdouts (replit.md, tembo.md, SWEEP.md).
6. **"Task" is hopelessly overloaded** — Codex's universal work unit, Claude web's submission unit, Jules's UI noun, Copilot's REST API noun, Cline's unit. Unusable as a distinctive term.
7. **"Workflow" is owned several times over** — GitHub Actions workflows, Claude Code dynamic workflows, Cline workflows, Devin Desktop workflows, goose recipe-adjacent usage.
8. **"Spec" means the heavier artifact** — requirements-grade documents with acceptance criteria (Kiro, Factory, Qoder), distinct from and upstream of an implementation plan.
9. **"Artifact" is emerging** as the noun for durable agent outputs — PRs, branches, plans (Warp Oz, Augment Cosmos, Antigravity).
10. **Plan approval is becoming a formal gate.** Jules has `requirePlanApproval` and a Planning Critic agent; Copilot made plans approvable artifacts decoupled from PRs; Devin gates on confidence ratings; Claude's Ultraplan adds a review UI with inline comments.

## Renames timeline (selected)

| Old                             | New                                   | When         |
| ------------------------------- | ------------------------------------- | ------------ |
| Copilot Workspace (spec/plan)   | sunset; absorbed into coding agent    | May 2025     |
| Claude Code SDK                 | Claude Agent SDK                      | Sep 2025     |
| Cursor Background Agents        | Cloud Agents                          | Oct 2025     |
| VS Code chat modes              | custom agents                         | Nov 2025     |
| Codex custom prompts            | Skills                                | Jan 2026     |
| Cursor commands + dynamic rules | Agent Skills (`/migrate-to-skills`)   | Jan 2026     |
| Claude Code Task tool           | Agent tool                            | early 2026   |
| OpenHands microagents           | Skills                                | ~2026        |
| Devin "Scheduled Sessions"      | de-emphasized in favor of Automations | 2026         |
| Copilot coding agent            | Copilot cloud agent                   | Apr 2026     |
| Devin's Machine                 | Blueprints + Snapshots                | Apr–Jun 2026 |
| Windsurf                        | Devin Desktop                         | Jun 2026     |

## Gaps in the field (asdl-relevant)

Two concepts central to asdl's plan-management reframe have **no existing vocabulary at any vendor**:

1. **Plan attached to a branch as durable, branch-scoped context.** Closest neighbors: Claude Code links sessions to the PRs they created (`--from-pr`, PR URLs in the `/resume` picker) and allows in-repo `plansDirectory`; Copilot leaves agent code on branches without PRs; Warp/Augment treat plans and branches as session "artifacts." Nobody stores a plan *on* a branch for a later zero-context session to pick up. asdl can name this without competing with anyone.
2. **Enriching/compiling a plan into an orchestration.** Closest neighbors: Kiro **Waves** (dependency-graph parallel execution of spec tasks), Factory **Missions** (mission plan → worker sessions + validation workers), Devin **Playbooks** (reusable procedures with Forbidden Actions sections). All are closed single-vendor execution engines; none is a library of orchestration patterns applied to an arbitrary plan. Claude Code's dynamic workflows (JavaScript orchestration scripts with phases and runs) are a plausible compile *target* for such an enrichment step, not a competitor to it.

## Implications adopted for asdl naming

Recorded here for traceability; the binding vocabulary lives wherever the plan-management CONTEXT/ADR work lands:

- Keep **plan** as a plain noun (every harness has one; asdl is additive, operating on plans authored anywhere).
- Use **run** for a single execution instance (consensus for triggered/unattended executions; "session" stays free for its interactive meaning).
- Use **automation** for the standing trigger-bound producer of runs (category winner: Cursor, Devin, OpenHands, Augment, Codex app).
- Use **trigger** as the binding sub-noun; triggers fire.
- Prefer **environment** over "runner" for where runs execute (field consensus; "runner" is CI vocabulary, not agent vocabulary).
- Avoid **task**, **workflow**, **job**, and **spec** as asdl-distinctive terms (overloaded, owned, unused-for-a-reason, and claimed-for-a-heavier-artifact respectively).
