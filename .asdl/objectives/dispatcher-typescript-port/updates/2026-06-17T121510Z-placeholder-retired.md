# Placeholder Retired

Retired the Python `asdl-dispatcher` placeholder instead of creating a TypeScript placeholder package.

## Decision

Choose retirement/no-port. The current package exposed only standalone `dispatcher` help/version discoverability and an `asdl.plugins` plugin mount; its `ClinkrGroup` had `operations=[]`, and its context carried no gateways or state.

Fresh caller discovery found no active consumers that import `asdl_dispatcher`, invoke `dispatcher`, depend on the dispatcher plugin mount, or require placeholder discoverability to survive. Package-specific references were limited to the package's own tests, root workspace/build/test wiring, context-map tracking language, and Objective history.

## Deleted and Removed

- Deleted `packages/asdl-dispatcher/`.
- Removed `asdl-dispatcher` from root workspace members, workspace sources, optional plugin dependencies, dev dependencies, Ruff `src`, Ruff `known-first-party`, and pytest `testpaths`.
- Removed `--package asdl-dispatcher` from the `justfile` publish build command.
- Regenerated `uv.lock` with the dispatcher editable package removed.
- Reworded `CONTEXT-MAP.md` so the former operation-less dispatcher placeholder is no longer described as a tracked package/context slot.

No `ts/packages/dispatcher` package was created.

## Rollback / Reference

Pre-deletion reference commit: `479da7adc`.

If future product requirements need to inspect or restore the retired placeholder, use:

```bash
git checkout 479da7adc -- packages/asdl-dispatcher pyproject.toml justfile uv.lock CONTEXT-MAP.md
```

Restoration should be paired with a fresh Objective or plan that defines real dispatch operations or a concrete consumer requirement for placeholder discoverability.

## Validation

Planned validation for this slice:

```bash
uv lock --check
just python-check
just python-test
just dprint-check
uv run pytest tests/scenario/test_plugins.py -q
uv run pytest -q --ignore-glob='*/integration/*'
objective exec read-objective dispatcher-typescript-port --format md
objective exec read-objective port-asdl-toolkit-to-typescript --format md
objective list --status all --minimal --format md | rg -n "dispatcher-typescript-port"
rg -n "asdl-dispatcher|asdl_dispatcher|packages/asdl-dispatcher|dispatcher = \"asdl_dispatcher" pyproject.toml justfile uv.lock packages tests docs-site skills .pi ts CONTEXT-MAP.md
git diff --check
```

Record final command results in the implementation closeout.

## Follow-up

Future real dispatch capability remains possible, but it should start from product requirements for concrete operations and GitHub Actions contracts rather than inheriting this retired placeholder.
