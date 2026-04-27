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
- `ClinkrExit.failure(error_type=..., message=..., data=...)` → exit 2; `error:` prefix on stderr in human mode; machine envelope is `{"exit_code": 2, "error_type": ..., "message": ..., "data": ...}` (data optional). Use for invalid input, gateway failure, or partial-success-with-structured-detail.

The `@clinkr_operation` decorator reads the return annotation and rejects anything that is not `ClinkrExit[T]`.

## Domain errors vs `ClinkrExit`

`ClinkrExit` is a CLI concern. It encodes `error_type` / `message` / exit code for a user-facing command and must only be built by CLI-layer code.

- Domain helpers (resolvers, gateway-adjacent utilities, anything reusable below the CLI) return sum types that describe _what went wrong_ in domain terms: frozen dataclasses or sentinels such as `DetachedHead`, `GitCommandFailure`, `NoObjectiveOnBranch`, `AmbiguousObjective`. The return type is `Result | Error1 | Error2 | …`, matched at the caller.
- Only CLI entry points (`run_*` operations, `@clinkr_operation`-decorated functions, and the CLI-layer helpers they directly call) may construct `ClinkrExit`.
- At the CLI boundary, translate domain errors into `ClinkrExit.failure(...)` with stable `error_type` strings. Keep the match arms explicit at each entry point so error wording stays visible and grep-able.
- Do not sneak `ClinkrExit` into domain helpers "for convenience." A helper that returns `ClinkrExit` drags the CLI shape into every other consumer (tests, other commands, future non-CLI callers) and couples domain logic to the exit protocol.

The same principle applies to other context-specific error shapes (HTTP responses, JSON envelopes, structured logging records): domain code returns domain errors; translation happens where the context is known.
