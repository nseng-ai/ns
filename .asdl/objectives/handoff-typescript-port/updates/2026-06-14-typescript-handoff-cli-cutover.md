# TypeScript Handoff CLI Cutover

## Summary

Implemented the TypeScript `@asdl/handoff` package through the standalone CLI cutover slice while preserving the current public handoff model: `handoff list`, `handoff delete`, and `handoff gc` are TypeScript-backed operations over Branch Memory storage; create and pickup remain Pi/skill workflows.

The package now includes source, curated exports, package context, a fake-driven Handoff Branch Memory gateway, package-local real gateway over the public `brmem` CLI plus read-only git timestamp plumbing, scenario tests for list/delete/gc contracts, gateway coverage, and a run-from-source `handoff` shim. Public install docs/config now include `just install-handoff`, and `just install-tools` installs the TypeScript handoff shim instead of uv-installing the Python package as the standalone command provider.

Implementation evidence found and fixed one cutover risk: in an activated dev environment, stale `.venv/bin/handoff` could shadow `~/.local/bin/handoff` and keep bare `handoff --runtime` on Python. `just install-handoff` now removes that stale project-venv console script after installing the shim, without deleting `packages/asdl-handoff` or disabling the Python `asdl.plugins` path.

Validation passed:

```bash
pnpm --dir ts/packages/handoff run check
pnpm --dir ts/packages/handoff run test
pnpm --dir ts run check
pnpm --dir ts run test
dprint check
just install-handoff
handoff --runtime
handoff --help
handoff list --format json
just
```

`handoff --runtime` reports `runtime: typescript` and `entry_point: @asdl/handoff bin handoff -> ts/packages/handoff/src/cli.ts` after the install recipe removes the stale venv script.

## Objective Impact

The roadmap rows for scaffolding `ts/packages/handoff`/porting `list`, porting `delete`, porting `gc`, and cutting over the public shim/docs/install path are complete based on local implementation and validation evidence.

The Objective remains open because the Python package/plugin deletion row and umbrella Objective closeout remain undone. `packages/asdl-handoff` is intentionally still present, root Python config/plugin smoke references remain expected until the later deletion PR, and no `handoff create` or `handoff pickup` CLI commands were introduced.

The run-from-source shim assumption remains valid with the added implementation lesson that stale project-venv console scripts must be removed during install when a Python fallback package remains in the repository.

## Follow-Ups

- Retire the Python fallback and remove the `asdl handoff` plugin path in the next explicit deletion PR after re-running the `asdl handoff` inventory grep.
- Remove Python workspace/config/test/publish references only during that deletion PR, not in this cutover slice.
- Feed Handoff lessons into the umbrella TypeScript migration Objective after the Python package/plugin deletion is complete.
