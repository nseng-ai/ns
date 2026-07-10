# Runner Subagent Helper

This document describes the lower-level runner-subagent substrate and its relationship to the model-visible `subagent` tool. The helper is a repo-local package primitive, not a Pi core API.

## Two interfaces

`@nseng-ai/ns-pi-subagents/extension` registers one model-visible tool named `subagent`. It selects an Agent Type (`explorer` or `task`) independently from an Execution Architecture (`subprocess`, `in-process`, or automatic descriptor preference). Both built-ins request final assistant text and expose bounded results plus session evidence.

Direct extension consumers may instead call `dispatchRunnerSubagent(pi, ctx, options)` or use `createSubprocessSubagentRuntime()`. These lower-level `RunnerSubagent*` APIs remain valid substrate vocabulary and support both final-text and terminal-capture modes. They are not aliases for the retired `runner` agent type.

## Subprocess architecture

The process adapter launches a child shaped like:

```text
pi --mode json -p [--provider <provider> --model <model>] [--thinking <level>] --no-extensions [--extension <generated-runtime>] --session <file> <prompt>
```

- `--mode json -p` exposes JSONL progress and final events.
- Model/provider/thinking arguments come from the normalized launch resolver. Qualified model patterns select a provider; unqualified patterns inherit the parent provider where valid.
- `--no-extensions` prevents recursive loading of project extensions.
- A generated private extension is present only for terminal-capture tools.
- The persistent session file is returned as evidence and remains the full transcript.
- The child shares the caller's cwd/worktree but starts with fresh conversation history.

The adapter parses lightweight progress, launch metadata, activity previews, final text or terminal capture, diagnostics, and child-session usage. Activity previews are display-only and must not be copied wholesale into parent model context.

## In-process architecture

The production in-process adapter uses the pinned Pi SDK. It resolves the same normalized provider/model decision through the host `ModelRegistry`, applies descriptor-owned tool allowlists and thinking level, and creates a persistent `SessionManager.create(cwd)` session.

Its `DefaultResourceLoader` disables extensions so the child cannot recursively load `subagent`, while retaining normal skills and `AGENTS.md` context discovery. Delegated prompts use `{ expandPromptTemplates: false }`. The adapter maps SDK session/tool events to normalized progress and final text, preserves `sessionFile`, responds to abort, unsubscribes, and disposes the session. It supports final-text mode only; terminal capture remains subprocess-only.

In-process execution has no process fault-isolation boundary. Both built-in descriptors therefore prefer subprocess for `auto`; explicit in-process is an advanced override that cannot change permissions.

## Agent definitions

Built-in definitions are `.ns/pi/agents/explorer.md` and `.ns/pi/agents/task.md`. Both declare `toolName: subagent`. Markdown owns labels, descriptions, parent guidelines/doctrine, and child prompt wrappers. Typed descriptors own executable policy.

Definitions are read at startup to build the fixed tool schema and healthy catalog. The selected definition is reloaded for each call; a changed `name` or `toolName` fails that call until Pi restarts rather than mutating the schema mid-session.

## Return modes and taxonomy

Direct subprocess callers choose:

- `returnMode: "terminal"` (default): one configured capture tool returns `completed` or `blocked` with validated input.
- `returnMode: "final-text"`: useful completion is `final-text` with `finalText`.

Other outcomes are diagnostic: `stopped-without-terminal`, `stopped-without-useful-text`, `cancelled`, `error`, or `protocol-error`. Inspect `diagnostic` and `sessionFile`; do not treat a non-final-text result as completion for final-text callers.

Terminal capture tools are capture-only. They validate and record input, request termination, and perform no domain side effects. Mixed terminal-plus-sibling behavior is a protocol error, though an earlier sibling side effect may already have occurred before the parent observes it.

## Model-visible tool contract

The `subagent` input is agent-neutral:

```ts
{
  agent: "explorer" | "task";
  tasks: Array<{ title: string; prompt: string }>;
  execution?: "auto" | "subprocess" | "in-process";
  model?: string;
}
```

`explorer` permits 1–8 read-only tasks, maximum concurrency four, and a 300-second whole-call budget. `task` permits exactly one task and is sequential in the shared worktree. Explicit model overrides run once; the descriptor-selected cheap explorer model alone may fail over on transient infrastructure failures.

Every task result reports agent, resolved execution kind, status, title, session file when available, diagnostics, and bounded final text. Fleet UI remains under `ns:agents:*` for both architectures.

## Why not Pi core?

The package layer owns product-specific policy, fleet UI, and terminal protocol semantics while using Pi's public extension and SDK surfaces. Revisit Pi core only with evidence that these public seams cannot support a real workflow, such as durable in-flight resume or pre-side-effect enforcement for sibling tool batches.
