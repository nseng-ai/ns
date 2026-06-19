# Semantic Update: Python retirement recorded

## Summary

The final `aretro` retirement slice removed the active Python fallback and recorded the TypeScript cutover evidence. `branch-retro` now reaches `aretro` through the TypeScript source CLI in an asdl checkout or through a PATH `aretro` shim; there is no active Python `packages/aretro`, `uv run aretro`, `uvx --from aretro`, `ASDL_ARETRO_MODE`, or `ASDL_ARETRO_VERSION` path.

## Evidence

- Rollback/reference commit before deletion: `dd1c69ac85f9f836a9c12cd1da219099a2683273`.
- Deleted `packages/aretro/**` and removed root Python workspace/source/dev/test/Ruff/ty references plus the Python publish package.
- Regenerated `uv.lock`; the editable `packages/aretro` lock entry is gone.
- Removed the stale Python plugin smoke-test reference to `aretro.plugin:build_aretro_plugin`.
- Updated `docs/aretro.md` from Python-layer wording to the current deterministic TypeScript CLI boundary; docs-site install/tool pages already pointed at `just install-aretro`.
- Rewrote `skills/branch-retro/scripts/aretro-run` to prefer `ts/packages/aretro/src/cli.ts`, then PATH `aretro`, then fail clearly with a TypeScript-shim installation hint.

## Validation notes

Targeted runner checks passed:

- `./skills/branch-retro/scripts/aretro-run --runtime` reports TypeScript.
- `./skills/branch-retro/scripts/aretro-run exec collect-evidence --help` shows the TypeScript CLI help.
- Outside an asdl checkout, a fake PATH `aretro` command is invoked.
- Outside an asdl checkout with no PATH `aretro`, the runner exits nonzero and says Python `aretro` is retired.

The stale-reference grep has no remaining live Python `aretro` dependencies; remaining `packages/aretro` matches are TypeScript package paths such as `ts/packages/aretro`.

## Decision

The accepted distribution model remains the opt-in TypeScript source shim (`just install-aretro`) and repo-local TypeScript source execution. No npm publish, broad `install-tools` addition, or checkout-free replacement for the retired Python `uvx` fallback was added because no active consumer evidence required it.
