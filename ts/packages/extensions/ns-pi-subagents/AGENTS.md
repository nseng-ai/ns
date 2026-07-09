# @nseng-ai/ns-pi-subagents Agent Notes

Rules for working inside this package, which adds a subagent system to Pi (child Pi
processes launched for one focused task, plus the shared fleet widget/navigator). Repo-wide
rules live in the root `AGENTS.md`; the `ts/` workspace rules in `ts/AGENTS.md` still apply
here (read them before editing any `.ts` file).

## Adding a new subagent

Before authoring a new first-party subagent tool, read [`AUTHORING.md`](./AUTHORING.md) —
the step-by-step procedure. `README.md` is the reference (option/result tables and behavior
guarantees); `AUTHORING.md` is the ordered how-to with a complete worked example and a
checklist.

Non-negotiables it enforces, called out here so they are not missed:

- You add an agent by **registering a Pi tool** whose `execute` dispatches a child via
  `dispatchRunnerSubagent`. You do **not** add one by dropping a new `.ns/pi/agents/*.md`
  file — only `runner.md` and `explorer.md` are wired by name, and new definition-file
  variants are future work.
- Every subagent tool must report into the shared fleet registry
  (`getOrCreateSubagentFleetRegistry` + `trackSingleSubagentFleetRun` /
  `trackSubagentFleetRun`). The single per-process registry is what keeps the fleet widget
  and `/ns:agents:fleet` complete.
- Every subagent tool must ship `promptSnippet` **and** `promptGuidelines`; a tool with no
  parent-facing steering ships silent and gets under-used or misused.
- Handle the full `RunnerSubagentResult` union; surface the diagnostic and `sessionFile` on
  failure instead of reporting a non-success status as an empty success.

## Public surface

New consumers build against `@nseng-ai/ns-pi-subagents/api` — the curated export surface.
`/extension` is the Pi entrypoint; `/runner-subagents` and `/runner-subagents/testing` are
lower-level and exported for existing direct consumers. Prefer `/api` for anything new.

## Validation

Validate TypeScript changes with `just ts-check` and `just ts-test`. Tests live under
`test/`; use the `SubagentRuntime` seam (`createFunctionSubagentRuntime`) so tests never
spawn real child processes.
