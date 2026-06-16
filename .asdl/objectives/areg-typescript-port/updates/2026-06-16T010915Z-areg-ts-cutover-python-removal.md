# areg TypeScript cutover and Python removal recorded

## Summary

The repo-local `areg` cutover has landed on the current checkout state, and the active Python implementation is gone from the repository.

Evidence inspected for this update:

- `packages/areg` is absent, and `git ls-files 'packages/areg/**'` returns no tracked Python implementation files.
- Root `pyproject.toml` no longer lists `packages/areg` in the uv workspace, dependency sources, Ruff source roots, or test paths.
- Repo searches find no active `uv run areg`, `areg.cli:main`, or `packages/areg` caller path outside historical Objective prose and TypeScript package metadata/test paths.
- `node ts/packages/areg/src/cli.ts --runtime` reports `runtime: typescript` with entry point `@asdl/areg bin areg -> ts/packages/areg/src/cli.ts`.
- `just areg-check` installs the TypeScript workspace dependencies if needed and invokes `node .../ts/packages/areg/src/cli.ts check --path ...`, reporting `All skills OK.`
- Focused TypeScript validation passed: `pnpm --dir ts/packages/areg run check` and `pnpm --dir ts/packages/areg run test`.

## Objective Impact

The roadmap now treats these rows as complete:

- post-kind consolidation blocker triage for Python removal;
- repo-local caller cutover to TypeScript `areg`;
- removal of the Python `packages/areg` implementation and uv/ruff/ty/pytest workspace wiring;
- deferral of external installed-use distribution as follow-up rather than a blocker.

The Objective remains open because reusable lessons still need to be recorded back into the parent `port-asdl-toolkit-to-typescript` Objective. Until that parent update lands, the remaining risk is ledger drift from the out-of-sequence `areg` migration.

## Follow-Ups

- Update the parent TypeScript migration Objective with reusable `areg` lessons: repo-local TS source/shim cutover, Python removal sequencing, Clinkr envelope handling for hidden helpers, and the decision to keep areg-specific skill/project seams package-local until a second consumer proves reuse.
- After the parent ledger/playbook update, rerun `objective-next` or `objective-update` to evaluate whether this Objective is ready to close.
- Keep external installed `areg` distribution parked unless a later consumer-backed decision pulls it forward.
