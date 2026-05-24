# Runner Subagent Helper

This document describes the local runner-subagent helper tracked by the [Pi Extension Runner Subagent MVP Objective](../../.asdl/objectives/pi-core-subagent-mvp/objective.md). It is a repo-local extension/package-layer primitive, not a Pi core API.

## Mental model

A parent Pi extension calls `dispatchRunnerSubagent(pi, ctx, options)`, awaits a separate subagent Pi process, and receives a structured result. The subagent starts with fresh conversation history in the same cwd/worktree by default. The parent prompt must include all task context the subagent needs.

Completion is a terminal capture, not a queued slash command. The subagent calls exactly one configured terminal tool, the injected runtime captures the validated tool input, and the parent maps that payload to a result such as `completed` or `blocked`. Do not use `sendUserMessage("/..." )` as a completion handoff.

## Architecture

The helper lives in `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`. It launches a subagent process shaped like:

```text
pi --mode json -p --no-extensions --extension <generated-runtime> --session <file> <prompt>
```

Important details:

- `--mode json -p` gives the parent JSONL session events to parse.
- `--no-extensions` prevents ordinary project parent extensions from recursively loading in the subagent.
- `--extension <generated-runtime>` injects a private runtime extension containing only the requested terminal capture tools.
- `--session <file>` points at a parent-created runner subagent artifact. The returned `sessionFile` is inspectable after blocked/error/cancelled outcomes when Pi writes the session.
- The subagent uses `ctx.cwd` by default, so it sees the same repository/worktree while starting from a fresh conversation.

The helper keeps the full subagent transcript out of the parent LLM context. Parent code receives the structured result and can decide what summary, diagnostics, or session path to display.

## Terminal capture tools

Callers provide terminal tools with:

- `name`
- `status`: `completed` or `blocked`
- `description`
- JSON-serializable TypeBox-like `parameters`

The generated subagent runtime registers these tools in capture-only mode. Tool execution records the validated input, requests subagent termination, and performs no domain side effects. The parent receives terminal metadata: tool name, optional tool call id, mapped status, and input payload.

At child startup, the runtime checks `pi.getAllTools()` for tool-name collisions. A collision writes a runtime startup failure instead of registering ambiguous terminal tools.

## Result taxonomy

`dispatchRunnerSubagent` returns one of:

- `completed`: subagent called a configured completed terminal tool.
- `blocked`: subagent called a configured blocked terminal tool.
- `stopped-without-terminal`: subagent stopped cleanly without a terminal capture.
- `cancelled`: parent abort signal cancelled the run and best-effort subagent termination ran.
- `error`: spawn, runtime, provider/model, session creation, malformed JSONL, or nonzero-exit failure.
- `protocol-error`: subagent violated the terminal protocol, such as an unknown terminal capture or a terminal tool mixed with sibling tool calls.

Mixed terminal-plus-sibling behavior is deterministic from the parent's perspective: the result is `protocol-error`. Under public Pi event ordering, however, an earlier sibling side effect may already have occurred before the parent can observe and terminate the invalid batch.

## Progress and UI

The dispatcher parses lightweight progress from JSON events: title, state, current tool, tool count, turn count, elapsed time, and session path. The first demo consumer displays final parsed progress in parent output and a minimal status/widget while waiting. It does not currently stream live `onProgress` callbacks from the dispatcher.

## Demo command

The project-local shim `.pi/extensions/runner-subagent-demo.ts` loads `ts/packages/pi-extensions/src/runner-subagent-demo.ts`, making this command available through normal project Pi extension discovery:

```text
/runner-subagent-demo <task>
```

The command:

1. waits for the parent session to become idle;
2. builds a complete subagent prompt from `<task>`;
3. launches `dispatchRunnerSubagent(pi, { cwd: ctx.cwd, signal: ctx.signal }, options)`;
4. provides `runner_subagent_demo_complete` and `runner_subagent_demo_blocked` terminal tools;
5. displays subagent title, state/result, terminal payload, and `sessionFile` through a custom message, falling back to notification when needed.

It is intentionally diagnostic. It proves parent integration without rewriting Objective-stack workflows and without stable npm-style package exports.

## Why not Pi core?

The Objective intentionally uses the extension/package layer because current evidence only requires an awaited subprocess helper for local extensions. This avoids upstream Pi core changes, keeps terminal capture semantics local and testable, and lets future consumers prove whether a narrower core hook is necessary.

Revisit Pi core only with evidence that the extension-layer helper cannot satisfy a real workflow, such as needing pre-side-effect enforcement for sibling tool batches, interactive subagent replies, durable in-flight resume, or filtered parent-context inheritance.
