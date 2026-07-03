# TypeScript Cutover and Python Retirement

## Summary

The final stack slice made TypeScript `vibechk` the active default path and retired the Python fallback after package parity was proven.

Active docs moved to `ts/packages/vibechk/README.md` and `ts/packages/vibechk/MANUAL_E2E.md` with examples using the TypeScript `vibechk` command installed by the opt-in `just install-vibechk` source shim, plus direct Node source invocation for in-checkout development. The `install-tools` recipe deliberately does not include `install-vibechk`, because this cutover found no active installed-tool consumer requiring global default installation.

The Python package at `packages/vibechk` was deleted, and root Python workspace/build/test/publish wiring was removed from `pyproject.toml`, `uv.lock`, and `justfile`. The new `just install-vibechk` recipe removes stale `.venv/bin/vibechk` scripts so an activated Python development environment does not shadow the TypeScript command. In-repo rollback/reference evidence for the deleted Python source is commit `25c748681`, the last stack commit before Python deletion.

Validation: `uv lock --check`, targeted `@asdl/vibechk` check/tests, full TypeScript check/tests, `just ts-guard`, `just dprint-check`, `just python-check`, `just test`, and a rerun of full `just check` passed. An initial `just check` attempt hit transient timeouts in unrelated TypeScript tests after the full TypeScript suite had already passed; `just ts-test` and a subsequent full `just check` passed cleanly.

## Objective Impact

All active roadmap rows for the TypeScript port are complete. TypeScript now covers the already-implemented Python surface (`run`, `runs`, `show`, `diff`, the `claude` runner, local bundle storage, Markdown reports, and local result branch behavior), while `publish`, `codex`, `pi`, and real publish smoke evidence remain parked in the separate `vibechk-v1` Objective.

The umbrella `port-asdl-toolkit-to-typescript` Objective now records `vibechk` as TS-default with playbook lessons for schema-version-1 bundle compatibility, runner subprocess seams, safety-critical real-git coverage, opt-in source-shim distribution, and Python deletion evidence.

## Follow-Ups

- Resume missing product features (`publish`, `codex`, `pi`, and real publish smoke evidence) through `vibechk-v1` or narrower follow-up Objectives after this migration lands.
- Leave `install-vibechk` opt-in unless future consumer evidence justifies adding it to `install-tools`.
- Run a dedicated context rebaseline later if the repository wants `CONTEXT-MAP.md` to reflect the new `@asdl/vibechk` package location; this implementation branch intentionally did not edit context-map domain metadata.
