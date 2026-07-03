# asdl-dev subpath exports adopted

## Summary

`asdl-dev` now declares a curated package export surface for the primitives consumed across TypeScript package boundaries. Instead of preserving `asdl-dev/src/*` deep imports or collapsing all consumers into a root barrel, the package exposes explicit grep-able subpaths for the current cross-package surface: CLI bridging, checkpoint-flow primitives, pending-worktree snapshots, text-generation gateway construction, and checkpoint text-generation config selection.

`@asdl/ccc` and `@asdl/pi-extensions` now import those primitives through declared package subpaths such as `asdl-dev/checkpoint-flow`, `asdl-dev/pending-worktree`, and `asdl-dev/cli`. The Node runtime import smoke test also covers representative exported subpaths rather than undeclared source-file paths.

`asdl-dev` package tests no longer import `asdl-dev/src/*` through package self-reference. Tests of exported public primitives use the same self-reference subpaths as consumers, while tests/support for private internals use relative imports into `src/`.

Evidence: `rg 'asdl-dev/src/' ts/packages/ccc ts/packages/pi-extensions` returns no matches. Targeted checks/tests passed for `asdl-dev`, `@asdl/ccc`, and `@asdl/pi-extensions`; full TS workspace check/test passed.

## Objective Impact

The `asdl-dev` public-surface row is complete with a stricter monorepo convention than the original root-barrel plan: exports maps enforce the package boundary, and explicit subpath exports preserve one canonical grep-able import path per exported module.

This also records the agent-navigation rationale for future TS package work: in an agent-heavy codebase, path-level `rg` greppability is a first-class architectural property, so root barrels should not be the default when subpath exports better preserve module ownership and consumer discovery.

## Follow-Ups

- Consider adding mechanical lint or dependency-boundary enforcement to reject cross-package `*/src/*` imports.
- Continue the remaining `ts-cli-foundation` provider-owned row for reusable non-`pr-address` scenario-test scaffolding.
