# Runner Subagent Helper

This document describes the local runner-subagent helper tracked by the [Pi Extension Runner Subagent MVP Objective](../../.asdl/objectives/pi-core-subagent-mvp/objective.md). It is a repo-local extension/package-layer primitive, not a Pi core API.

## Mental model

A parent Pi extension calls `dispatchRunnerSubagent(pi, ctx, options)`, awaits a separate subagent Pi process, and receives a structured result. The subagent starts with fresh conversation history in the same cwd/worktree by default. The parent prompt must include all task context the subagent needs. The caller chooses whether it wants structured terminal capture or final assistant text.

In terminal-capture mode, completion is a terminal capture, not a queued slash command. The subagent calls exactly one configured terminal tool, the injected runtime captures the validated tool input, and the parent maps that payload to a result such as `completed` or `blocked`. In final-text mode, the parent consumes the subagent's final assistant text and must treat every non-`final-text` status as diagnostic. Do not use `sendUserMessage("/..." )` as a completion handoff.

## Architecture

The helper API lives in `ts/packages/pi-extensions/src/runner-subagent.ts` as `dispatchRunnerSubagent(...)`. Runtime/process internals live under `ts/packages/pi-extensions/src/runner-subagent/`. The generic LLM tool extension is `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`, which registers `dispatch_runner_subagent` in final-text mode.

The process runner launches a subagent shaped like:

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

At subagent startup, the runtime checks `pi.getAllTools()` for tool-name collisions. A collision writes a runtime startup failure instead of registering ambiguous terminal tools.

## Return modes and result taxonomy

`dispatchRunnerSubagent` supports two caller contracts:

- **Terminal-capture mode** (`returnMode: "terminal"`, the default) requires configured terminal tools. Successful terminal capture returns `completed` or `blocked` with the validated payload at `result.terminal.input`.
- **Final-text mode** (`returnMode: "final-text"`) does not require terminal tools. A successful final-text run returns `final-text` with `result.finalText`. For consumers that asked for final assistant text, `final-text` is the only complete status.

For final-text consumers, `completed` and `blocked` are also non-complete diagnostic outcomes because they mean the subagent produced terminal capture instead of final assistant text. The remaining diagnostic statuses require inspecting diagnostics and/or `sessionFile` before deciding what to do next:

- `stopped-without-terminal`: subagent stopped cleanly without a terminal capture.
- `stopped-without-useful-text`: subagent stopped cleanly in final-text mode without useful final assistant text.
- `cancelled`: parent abort signal cancelled the run and best-effort subagent termination ran.
- `error`: spawn, runtime, provider/model, session creation, malformed JSONL, or nonzero-exit failure.
- `protocol-error`: subagent violated the terminal protocol, such as an unknown terminal capture or a terminal tool mixed with sibling tool calls.

Mixed terminal-plus-sibling behavior is deterministic from the parent's perspective: the result is `protocol-error`. Under public Pi event ordering, however, an earlier sibling side effect may already have occurred before the parent can observe and terminate the invalid batch.

## Progress and UI

The dispatcher parses lightweight progress from JSON events: title, state, current tool, tool count, turn count, elapsed time, and session path. Callers may pass `onProgress(progress)` on a single `dispatchRunnerSubagent(...)` run to receive live, coalesced progress snapshots while the subagent Pi process is running.

`onProgress` is intentionally limited to parsed progress metadata. It never streams the subagent transcript, assistant content history, raw JSONL, or tool outputs into the parent. Parent tools should surface this metadata through display-only channels such as partial tool `onUpdate(...)` updates and/or an above-editor `ctx.ui.setWidget(...)`. Avoid `ctx.ui.setStatus(...)` for runner-subagent progress when the intent is to keep all subagent-specific live UI above the input area.

Do not use `pi.sendMessage(...)` for transient subagent progress: custom messages participate in the parent session and LLM context. Do not write raw progress to stdout from the extension either; subagent stdout is the JSONL protocol stream and parent Pi/TUI output is managed by Pi.

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
