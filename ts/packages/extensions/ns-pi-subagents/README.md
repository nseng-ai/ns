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

In this slice the package is a private workspace package. Pi package setups can register `@nseng-ai/ns-pi-subagents` inside this workspace; external installation still requires extracting or bundling the internal runner-subagent substrate. For local workspace dogfood, `.pi/extensions/explore.ts` imports `@nseng-ai/ns-pi-subagents/extension` through the repo workspace resolver.

## Tool

The extension registers the `explore` tool. A parent agent provides two or more focused read-only scouting tasks, and the extension launches child Pi sessions for each task. Results are returned as bounded direct findings with session-file paths for raw transcripts.

Behavioral guarantees and limits:

- Explorer children are read-only by allowlist: `read`, `grep`, `find`, and `ls` only; no `bash`, `edit`, or `write`.
- Direct result text is capped per task and in total; raw child transcripts remain available through the reported session files.
- The current cheap-model policy is Anthropic-first/Haiku where available, with fallback to the parent model otherwise.
- Explorer children launch with `--no-extensions`.
- Local filesystem policy is enforced by prompt/tool allowlist, not by an OS sandbox.

## Public exports

- `@nseng-ai/ns-pi-subagents/extension` — default Pi extension entrypoint.
- `@nseng-ai/ns-pi-subagents/explore` — explore constants, dispatcher, extension helpers, and types.
- `@nseng-ai/ns-pi-subagents/explore/testing` — test helpers for package tests and consumers.
