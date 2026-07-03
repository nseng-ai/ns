# TypeScript Migration Pause

## Summary

Paused remaining `vibechk-v1` product feature work while `.asdl/objectives/vibechk-typescript-port/` ports the already-implemented Python surface to TypeScript.

The migration Objective is deliberately scoped to the current implemented surface: `run`, `show`, `diff`, `runs`, the `claude` runner adapter, local bundle storage, Markdown reports, and local git/result-branch behavior. It should not implement the missing v1 features as part of the language cutover.

## Objective Impact

`vibechk-v1` remains the product source for the full v1 behavior from issue #434, but its remaining open feature rows are now blocked on the TypeScript migration. `publish`, `codex`, `pi`, and real GitHub publish smoke evidence should resume only after the implemented surface is TS-default.

This supersedes the earlier assumption that v1 would continue to completion as a Python CLI. The Python implementation remains useful as the migration baseline and contract inventory source.

## Follow-Ups

- Use `vibechk-typescript-port` for the language cutover.
- After TS-default cutover, decide whether remaining v1 product work continues in this Objective or splits into focused follow-up Objectives for publishing and additional runners.
- Keep this Objective open until the full v1 product criteria are either completed, revised, or explicitly abandoned.
