# asdl_core.clinkr

Treat this subpackage as if it were its own package that the rest of `asdl-core` depends on. It is designed to be straightforwardly extractable into a standalone `clinkr` package if needed.

## Rules

- **Dependency direction is one-way**. The rest of `asdl-core` may import from `asdl_core.clinkr`. `asdl_core.clinkr` must not import from anywhere else in `asdl-core`.
- **No imports from parent `asdl_core`** or any sibling subpackage (e.g. `asdl_core.gh`).
- **Stdlib + `click` + `pydantic` only**. All other imports must be from the Python standard library, `click`, or `pydantic`. Do not add new third-party dependencies without promoting clinkr to its own package first.
- **Self-contained tests**. Tests for clinkr must not depend on other `asdl_core` subpackages.

## Operation return contract (`ClinkrExit[T]`)

Operations return `ClinkrExit[T]`. The exit tag determines the CLI exit code in both human and machine modes:

- `ClinkrExit.ok(data)` → exit 0; renderer runs in human mode; machine envelope is `{"exit_code": 0, "data": ...}`.
- `ClinkrExit.negative(data, message=...)` → exit 1; `message` goes to stderr in human mode; machine envelope is `{"exit_code": 1, "message": ..., "data": ...}`. Use for "ran to completion, answered no" (not found, empty, false predicate).
- `ClinkrExit.failure(error_type=..., message=...)` → exit 2; `error:` prefix on stderr in human mode; machine envelope is `{"exit_code": 2, "error_type": ..., "message": ...}`. Use for invalid input, gateway failure, or other unrecoverable command errors.

The `@clinkr_operation` decorator reads the request and return annotations. Requests must subclass Pydantic `BaseModel`; results must be Pydantic-compatible `ClinkrExit[T]` payloads.

## Domain errors vs `ClinkrExit`

`ClinkrExit` is a CLI concern. It encodes `error_type` / `message` / exit code for a user-facing command and is constructed only at the CLI boundary.

- Domain helpers (resolvers, gateway-adjacent utilities, anything reusable below the CLI) return sum types that describe _what went wrong_ in domain terms: frozen dataclasses or sentinels such as `DetachedHead`, `GitCommandFailure`, `NoSlugOnBranch`, `AmbiguousSlug`. The return type is `Result | Error1 | Error2 | …`, matched at the caller.
- Only CLI entry points (`run_*` operations, `@clinkr_operation`-decorated functions, and the CLI-layer helpers they directly call) translate to a CLI exit shape.
- At the CLI boundary, translate domain errors into a failure by raising `ClinkrFailure(error_type=..., message=...)` with stable `error_type` strings. Keep the match arms explicit at each entry point so error wording stays visible and grep-able.
- Do not sneak `ClinkrExit` into domain helpers "for convenience." A helper that returns `ClinkrExit` drags the CLI shape into every other consumer (tests, other commands, future non-CLI callers) and couples domain logic to the exit protocol.

The same principle applies to other context-specific error shapes (HTTP responses, JSON envelopes, structured logging records): domain code returns domain errors; translation happens where the context is known.

## Failures: raise `ClinkrFailure`, do not construct `ClinkrExit.failure`

Operation bodies and the CLI-layer helpers they call must signal failures by raising `ClinkrFailure` rather than constructing `ClinkrExit.failure(...)`. The dispatcher catches `ClinkrFailure` at the CLI boundary and converts it into the `ClinkrExit.failure` envelope (exit code 2, matching `error_type` and `message`). Constructing `ClinkrExit.failure(...)` directly inside operation code leaks the CLI envelope shape into places that should only know about "this failed."

## Precondition idiom: `Ensure`

The canonical guard-clause idiom is the `Ensure` helper namespace. Every helper raises `ClinkrFailure` on violation; the dispatcher converts that into `ClinkrExit.failure(...)` at the CLI boundary.

