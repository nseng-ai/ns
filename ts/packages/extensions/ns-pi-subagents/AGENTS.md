# @nseng-ai/ns-pi-subagents Agent Notes

Repo-wide and `ts/AGENTS.md` rules apply. Read [AUTHORING.md](./AUTHORING.md) before changing the author interface.

## Architecture

- `src/tool/subagent.ts` owns the sole model-visible `subagent` tool.
- `src/agents/` owns typed behavioral descriptors and the immutable Agent Registry.
- `src/runtime/` owns execution architectures and the Runtime Registry.
- `src/runner-subagents/` remains the lower-level subprocess/protocol/terminal-capture substrate.
- `src/fleet/` owns session-local run visibility and `ns:agents:*` UI.

Agent type and execution architecture are orthogonal. Descriptors own permissions, task/concurrency limits, prompt/model policy, output bounds, compatibility, and automatic preference. Runtime adapters own mechanics and may not weaken descriptor policy. Markdown definitions own prompt and steering prose and must declare `toolName: subagent`.

Do not reintroduce `explore` or `forked_pi_agent` compatibility tools, per-agent model-visible tools, explorer `breadth`, mutable post-registration catalogs, or agent-specific public option bags. Do not mechanically rename valid lower-level `RunnerSubagent*` vocabulary.

## Public surface

New consumers use `@nseng-ai/ns-pi-subagents/api`. Preserve `SubagentRuntime.dispatch`, `createSubprocessSubagentRuntime()`, and lower-level terminal/final-text behavior for direct consumers. The production in-process adapter supports final text only, disables extension recursion, retains skills/context discovery, and preserves persistent session evidence.

## Validation

Use fakes for default tests; do not spawn real child processes or call models. At minimum run the package test and check scripts. Broader TypeScript validation follows `ts/AGENTS.md`.
