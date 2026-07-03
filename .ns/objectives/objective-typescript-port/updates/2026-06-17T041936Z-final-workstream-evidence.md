# Final workstream evidence gathered

## Summary

Fresh pre-stack evidence was gathered so the remaining Objective TypeScript port work can be planned as one coordinated `objective-stack-impl` session instead of stopping at the earlier plugin-retirement steering gate.

Repository state at evidence time:

- Working tree and staged diff were clean before Objective tracking edits.
- Current branch was `master` at `859c770e3` (`Remove the pr-address workflow engine and keep downloader-only surfaces`).
- Graphite parent lookup was unavailable because the checkout was on trunk; current-branch PR evidence was unavailable because `gh pr view` found no PR for `master`.
- Plain-git base against `origin/master` was the current HEAD, with no branch diff.

Cutover evidence:

- `objective list --minimal --format md` showed `objective-typescript-port` as an active open Objective.
- `objective exec read-objective objective-typescript-port --format md` confirmed active root `.asdl/objectives/objective-typescript-port`, state `open`, and no `closed.md`.
- `command -v objective` resolved to `.venv/bin/objective`; `objective --runtime` reported `runtime: python` and `entry_point: asdl_objectives.main:main`.
- Direct TypeScript source invocation works: `node ts/packages/objective/src/cli.ts --runtime` reported `runtime: typescript`, and `node ts/packages/objective/src/cli.ts list --minimal --format json` emitted the expected machine envelope against this checkout.
- Fresh grep outside Objective records found no active skill/Pi/CCC callers of `asdl objective`; remaining non-historical references are docs-site install prose and the Python plugin implementation/test path.
- Fresh grep identified the first-party JSON consumers that must be preserved or migrated during cutover: `ts/packages/pi-extension-runtime/src/objective-list.ts` for `objective list --minimal --format json`, `ts/packages/ccc/src/cmux/objective-sidebar.ts` for list/read validation JSON, and `ts/packages/pi-extensions/src/objective.ts` for `objective exec list-candidates --format json` typeahead.
- `ts/packages/objective/src/cli.ts` still registers `legacyMachine` shims for `list`, `exec list-candidates`, `exec read-objective`, and `exec runner-subagent-usage`, so JSON-envelope cutover should be deliberate rather than opportunistic.
- Current Python package/deletion targets are explicit: root `pyproject.toml`, `justfile`, `tests/scenario/test_plugins.py`, `packages/asdl-objectives/`, and docs-site install prose still contain active Python package/plugin/install references.

Validation evidence gathered before this update:

- `pnpm --dir ts --filter @asdl/objective run check` passed.
- `pnpm --dir ts --filter @asdl/objective run test` passed.
- `uv run pytest tests/scenario/test_plugins.py::test_objective_plugin_integration packages/asdl-objectives/tests -q` passed, confirming the current Python/plugin baseline before deletion.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test` passed.

## Objective Impact

The Objective has been enriched for a single future stack-implementation session. The previous steer-first blocker for plugin retirement is now resolved as planning evidence: the roadmap records the current grep results, JSON consumer inventory, install/deletion targets, rollback/reference requirement, and expected branch shape for the final stack.

The remaining work is now framed as a coordinated stack:

1. Retire the `asdl objective` plugin path and coordinate JSON-envelope consumers.
2. Migrate callers, docs, and install recipes to the TypeScript-backed standalone `objective` source shim.
3. Record rollback/reference evidence and delete `packages/asdl-objectives` plus stale Python workspace references.
4. Feed any reusable migration lesson into the umbrella Objective and close this Objective if the closure gate is clear.

This update does not complete any remaining roadmap row by itself; it converts stale steering requirements into durable evidence and execution guidance for the upcoming `objective-stack-impl` run.

## Follow-Ups

- Run `objective-stack-impl objective-typescript-port` with a preview that plans the remaining workstream as a small Graphite stack, likely 2-3 branches.
- Keep PR submission out of scope unless separately requested.
- During the final stack, record a Semantic Update after plugin/JSON cutover, install/caller migration, Python deletion/rollback-reference evidence, and final closure readiness.
