# Final Cutover and Python Deletion

## Summary

The Objective CLI cutover is complete in the prospective landed state. The public `objective` command now uses the TypeScript source-shim install model, `asdl objective` is retired, JSON-envelope compatibility is deliberately preserved through Objective-local `legacyMachine` projections, and the Python package path `packages/asdl-objectives/` has been deleted.

Cutover evidence:

- `just install-objective` installs the source shim for `ts/packages/objective/src/cli.ts` and removes the stale project `.venv/bin/objective` script.
- `command -v objective` resolves to the installed shim, and `objective --runtime` reports `runtime: typescript`.
- `tests/scenario/test_plugins.py` no longer imports `asdl_objectives` or tests an `asdl objective` plugin surface.
- `pyproject.toml`, `justfile`, and `uv.lock` no longer carry the Python Objective workspace/source/dev/plugin/test/build/Ruff/ty references.
- Docs now describe Objective as a TypeScript source-shimmed standalone CLI instead of `uv tool install asdl-objectives` or `asdl objective`.
- Full TS and Python validation passed; docs validation passed after installing docs dependencies.

Rollback/reference evidence: the pre-deletion reference point is commit `1b1bb1fa44ad`. The exact deleted path is `packages/asdl-objectives/`. If rollback is needed, restore the Python implementation and removed root references with:

```bash
git checkout 1b1bb1fa44ad -- packages/asdl-objectives pyproject.toml justfile tests/scenario/test_plugins.py uv.lock
```

Because this implementation session was not authorized to create commits, the pre-deletion reference is the branch HEAD before local cutover/deletion edits rather than a new checkpoint commit containing the intermediate install/plugin migration state.

## Objective Impact

All non-parked roadmap work for `objective-typescript-port` is now complete:

- TypeScript standalone Objective parity existed before this slice and remained green.
- The `asdl objective` plugin path is retired rather than preserved.
- First-party Pi/CCC JSON consumers remain compatible through the retained Objective-local `legacyMachine` projections.
- The local install model is TypeScript-backed and follows the source-shim precedent used by other completed TS cutovers.
- The Python fallback/package path is deleted only after install/docs/plugin/manifest references were removed and rollback evidence was recorded.
- The umbrella TypeScript migration Objective now records Objective as a completed TS-default capability and tracks the retained Objective-local legacy JSON projection as migration debt.

The final stale-reference grep finds no active Objective Python package references outside `CONTEXT-MAP.md`, which is domain-language drift for the deleted package path and should be handled deliberately in a context/documentation session rather than silently edited as part of this cutover.

## Follow-Ups

- Handle `CONTEXT-MAP.md` drift in a deliberate domain-language/context update.
- Burn down the Objective-local `legacyMachine` projection later by migrating Pi/CCC consumers to the desired canonical Objective JSON shape and removing `ts/packages/objective/src/operations/legacy-machine.ts`.
