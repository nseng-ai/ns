# Moved Land-Stack Orchestration to CCC

## Summary

Moved `/code:land-stack` Graphite/GitHub/slot landing orchestration from `@asdl/pi-extensions` into `@asdl/ccc`. The public command remains `/code:land-stack`; `@asdl/pi-extensions` now keeps a thin adapter that delegates registration to `@asdl/ccc/land-stack`.

The moved CCC implementation owns the stack landing plan, PR metadata preflight/update prompts, managed landing-slot cleanup, merge loop, command streaming, renderer, and presentation helpers while importing neutral command-runtime and terminal-presentation helpers directly from `@asdl/pi-extension-runtime`.

## Objective Impact

This completes the `/code:land-stack` sub-slice of the source-control command/control roadmap row. The source-control row still tracks the separate `/code:submit` placement decision and keeps `asdl-dev` command runners, pending-worktree snapshots, checkpoint primitives, Vercel preview lookup, and lower gateways outside CCC.

Validation evidence: `bun test --cwd ts/packages/ccc --sequential`, `bun test --cwd ts/packages/pi-extensions --sequential`, `bun run --cwd ts check`, `bun run --cwd ts test`, `just dprint-check`, and `git diff --check` passed. Import-direction checks found no lower-package imports of `@asdl/ccc` and no CCC imports of `@asdl/pi-extensions` or `ts/packages/pi-extensions/src`.

## Follow-Ups

- Decide whether `/code:submit` remains a pure `asdl-dev` mirror or receives a CCC wrapper only for command-suite placement.
- Keep import-direction checks confirming lower packages do not import CCC and CCC does not import pi-extension internals.