```python
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.failure import ClinkrFailure

# Boolean precondition.
Ensure.true(
    request.file is not None,
    error_type="file_required",
    message="Pass --file or --stdin.",
)

# Truthy precondition; returns the value for chaining.
slug_entries = Ensure.truthy(
    [e for e in entries if e.key.startswith(prefix)],
    error_type="slug_not_seeded",
    message=f"No entries for {slug!r}.",
)

# Optional → T narrowing.
source_path = Ensure.not_none(
    request.file or _default_source(request.key),
    error_type="source_file_missing",
    message="Cannot infer a default --file; provide --file or --stdin.",
)

# Sum-type → concrete type narrowing.
envelope = Ensure.inst(
    parsed,
    dict,
    error_type="malformed_plan_file",
    message="Plan file must be a JSON object envelope.",
)

# Unconditional fail (NoReturn). Use after an isinstance/match guard has
# already narrowed onto a failure arm, or as the terminator of an
# exhaustive guard chain. Type checkers narrow past this call.
if isinstance(result, SelectorError):
    Ensure.fail(error_type="invalid_slot_num", message=result.message)

# Explicit raise in an except arm — `Ensure.fail` does not chain causes,
# so keep `raise ClinkrFailure(...) from exc` when you need `from exc`.
try:
    raw = Path(source_path).read_bytes()
except FileNotFoundError as exc:
    raise ClinkrFailure(
        error_type="source_file_missing",
        message=f"Source file not found: {source_path}",
    ) from exc
```

`ClinkrExit.ok(...)` and `ClinkrExit.negative(...)` continue to be returned (or, for `negative`, raised) from operation bodies as before — only the `failure` constructor moves behind `ClinkrFailure` and the `Ensure` helpers.

## `NonIdealState`: collapse domain-failure match blocks

When a domain helper returns a sum type whose error arms each carry a CLI-ready `message`, the failure-narrowing match block at the CLI boundary collapses to a single `Ensure.ideal_state(...)` call.

`NonIdealState` is a `@runtime_checkable` Protocol in `asdl_core.clinkr.non_ideal_state`. A failure type qualifies structurally by exposing a `message: str` (as a field or `@property` method); no inheritance required. The Protocol's runtime discriminator is therefore "has a `message` attribute" — this is acceptable because every call site passes an explicit union (`Slug | NoSlugOnBranch | …`) into `Ensure.ideal_state`, and success arms in those unions do not expose `message`.

The CLI translation tag (`error_type`) is derived from the class name by `error_type_for`: `ClaudeCodeInvalidJson` → `"claude_code_invalid_json"`, `DetachedHead` → `"detached_head"`. A failure type that needs a different tag (e.g. an entrenched CLI string, or a context-overridable field) can expose an `error_type: str` attribute as an override; `error_type_for` honors that attribute when present.

```python
# Domain layer (asdl_core.git.types):
@dataclass(frozen=True)
class GitCommandFailure:
    message: str
    returncode: int | None
    # Override-via-field: pins the CLI tag at "git_failed" instead of the
    # derived "git_command_failure"; callers may also pass a per-context
    # tag at construction time.
    error_type: str = "git_failed"

@dataclass(frozen=True)
class DetachedHead:
    # No `error_type`; derived as "detached_head" from the class name.
    @property
    def message(self) -> str:
        return "Detached HEAD: requires a checked-out branch."

# CLI layer:
slug_resolution = Ensure.ideal_state(resolve_slug(mctx, request.slug))
slug = slug_resolution.slug
```

`error_type` is fundamentally a CLI concern; derivation from the class name keeps domain failure types free of CLI boilerplate. Domain code still does not import `ClinkrExit` or construct CLI envelopes — `NonIdealState` is just a shape contract for translation. Failure types that need an entrenched or context-specific tag use the `error_type` field as an override (see `GitCommandFailure` above).

When wording is genuinely caller-specific (e.g. a `DetachedHead` arm with a per-operation suffix), keep the explicit `if isinstance(...): raise ClinkrFailure(...)` block at the call site — `Ensure.ideal_state` is the right tool only when the failure type owns canonical wording.
