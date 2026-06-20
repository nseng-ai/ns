# Vibechk Cutover Playbook Lessons

## Summary

Recorded `vibechk` as TypeScript-default in the umbrella migration ledger after the child `vibechk-typescript-port` Objective completed its full cutover.

Standalone TypeScript `@asdl/vibechk` now covers the already-implemented surface: `run`, `runs`, `show`, `diff`, the `claude` runner adapter, schema-version-1 bundle reading/writing, snake_case `bundle.json` compatibility, local bundle storage, Markdown reports, and local `vibechk/<run-id>` result branches with switch-back behavior. The Python package `packages/vibechk` is deleted; rollback/reference evidence is in-repo commit `25c748681`.

The distribution decision is intentionally narrower than `install-tools`: `just install-vibechk` exists as an opt-in TypeScript source shim and removes stale `.venv/bin/vibechk`, but `install-tools` does not include it because the cutover found no active installed-tool consumer requiring a default global install. Active docs now live under `ts/packages/vibechk` and point at the TypeScript invocation model.

The porting playbook now includes `vibechk` lessons: preserve local bundle schemas as durable contracts, keep runner/git/report seams package-local until a second consumer proves reuse, require focused real-git evidence before retiring a workdir-mutating tool, and treat opt-in source shims as valid when consumer evidence does not justify default install or registry distribution.

## Objective Impact

The umbrella migration ledger and roadmap no longer treat Vibe check / `vibechk` as unstarted. The next default unstarted capability is Branch retrospectives / `aretro` unless fresh evidence changes the order.

The umbrella Objective remains open: `aretro`, `packagechk` evidence, migration-debt review, and final migration cleanup remain live.

## Follow-Ups

- Use `.asdl/objectives/vibechk-v1/` or narrower follow-up Objectives for missing `vibechk` product features: `publish`, `codex`, `pi`, and real publish smoke evidence.
- Consider a later focused context rebaseline for `@asdl/vibechk`; this cutover intentionally did not update `CONTEXT-MAP.md` after identifying that as domain-language metadata outside the implementation slice.
- Continue the default migration sequence with `aretro` unless new evidence changes capability order.
