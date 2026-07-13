# @internal/ns-pi-subagents

Pi extension package for typed subagent delegation and session-local fleet visibility.

## Model-visible interface

The extension registers exactly one model-visible tool:

```ts
subagent({
  agent: "explorer" | "task",
  tasks: [{ title: "Focused title", prompt: "Complete child prompt" }],
  execution?: "auto" | "subprocess" | "in-process",
  model?: string,
})
```

There are no `explore` or `forked_pi_agent` compatibility tools. The task count expresses breadth; the selected agent descriptor enforces legal count and concurrency.

### Built-in agents

- **`explorer`** — 1–8 read-only reconnaissance tasks, at most four concurrent, with one 300-second whole-call budget. It always receives `read`, `grep`, `find`, and `ls`; runtime choice cannot add permissions. Automatic model selection keeps the parent's provider and chooses its cheap model (Haiku for Anthropic, Flash for Google, or Luna for OpenAI), inheriting the parent model when no same-provider cheap model is known. An explicit override still wins, and each task dispatches exactly once.
- **`task`** — exactly one focused task, sequential in the shared worktree. It receives the normal read/bash/edit/write set, a curated worktree context packet, and inherits parent model/thinking policy unless `model` is explicit. Task agents remain single-attempt.

Every result reports agent, resolved execution architecture, status, title, session file when available, diagnostics, and bounded final text. The child session transcript is the source of truth.

## Execution architectures

Agent type answers **what policy runs**. Execution architecture answers **how the child runs**. They are independent registries.

- **`auto`** (also omission) follows the descriptor's deterministic preference. Both built-ins prefer subprocess initially.
- **`subprocess`** launches hermetic `pi --mode json -p` with extensions disabled and preserves process isolation.
- **`in-process`** creates a real Pi SDK session in the parent process. It keeps the same descriptor tools, writes a persistent child session, disables extension loading to prevent recursion, retains normal skill/context discovery, and disables delegated prompt-template expansion. It supports final-text mode only.

Explicit execution is an advanced architecture override, not a permission override. Unsupported or host-unavailable combinations fail before fleet launch with configuration diagnostics.

## Fleet UI

The extension retains the `ns:agents:*` fleet/transcript commands and shortcuts. One tool invocation creates one Fleet run with one logical Fleet task per requested task. Fleet entries track progress, diagnostics, launch/session evidence, and shared-worktree observations for both execution architectures. Fleet state is session-local, not a durable job database.

## Authoring

Agent definitions live at `.ns/pi/agents/<name>.md` and must declare `toolName: subagent`. Markdown owns prompt/steering prose. A typed `SubagentAgentDescriptor` owns executable policy. Register the complete immutable descriptor list before calling `registerSubagentTool`; the generated schema and catalog do not mutate afterward.

```ts
const agents = createSubagentAgentRegistry(
  [EXPLORER_AGENT_DESCRIPTOR, TASK_AGENT_DESCRIPTOR, myDescriptor],
  (name) => loadPiAgentDefinition(name, cwd),
);
registerSubagentTool(pi, {
  agents,
  runtimes,
  fleetRegistry,
  loadAgentDefinition: loadPiAgentDefinition,
});
```

See [AUTHORING.md](./AUTHORING.md) for the complete procedure.

## Public surfaces

- `@internal/ns-pi-subagents/extension` — production Pi extension.
- `@internal/ns-pi-subagents/api` — curated agent/runtime/fleet authoring contracts.
- `@internal/ns-pi-subagents/runner-subagents` — lower-level process, JSON protocol, terminal capture, and final-text substrate for existing direct consumers.
- `@internal/ns-pi-subagents/runner-subagents/testing` — lower-level test helpers.

`SubagentRuntime.dispatch` and `createSubprocessSubagentRuntime()` remain source-compatible for direct consumers such as terminal-capture councils. `RunnerSubagent*` is valid substrate vocabulary; it is not the retired `runner` agent type.

## Validation

```bash
pnpm --dir ts --filter @internal/ns-pi-subagents test
pnpm --dir ts --filter @internal/ns-pi-subagents check
```
