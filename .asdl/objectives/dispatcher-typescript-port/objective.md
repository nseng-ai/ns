# Dispatcher TypeScript Port

## Thesis

Create the `dispatcher` capability slice for the TypeScript toolkit migration by deciding whether the existing Python `asdl-dispatcher` package should be ported as a thin TypeScript placeholder or deliberately retired.

This is a Child Objective of `port-asdl-toolkit-to-typescript`. It owns the current `asdl-dispatcher` / `dispatcher` contract inventory and the future port/retire decision before any runtime implementation work.

## Scope

- Current standalone `dispatcher` CLI behavior.
- Current `asdl.plugins` plugin mount behavior for `dispatcher`.
- Workspace, build, and test references that would need preservation during a migration or deliberate removal during retirement.
- Caller and consumer evidence for whether keeping a placeholder command has value.
- A future implementation or retirement slice once the port/retire decision is made.

## Non-Goals

- Do not invent GitHub Actions dispatch product behavior before product requirements exist.
- Do not create a TypeScript `dispatcher` package until the port decision has consumer evidence.
- Do not delete `packages/asdl-dispatcher` or remove Python workspace wiring without a recorded retirement plan.
- Do not create `packages/asdl-dispatcher/CONTEXT.md` while the package remains operation-less.

## Current Contract Summary

The current Python package is a thin placeholder. Its durable behavior is discoverability:

- `dispatcher -h` shows the command name and help text.
- `dispatcher --version` works through the standalone CLI wrapper.
- The package exposes an `asdl.plugins` entry point named `dispatcher` whose group mounts under a parent `asdl` command.

The dispatcher group currently has no operations, and its typed context carries no gateways or state.

## Completion Criteria

- The current contract inventory is recorded and validated against source, tests, and workspace references.
- The Objective records whether the next action is a tiny TypeScript placeholder port or deliberate Python package retirement.
- Any implementation or retirement slice preserves or intentionally removes the documented user-facing contracts.
- The parent TypeScript migration Objective records the dispatcher child Objective and its status.

## Open Question

Should `dispatcher` become a real TypeScript capability with GitHub Actions dispatch semantics, or should the current placeholder Python package be retired because no durable user-facing behavior exists beyond help, version, and plugin discoverability?
