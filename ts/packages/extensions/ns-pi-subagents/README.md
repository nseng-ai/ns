# ns-pi-subagents

`ns-pi-subagents` is the Pi extension package for ns dogfooded parallel subagent exploration.
The workspace/npm package name is `@nseng-ai/ns-pi-subagents`.

## Registration

The package manifest declares:

```json
{
  "pi": { "extensions": ["./src/extension.ts"] }
}
```

In this slice the package is a private workspace package. Pi package setups can register `@nseng-ai/ns-pi-subagents` inside this workspace. For local workspace dogfood, `.pi/extensions/agents.ts` imports `@nseng-ai/ns-pi-subagents/extension` through the repo workspace resolver.

## Tool

The extension registers the `explore` and `dispatch_runner_subagent` tools. For `explore`, a parent agent provides one or more focused read-only scouting tasks, and the extension launches child Pi sessions for each task. Results are returned as bounded direct findings with session-file paths for raw transcripts. For `dispatch_runner_subagent`, the parent agent launches one focused forked Pi process and receives final-text/status evidence.

Behavioral guarantees and limits:

- Explorer children are read-only by allowlist: `read`, `grep`, `find`, and `ls` only; no `bash`, `edit`, or `write`.
- Direct result text is capped per task and in total; raw child transcripts remain available through the reported session files.
- The current cheap-model policy is Anthropic-first/Haiku where available, with fallback to the parent model otherwise.
- Explorer children launch with `--no-extensions`.
- Local filesystem policy is enforced by prompt/tool allowlist, not by an OS sandbox.
- Subprocess dispatch is the default runtime. The package exposes an explicit runtime seam plus a non-default in-process adapter for future injection/dogfood; selecting it requires caller code to pass that runtime explicitly.

## Subagent fleet widget and transcripts

The extension maintains session-local recent/current subagent fleet state for the current Pi process. It renders a persistent `ns.agents.fleet` widget with running tasks first and recent completed tasks after them. The widget is intentionally not a durable index: it resets when Pi restarts and does not write XDG or repo-local fleet state.

The `/ns:agents:fleet` command (also available through F2/alt+e/shift+ctrl+e) opens the subagent fleet navigator for known explore and dispatch child sessions. The `/ns:agents:transcript` command opens a read-only transcript view for child session JSONL files known to that session-local fleet. Child Pi JSONL files remain the source of truth; the commands do not mutate transcripts or create a secondary transcript store.

## Public exports

- `@nseng-ai/ns-pi-subagents/extension` — default Pi extension entrypoint, exported from `src/extension.ts`.
- `@nseng-ai/ns-pi-subagents/explore` — explore constants, dispatcher, runtime seam, fleet/transcript helpers, extension helpers, and types.
- `@nseng-ai/ns-pi-subagents/explore/testing` — test helpers for package tests and consumers.
- `@nseng-ai/ns-pi-subagents/runner-subagents` — runner-subagent dispatch/runtime/fleet helpers and the `dispatch_runner_subagent` tool implementation.
- `@nseng-ai/ns-pi-subagents/runner-subagents/testing` — runner-subagent test helpers for package tests and consumers.
