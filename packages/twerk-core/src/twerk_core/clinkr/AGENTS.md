# twerk_core.clinkr

Treat this subpackage as if it were its own package that the rest of `twerk-core` depends on. It is designed to be straightforwardly extractable into a standalone `clinkr` package if needed.

## Rules

- **Dependency direction is one-way**. The rest of `twerk-core` may import from `twerk_core.clinkr`. `twerk_core.clinkr` must not import from anywhere else in `twerk-core`.
- **No imports from parent `twerk_core`** or any sibling subpackage (e.g. `twerk_core.gh`).
- **Stdlib + `click` only**. All other imports must be from the Python standard library or `click`. Do not add new third-party dependencies without promoting clinkr to its own package first.
- **Self-contained tests**. Tests for clinkr must not depend on other `twerk_core` subpackages.

## Operation return contract (`ClinkrExit[T]`)

Operations return `ClinkrExit[T]`. The exit tag determines the CLI exit code in both human and machine modes:

- `ClinkrExit.ok(data)` → exit 0; renderer runs in human mode; machine envelope is `{"exit_code": 0, "data": ...}`.
- `ClinkrExit.negative(data, message=...)` → exit 1; `message` goes to stderr in human mode; machine envelope is `{"exit_code": 1, "message": ..., "data": ...}`. Use for "ran to completion, answered no" (not found, empty, false predicate).
- `ClinkrExit.failure(error_type=..., message=...)` → exit 2; `error:` prefix on stderr in human mode; machine envelope is `{"exit_code": 2, "error_type": ..., "message": ...}`. Use for invalid input, gateway failure, etc.

The `@clinkr_operation` decorator reads the return annotation and rejects anything that is not `ClinkrExit[T]`.
