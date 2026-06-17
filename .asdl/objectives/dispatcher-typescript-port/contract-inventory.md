# Dispatcher Contract Inventory

## Summary

`asdl-dispatcher` is currently a first-party Python workspace package with a standalone `dispatcher` console script and an `asdl.plugins` plugin entry point. The source and tests show a placeholder CLI/plugin surface, not an implemented dispatch capability.

Recommended next action: do not create a TypeScript package yet. Treat dispatcher as a placeholder capability whose next semantic work is either a tiny TypeScript placeholder port or deliberate retirement, chosen after stakeholder or consumer evidence confirms whether the placeholder command/plugin must survive the migration.

## Source Contract

- `packages/asdl-dispatcher/pyproject.toml`
  - package name: `asdl-dispatcher`
  - console script: `dispatcher = "asdl_dispatcher.cli.main:main"`
  - plugin entry point: `dispatcher = "asdl_dispatcher.cli.plugin:build_dispatcher_plugin"`
- `packages/asdl-dispatcher/src/asdl_dispatcher/cli/main.py`
  - builds and invokes the standalone CLI through `asdl_core.plugin` helpers.
  - package metadata uses `package_name="asdl-dispatcher"` and `entry_point="asdl_dispatcher.cli.main:main"`.
- `packages/asdl-dispatcher/src/asdl_dispatcher/cli/plugin.py`
  - exposes an `AsdlPluginSpec` with `build_group=build_dispatcher_group` and `context_factory=build_dispatcher_context`.
- `packages/asdl-dispatcher/src/asdl_dispatcher/cli/dispatcher/group.py`
  - builds `ClinkrGroup(name="dispatcher", help="Dispatch coding tasks to GitHub Actions.", operations=[])`.
  - the empty `operations=[]` list is the key placeholder evidence.
- `packages/asdl-dispatcher/src/asdl_dispatcher/cli/dispatcher/context.py`
  - defines an empty frozen `DispatcherCliContext`.
  - `build_dispatcher_context()` returns the empty context; there are no gateways or dispatch state.

## Test Contract

`packages/asdl-dispatcher/tests/scenario/test_dispatcher_cli.py` covers only discoverability:

- standalone help: `dispatcher -h` exits 0, includes `Usage: dispatcher`, the GitHub Actions dispatch help string, and `--version`.
- standalone version: `dispatcher --version` exits 0 and prints version text.
- plugin mount: a fake `asdl.plugins` entry point for `asdl_dispatcher.cli.plugin:build_dispatcher_plugin` mounts under a parent command and responds to `dispatcher --help`.

There are no operation behavior tests because the group has no operations.

## Workspace, Build, and Test References

The package remains wired into the Python workspace and developer tooling:

- root `pyproject.toml` includes `packages/asdl-dispatcher` in the workspace and package sources/test paths.
- root `pyproject.toml` includes `asdl-dispatcher` in editable/dev dependency groups.
- `justfile` includes `asdl-dispatcher` in the `uv build` package set.
- `CONTEXT-MAP.md` explicitly tracks `packages/asdl-dispatcher/CONTEXT.md` as out of scope while the group has `operations=[]`.

These references are build/test configuration, not evidence of active user-facing dispatch behavior. They would still need a deliberate cleanup plan if the package is retired.

## Caller Discovery Findings

Targeted search command used:

```bash
rg -n "asdl-dispatcher|asdl_dispatcher|dispatcher" pyproject.toml justfile packages tests docs-site skills .pi ts .asdl/objectives
```

Active caller evidence found:

- none beyond the package's own CLI/plugin tests and workspace/build wiring.

Non-caller or incidental evidence found:

- Clinkr internals and documentation use "dispatcher" generically for command dispatch/failure-envelope behavior.
- TypeScript Clinkr tests and Pi runner-subagent tests use dispatcher terminology unrelated to `asdl-dispatcher`.
- Historical Objective records mention `asdl-dispatcher` as thin, operation-less, or out of context scope.
- No skills, Pi/CCC wrappers, docs-site promises, TypeScript packages, or Python packages import or invoke `asdl_dispatcher` outside its own package/tests.

## Durable vs Incidental Behavior

Durable current behavior:

- the `dispatcher` command exists as a standalone CLI;
- `dispatcher -h` exposes the command name and help text;
- `dispatcher --version` works through the standalone wrapper;
- the `dispatcher` plugin entry point can mount under a parent `asdl` command.

Incidental current behavior:

- no operation names, arguments, JSON schemas, dispatch payloads, GitHub Actions interactions, or gateway contracts exist;
- the empty `DispatcherCliContext` has no consumer-facing semantics;
- root workspace/build references only prove the package is included in local development, not that users rely on it.

## Port or Retire Fork

Port the placeholder to TypeScript only if current or near-term consumers need the `dispatcher` command/plugin to keep existing help/version/plugin discoverability during the migration.

Retire the placeholder if no consumer needs that discoverability. Retirement should intentionally remove `packages/asdl-dispatcher`, root workspace/dev/test/build references, and any plugin entry point expectations, with a parent Objective update explaining that no dispatch behavior existed to preserve.

Do not implement GitHub Actions dispatch semantics as part of either fork unless a separate product requirement defines the operations and contracts.
