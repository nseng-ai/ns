# ccc Dispatch Prompt Uses brmem CLI Boundary

## Summary

PR #1466 (`branch-memory-dispatch-prompt-delivery`) stores `ccc` dispatch prompt payloads in Branch Memory instead of timestamped prompt files. The branch evidence is scoped to `ts/packages/ccc/src/cmux/dispatch-prompt.ts` and `ts/packages/ccc/test/ccc.test.ts`: it writes the launch payload to `brmem` under the `ccc-dispatch` namespace, detects collisions with `brmem check`, stores via `brmem put`, and launches Pi by reading the payload back through the public `brmem` CLI.

The durable Objective meaning is a boundary clarification, not completion of a native brmem port row. This consumer uses the shared CLI launcher seam (`@asdl/core/brmem-cli`) rather than migrating callers to a direct native `@asdl/brmem` library dependency.

Evidence considered: local branch diff against Graphite parent `master`; PR #1466 corroborates the same two-file change set.

## Objective Impact

This de-risks the assumption that TypeScript consumers can continue using `brmem` through a shared CLI shell-out boundary while native brmem remains in transition. The Objective now records `ccc` dispatch prompt storage as another consumer covered by the parked direct-library migration boundary.

No active `ts/packages/brmem` roadmap row is marked complete by this branch. `exec resolve-prompt`, public wrapper/skill cutover, Python fallback retirement, and direct TypeScript consumer migration remain pending or parked as before.

## Follow-Ups

- Keep `ccc` dispatch prompt storage on the CLI launcher boundary unless and until native brmem is TypeScript-default and a direct-library consumer migration is explicitly selected.
- When consumer migration is revisited, include `ccc` dispatch prompt storage alongside `@asdl/core/brmem-cli.ts` and `branch-context/brmem-gateway.ts` as migration candidates.
- Continue treating CLI-shellout consumer integrations as public-usability evidence, not as completion evidence for native brmem cutover.
