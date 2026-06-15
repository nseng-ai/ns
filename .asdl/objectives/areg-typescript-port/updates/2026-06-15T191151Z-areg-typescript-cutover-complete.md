# areg TypeScript Cutover Complete

## Summary

`areg-typescript-port` is complete. The active `areg` CLI surface is TypeScript-backed through `ts/packages/areg` and the repo-local shim/source invocation model.

Completion evidence verified during closure:

- `node ts/packages/areg/src/cli.ts --runtime` reports `runtime: typescript`.
- `areg --runtime` and `uv run areg --runtime` resolve to the TypeScript-backed shim/path in this checkout.
- `just areg-check` passes with `All skills OK.` using `node ts/packages/areg/src/cli.ts check --path ...`.
- `pnpm --dir ts/packages/areg run check` passes.
- `pnpm --dir ts/packages/areg run test` passes.
- `git ls-files packages/areg` is empty.
- `pyproject.toml` no longer includes `areg` in uv workspace/dev/source, Python lint/type, or pytest paths.
- Empty untracked `packages/areg` directories were removed during closure verification.

The deleted Python implementation's rollback/reference point is in-repo commit `18f25c34720f2422881afe93084d569f0d071dfd`, the parent of deletion commit `eb5785fc3`.

## Objective Impact

All remaining non-parked roadmap work in this Objective is complete:

- Post-kind review consolidation was triaged as non-blocking for Python removal; broader cleanup now lives in `areg-ts-cli-cleanup`.
- Repo-local callers use TypeScript `areg`.
- Python `packages/areg` is removed from tracked active paths and workspace configuration.
- External distribution beyond repo-local TypeScript shims is explicitly deferred as a future product decision, not a Python-retention blocker.
- The parent `port-asdl-toolkit-to-typescript` Objective records `areg` as the completed out-of-sequence TS-default cutover and captures reusable lessons.

The Objective was closed with `closed.md`; future `objective-next` should not select it by default.

## Follow-Ups

- Continue post-migration areg CLI structural cleanup in `.asdl/objectives/areg-ts-cli-cleanup/`.
- Treat npm/check-out-free distribution for `areg` as a future product decision if real consumers require it.
- Resume the umbrella TypeScript migration's default next capability, `objective`, unless new evidence changes the sequence.
