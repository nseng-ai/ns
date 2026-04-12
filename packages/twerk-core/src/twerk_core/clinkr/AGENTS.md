# twerk_core.clinkr

Treat this subpackage as if it were its own package that the rest of `twerk-core` depends on. It is designed to be straightforwardly extractable into a standalone `clinkr` package if needed.

## Rules

- **Dependency direction is one-way**. The rest of `twerk-core` may import from `twerk_core.clinkr`. `twerk_core.clinkr` must not import from anywhere else in `twerk-core`.
- **No imports from parent `twerk_core`** or any sibling subpackage (e.g. `twerk_core.gh`).
- **Stdlib + `click` only**. All other imports must be from the Python standard library or `click`. Do not add new third-party dependencies without promoting clinkr to its own package first.
- **Self-contained tests**. Tests for clinkr must not depend on other `twerk_core` subpackages.
