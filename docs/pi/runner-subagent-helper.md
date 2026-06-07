# Runner Subagent Helper

This document describes the local runner-subagent helper tracked by the archived [Pi Core Subagent MVP Objective](../../.asdl/objective-archive/pi-core-subagent-mvp/objective.md). It is a repo-local extension/package-layer primitive, not a Pi core API.

## Mental model

A parent Pi extension calls `dispatchRunnerSubagent(pi, ctx, options)`, awaits a separate subagent Pi process, and receives a structured result. The subagent starts with fresh conversation history in the same cwd/worktree by default. The parent prompt must include all task context the subagent needs. The caller chooses whether it wants structured terminal capture or final assistant text.

In terminal-capture mode, completion is a terminal capture, not a queued slash command. The subagent calls exactly one configured terminal tool, the injected runtime captures the validated tool input, and the parent maps that payload to a result such as `completed` or `blocked`. In final-text mode, the parent consumes the subagent's final assistant text and must treat every non-`final-text` status as diagnostic. Do not use `sendUserMessage("/..." )` as a completion handoff.

## Architecture

The helper API lives in `ts/packages/pi-extensions/src/runner-subagent.ts` as `dispatchRunnerSubagent(...)`. Runtime/process internals live under `ts/packages/pi-extensions/src/runner-subagent/`. The generic LLM tool extension is `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`, which registers `dispatch_runner_subagent` in final-text mode.

The process runner launches a subagent shaped like:

```text
pi --mode json -p [--provider <provider> --model <model>] [--thinking <level>] --no-extensions --extension <generated-runtime> --session <file> <prompt>
```

Important details:

- `--mode json -p` gives the parent JSONL session events to parse.
- `--provider`/`--model` are passed when the parent context has an explicit model or the caller provides a launch override.
- `--thinking <level>` is passed for non-off thinking levels; `off` is still recorded and displayed as the actual child thinking setting but does not need a CLI flag.
- `--no-extensions` prevents ordinary project parent extensions from recursively loading in the subagent.
- `--extension <generated-runtime>` injects a private runtime extension containing only the requested terminal capture tools when terminal mode is used.
- `--session <file>` points at a parent-created runner subagent artifact. The returned `sessionFile` is inspectable after blocked/error/cancelled outcomes when Pi writes the session.
- After the child process closes, the helper reads that child session file and aggregates assistant-message usage metadata for post-run result details. This usage is child-session-only and excludes the parent Pi session's usage.
- The subagent uses `ctx.cwd` by default, so it sees the same repository/worktree while starting from a fresh conversation.

The helper keeps the full subagent transcript out of the parent LLM context. Parent code receives the structured result and can decide what summary, diagnostics, usage metadata, or session path to display.

## Runner agent definition

The `dispatch_runner_subagent` tool is backed by `.asdl/pi/agents/runner.md`. The TypeScript extension owns execution, progress, cancellation, diagnostics, truncation, and result formatting; the Markdown definition owns runner-facing metadata and the child prompt wrapper.

Supported frontmatter fields for this slice:

- `schema`: must be `asdl.pi-agent.v1`.
- `name`: must be `runner`.
- `toolName`: must be `dispatch_runner_subagent`.
- `label` and `description`: shown through `pi.registerTool`.
- `promptSnippet`: optional one-line system-prompt snippet.
- `promptGuidelines`: optional list of tool-specific guideline bullets.

The Markdown body is the child prompt wrapper. `{{prompt}}` is replaced with the delegated prompt exactly as provided after tool-input validation. `{{title}}` is replaced with the validated title. If the body does not include `{{prompt}}`, the extension appends a `## Delegated task` section containing the prompt.

The definition is loaded when the extension registers, so edits to `.asdl/pi/agents/runner.md` require `/reload` or restarting Pi before the active tool metadata/prompt wrapper changes. Only `runner.md` is supported by this slice; additional agent variants remain future work.

## Terminal capture tools

Terminal-mode callers provide terminal tools with:

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

The dispatcher parses lightweight progress from JSON events: title, state, current tool, tool count, turn count, elapsed time, session path, and optional launch metadata. Launch metadata records the model/provider and thinking level that the child process was asked to use, plus whether model/thinking CLI args were actually passed. Callers may pass `onProgress(update)` on a single `dispatchRunnerSubagent(...)` run to receive live, coalesced updates while the subagent Pi process is running. Each update contains minimal `progress` plus UI-only `activity` previews.

Usage metadata is post-run only. It is collected after the child closes by reading the child session JSONL file and summing only records shaped like assistant messages with `message.usage`. Missing, unreadable, malformed, or usage-free session files are nonfatal and produce `result.usage.status === "unavailable"` with a reason and diagnostic. Context window is omitted unless an authoritative numeric value is available; the helper does not guess it from the model id.

`RunnerSubagentProgress` remains metadata-only. Activity previews are for local display surfaces such as an above-editor `ctx.ui.setWidget(...)`, not parent tool content/details. Parent tools should keep partial `onUpdate(...)` text and final tool results minimal so child assistant/tool details do not enter the parent model context.

The maintained generic integration surface is `dispatch_runner_subagent`. Its MVP widget can show:

- actual child model and thinking launch metadata
- streaming visible assistant text preview
- current tool input preview
- last completed tool result preview

Previews are compacted and truncated; inspect the returned `sessionFile` for the complete subagent transcript. The MVP does not redact secrets, so avoid treating the widget as secret-safe simply because the previews are display-only.

Do not use `pi.sendMessage(...)` for transient subagent progress: custom messages participate in the parent session and LLM context. Do not write raw progress to stdout from the extension either; subagent stdout is the JSONL protocol stream and parent Pi/TUI output is managed by Pi.

## Agent-facing dispatch tool

The project-local shim `.pi/extensions/dispatch-runner-subagent.ts` loads `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`, registering the `dispatch_runner_subagent` tool.

That tool always uses final-text mode. It requires:

- `title`: concise title for the runner subagent artifact/progress.
- `prompt`: complete prompt for the subagent, including all necessary context.

The tool returns final assistant text when the child produces it. Its model-visible header includes status, title, model/thinking launch metadata, child-only usage/cost accounting (or `Usage: unavailable (...)`), session file, elapsed time, turns/tools, and stop reason when present. Structured `details` mirrors launch metadata and usage diagnostics so callers can inspect them programmatically. For every non-`final-text` status, the tool result includes diagnostics and the session file path; the parent agent must inspect those before treating the delegated task as complete.

## Why not Pi core?

The Objective intentionally used the extension/package layer because current evidence only required an awaited subprocess helper for local extensions. This avoided upstream Pi core changes, kept terminal capture semantics local and testable, and let future consumers prove whether a narrower core hook is necessary.

Revisit Pi core only with evidence that the extension-layer helper cannot satisfy a real workflow, such as needing pre-side-effect enforcement for sibling tool batches, interactive subagent replies, durable in-flight resume, or filtered parent-context inheritance.
