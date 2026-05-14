# Package Skeleton Wired

## Summary

PR 2 is complete. The new `asdl-objectives` package now exists with a standalone `objective` CLI, an `asdl.plugins` entry point, an outer `objective` group, and a hidden empty `exec` subgroup for future skill-facing operations.

The root workspace, plugin optional dependency, dev dependency group, Ruff source configuration, pytest testpaths, and `uv.lock` now include the package. Scenario tests cover standalone help/version behavior and hidden-but-invocable `exec` help, while the top-level plugin smoke tests cover plugin discovery mounting.

Verification passed with:

- `uv run pytest packages/asdl-objectives/tests/scenario tests/scenario/test_plugins.py`
- `just`

## Objective Impact

This establishes the CLI package boundary needed before implementing the read-oriented `objective exec` commands. The slice stayed intentionally narrow: it did not add `objective exec list`, `read-objective`, or `tracking-gate-facts`; did not parse Markdown; did not inspect git, Graphite, or brmem; and did not mutate objective files from the new package.

The package-skeleton assumption is now partially confirmed, and the new-package maintenance risk is reduced by following the existing standalone/plugin/scenario-test conventions with a green full suite.

## Follow-Ups

- Implement `objective exec list` in PR 3 with JSON and Markdown filesystem inventory.
- Keep the `exec` subgroup hidden as operations are added.
- Preserve the no-meaning/no-mutation boundary when adding the first real command.
