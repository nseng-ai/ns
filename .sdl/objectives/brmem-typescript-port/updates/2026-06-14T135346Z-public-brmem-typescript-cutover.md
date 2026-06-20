# Public brmem TypeScript Cutover

## Summary

Cut over public `brmem` invocation and generic TypeScript shell-out defaults to the TypeScript implementation.

The branch adds `ts/packages/brmem/scripts/brmem-shim`, installed by `just install-brmem`, following the accepted run-from-source shim model: inside an asdl checkout the enclosing checkout wins, outside a checkout the baked canonical checkout is used, and missing `ts/node_modules` or missing checkout paths fail with clear `brmem` diagnostics. `just install-tools` now depends on `install-brmem` and no longer installs `packages/brmem` as an editable Python `uv` tool.

Generic `@asdl/core/brmem-cli` shell-out resolution is now PATH-only (`brmem`) with diagnostics telling users to install the TypeScript-backed shim via `just install-brmem` or `just install-tools`; it no longer tries `.venv/bin/brmem` or `uv run brmem`. CCC worktree-status tests were updated to lock in the no-Python-fallback behavior, and the CCC dispatch-prompt launch command now reads payloads with PATH `brmem` only rather than embedding a Python `uv run brmem` fallback.

Public docs were refreshed: the canonical `skills/brmem/SKILL.md` now describes the TypeScript-backed shim install/runtime and current `--stdin` plus JSON behavior, installed skill copies match it, `ts/packages/brmem/README.md` documents the TypeScript package and shim distribution model, and `packages/brmem/README.md` marks the Python package as a retained reference/fallback parity oracle rather than the public default.

Validation evidence:

```text
pnpm --dir ts exec vitest run --config vitest.config.ts packages/asdl-core/test/brmem-cli.test.ts packages/brmem/test/wrapper/brmem-shim.test.ts
pnpm --dir ts/packages/brmem run check
pnpm --dir ts/packages/brmem run test
pnpm --dir ts run check
pnpm --dir ts run test
dprint check
just
```

A manual rendered-shim smoke also confirmed `brmem --runtime` reports the TypeScript entry point. An isolated-`HOME` `just install-brmem` smoke was not used as final evidence because changing `HOME` changed Corepack/pnpm cache and store selection, producing pnpm version/store prompts unrelated to the shim; `just --dry-run install-tools` confirmed the recipe shape without mutating the user's real tool install.

## Objective Impact

The roadmap row `Cut over the public skill, wrapper, and distribution paths to the TypeScript default` is now complete. Public `brmem` defaults, installed-skill guidance, distribution docs, and generic shell-out consumers now point at the TypeScript CLI while preserving the Branch Memory command surface, JSON-envelope shape, exit-code behavior, and git-ref storage semantics already ported in earlier rows.

This does not delete `packages/brmem`, remove Python parity tests, remove CI Python/`uv` setup, publish to npm/PyPI, or migrate consumers to native `@asdl/brmem` library calls. Those remain separate follow-up boundaries.

## Follow-Ups

- Retire the Python fallback/reference package in the next roadmap row once the deletion gates are satisfied.
- When retiring Python, remove the parity-only Python/`uv` setup from the TypeScript CI job alongside the Python parity tests.
- Feed the brmem porting and shim-cutover lessons into the umbrella TypeScript porting playbook after the active fallback retirement work is complete.
