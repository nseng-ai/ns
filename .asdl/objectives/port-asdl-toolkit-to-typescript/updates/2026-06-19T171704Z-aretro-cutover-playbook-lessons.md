# Semantic Update: aretro cutover and playbook lessons

## Summary

Branch retrospectives / `aretro` completed the final persisted default capability in the TypeScript migration sequence. Standalone TypeScript `@asdl/aretro` is now the active deterministic evidence CLI for the `branch-retro` skill, and the Python `packages/aretro` implementation plus Python fallback routing are retired from active repo paths.

## Cutover evidence

- Child Objective: `.asdl/objectives/aretro-typescript-port/`.
- Rollback/reference commit before deleting the Python package: `dd1c69ac85f9f836a9c12cd1da219099a2683273`.
- Runner distribution: `skills/branch-retro/scripts/aretro-run` uses the repo-local TypeScript source CLI when available, otherwise a PATH `aretro` command, otherwise fails with a TypeScript-shim installation hint.
- Accepted install model: opt-in `just install-aretro`; no `install-tools` addition, npm publish, or checkout-free replacement for the retired Python `uvx` path was added because no active consumer evidence required it.
- Retired active Python paths: `packages/aretro/**`, root Python workspace/source/dev/test/Ruff/ty/publish references, editable `uv.lock` package entry, stale Python plugin smoke-test reference, `uv run aretro`, `uvx --from aretro`, `ASDL_ARETRO_MODE`, and `ASDL_ARETRO_VERSION`.
- Boundary preserved: deterministic evidence and sanitized payload/reference reads stay in the CLI; semantic diagnosis and recommendation prose stay in `branch-retro`.

## Playbook lessons

- A deterministic evidence/privacy boundary can survive language retirement when the Objective inventories factual evidence kinds, payload-reference behavior, and raw-transcript non-leakage as durable contracts before deleting the reference implementation.
- Package-local session-source, evidence aggregation, and payload-store seams are appropriate until a second capability proves the same sanitized-session abstraction. Ordinary git facts can still move to shared `@asdl/core/git` when repeated evidence exists.
- A skill runner can retire Python fallback knobs in favor of repo-local TypeScript source plus a PATH shim when no real checkout-free consumer exists. That distribution choice should be recorded as product evidence, not assumed from previous ports.
- Rollback/reference evidence for a deleted private Python package can be an in-repo pre-deletion commit when there is no external registry artifact to preserve.

## Objective impact

The migration ledger now marks Branch retrospectives / `aretro` as `TS-default; completed default cutover`. The persisted default capability sequence has no remaining unstarted capability; remaining umbrella work should focus on final cleanup, parked/out-of-scope Python paths, and any end-of-migration debt rather than another default port.
