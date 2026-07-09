# Eve — Capability Map

Research asset for the [ns-cloud-capabilities map](map.md). Produced from a
read of `/Users/schrockn/code/githubs/vercel/eve` (public beta; expect
drift — re-verify against the repo before relying on details). File citations
are paths within that repo.

## What Eve is

Vercel's open-source, filesystem-first framework for durable backend AI
agents (`README.md`, `AGENTS.md`). An npm package (`eve`) plus CLI. The
defining idea: the filesystem is the authoring interface — an agent is a
directory tree under `agent/` where instructions, tools, skills, channels,
connections, subagents, sandbox, hooks, and schedules are conventional
files/slots that eve discovers, compiles, and runs. Identity is path-derived.

## Core execution model

Three-level nesting — **session → turn → step**
(`docs/concepts/execution-model-and-durability.md`):

- **session** — durable, long-lived conversation/task; spans days/weeks,
  survives restarts and redeploys.
- **turn** — one user message and all work it triggers.
- **step** — a durable checkpoint (one model call + its tool calls).

Every turn runs as a durable workflow on the open-source **Workflow SDK**
(`@workflow/*` 5.0.0-beta line). Nitro hosts HTTP routes but is not the state
store or sandbox runtime.

**Two trust contexts** (`docs/concepts/security-model.md`):

- **App runtime** (trusted): tool `execute`, model calls, connections, state,
  durable workflow. Has `process.env` and full Node.
- **Sandbox** (isolated): the model's shell/file environment rooted at
  `/workspace`. No secrets, no env, no path back. Built-in
  `bash`/`read_file`/`write_file`/`glob`/`grep` live in the app runtime and
  proxy into the sandbox.

**Sandbox backends** (`docs/sandbox.mdx`), pluggable: `vercel()` (Vercel
Sandbox microVM), `docker()`, `microsandbox()`, `justbash()` (pure-JS, no
real binaries), or a custom `SandboxBackend`. One sandbox per durable
session; `/workspace` persists across turns and redeploys; Vercel VMs
idle-timeout (~30 min) but the filesystem is preserved and resumed.

## Integrations

**Channels** (inbound edges, `defineChannel`): eve HTTP (default, NDJSON
streaming), Slack (mentions, DMs, buttons, cards), Discord, Teams, Telegram,
Twilio, Chat SDK, and:

- **GitHub** (`docs/channels/github.mdx`) — GitHub App webhooks,
  `@mention` dispatch; opt-in hooks for `issue`, `pull_request`, and
  `check_suite`/`check_run`/`workflow_run` (CI-failure triage); PR diff
  auto-injected; **incremental repo checkout into the sandbox** before the
  first model call.
- **Linear** (`docs/channels/linear.mdx`) — Linear Agent Sessions; delegate
  issues to the agent; replies as native Agent Activities; team/project
  triage filters.

**Schedules** (`docs/schedules.mdx`) — `defineSchedule`, 5-field cron (UTC).
Markdown "task mode" (fire-and-forget) or a `run` handler that delivers to a
channel and can park durably. Vercel Cron on Vercel; Nitro tasks self-hosted.

**Proactive sessions** — schedules/handlers call `receive(channel, ...)` to
start a session without inbound input.

## Extensibility

Typed `define*` helpers resolved from filesystem slots: `defineAgent`,
`defineTool` (Zod input, `approval` policies), `defineSkill` (SKILL.md,
**compatible with the Agent Skills standard**), `defineChannel`,
`defineSchedule`, `defineSandbox`, `defineHook`, `defineState`,
`defineMcpClientConnection` / `defineOpenAPIConnection` (brokered
credentials the model never sees), `defineDynamic` (per-tenant capabilities),
`defineRemoteAgent` (call another eve deployment as a subagent).

An experimental **`Workflow` tool** lets the model author JavaScript that
orchestrates subagents (sequence, fan-out, map-reduce) as one durable step in
a QuickJS sandbox (`docs/guides/dynamic-workflows.md`).

Docs ship inside the package (`node_modules/eve/docs`) so coding agents can
read them locally.

## State / persistence

- Durable session/workflow state in the Workflow SDK "world": disk
  (`.workflow-data`) locally, Vercel Workflow hosted, pluggable (e.g.
  `@workflow/world-postgres`).
- `defineState` — typed per-session durable working memory.
- Append-only session history; durable, replayable streams.
- Sandbox `/workspace` persists per session.

## The harness

Model-agnostic; **brings its own agent loop** — it does NOT embed Claude
Code or Codex. Models via Vercel AI Gateway ids or any AI SDK provider.
Built-in tools: `bash`, `read_file`, `write_file`, `glob`, `grep`,
`web_fetch`, `web_search`, `todo`, `ask_question`, `agent`, `load_skill`,
`connection_search` (`docs/concepts/default-harness.md`). Auto context
compaction. Built-ins can be overridden or disabled. (`eve init` can launch
external coding-agent REPLs — claude, codex, pi, … — but only as a
scaffolding convenience for *building* an eve agent.)

## Durability, HITL, parallelism

- Crash/timeout/redeploy mid-turn → resume from last completed step;
  interrupted steps re-run, so non-idempotent side effects need care.
- **Parked work**: turns suspend durably holding no compute — days — waiting
  on approval, OAuth, or a subagent.
- **HITL** (`docs/tools/human-in-the-loop.md`): `approval:
  never()/once()/always()/policy` plus `ask_question`; emits
  `input.requested`, parks at `session.waiting`, resumes on response.
- **Parallel**: concurrent subagent fan-out (batch of `agent` tool calls);
  `maxSubagentDepth` default 3, `maxSubagents` default 100; bounded retries
  on transient provider failures.
- No speculative-execution primitive.

## Deployment

Runs identically locally (`eve dev`), on Vercel (`eve build` → Build Output;
Vercel Workflow/Sandbox/Cron; Agent Runs observability), or self-hosted
(`eve start` on any long-running Node host; disk or Postgres world; Docker or
custom sandbox). Self-hostable and portable; Vercel is the zero-config path.

## Comparison-ready summary

| Dimension         | Eve                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Core abstraction  | Filesystem-first agent (directory of typed `define*` slots)                                                              |
| Execution unit    | Durable session → turn → step; each turn a durable Workflow run                                                          |
| Durability engine | Workflow SDK; pluggable world (disk / Vercel Workflow / Postgres)                                                        |
| Trust split       | App runtime (secrets) vs sandbox (isolated `/workspace`)                                                                 |
| Sandbox backends  | Vercel Sandbox / Docker / microsandbox / just-bash / custom                                                              |
| Coding agent      | Own harness + AI SDK models; NOT Claude Code embedded; Agent-Skills-standard skills                                      |
| Inbound           | Slack, Discord, Teams, Telegram, Twilio, GitHub (CI triage, repo checkout), Linear Agent Sessions, custom channels, cron |
| Outbound          | MCP + OpenAPI connections; brokered credentials                                                                          |
| HITL              | Approval policies + `ask_question`; durable park/resume                                                                  |
| Parallel          | Subagent fan-out with depth/count caps; no speculative primitive                                                         |
| State             | Per-session durable memory; append-only history; replayable streams                                                      |
| Deployment        | Self-hostable Node/Nitro or Vercel-hosted; same HTTP contract                                                            |
