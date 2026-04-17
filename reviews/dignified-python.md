# Dignified Python

## Description

Enforce twerk's "dignified Python" coding standards on the supplied diff.
Flag concrete violations that a human reviewer would otherwise call out in PR
review: modern typing, LBYL error handling, pathlib usage, ABC-based
interfaces, and other production-tested patterns. This reviewer is intended
for cheap, per-diff detection; resolution stays with the engineer in their
normal higher-context workflow.

## Instructions

Review only the supplied diff. Ignore existing code that the diff does not
touch. Only flag a finding when you can point to a specific line (or small
range) in the diff and tie it to one of the rules below.

Rules to enforce:

1. **Modern type syntax.** Use `str | None`, not `Optional[str]`. Use
   `list[...]` / `dict[...]` / `tuple[...]`, not `typing.List/Dict/Tuple`.
   Reject `Union[...]` when a `|` union is possible.
2. **LBYL over EAFP for expected conditions.** Prefer explicit guards
   (`if path.exists(): ...`) over broad `try/except` for conditions the
   caller can check up front. Reserve exceptions for genuinely exceptional
   cases, not for control flow.
3. **`pathlib.Path` over `os.path`.** Flag `os.path.join`, `os.path.exists`,
   `os.path.isdir`, raw string path manipulation, or `open(str_path)` when a
   `Path` would be clearer.
4. **ABC-based interfaces for gateways / seams.** When the diff introduces
   a class that wraps external I/O (subprocess, filesystem, network, process
   state), flag it if the class is concrete-only — there should be an ABC
   with a real + fake implementation pair.
5. **Frozen dataclasses or Pydantic models for data.** Flag plain mutable
   dataclasses (no `frozen=True`) and `NamedTuple`s used as data carriers.
   Prefer `@dataclass(frozen=True)` or Pydantic models.
6. **No bare `except:` or `except Exception:` without a comment.** Broad
   exception handlers should either narrow the exception type or include a
   short comment explaining why broadness is needed.
7. **No mutable default arguments.** Flag `def f(x=[]):` and similar.
8. **Public API doesn't leak privates.** Flag `__init__.py` files in this
   repo that re-export symbols or use `__all__` (this repo's convention is
   that `__init__.py` files are empty; import from the canonical module).
9. **No placeholder / half-finished code.** Flag `TODO`, `FIXME`,
   `raise NotImplementedError(...)` stubs, or `pass` bodies that ship
   features the PR claims to deliver.

For each finding, return JSON in the following shape:

```json
{
  "findings": [
    {
      "path": "packages/foo/bar.py",
      "line": 42,
      "severity": "warning",
      "summary": "Use pathlib.Path instead of os.path.join",
      "details": "Line 42 calls os.path.join(); the surrounding code already has a Path. Prefer Path(...) / 'name' for consistency with the dignified-python standard."
    }
  ]
}
```

`severity` must be one of `info`, `warning`, or `error`. Use `error` for
violations that would fail review outright (e.g. mutable defaults in public
APIs). Use `warning` for conventions the team enforces but that are
survivable. Use `info` sparingly, for patterns worth noting but not fixing.

If there are no violations in the diff, return:

```json
{"findings": []}
```

Do not return prose. Do not speculate about code outside the diff.

## Default Model

sonnet
