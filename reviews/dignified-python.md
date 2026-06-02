---
description: |
  Enforce asdl's "dignified Python" coding standards on the supplied diff.
  Flag concrete violations that a human reviewer would otherwise call out in
  PR review: LBYL exception handling, pathlib over os.path, absolute
  imports, no re-exports, modern type syntax, and other production-tested
  patterns. Intended for cheap, per-diff detection; resolution stays with
  the engineer in their normal higher-context workflow.
default_model: haiku
---

Review only the supplied diff. Ignore existing code that the diff does not
touch. Each finding must point to a specific line (or small range) in the
diff and tie to one of the rules below. Do not invent findings about
unchanged code.

Exclude vendored skill Python before applying any rule. Do not report findings
for `.py` files under `.agents/skills/<name>/` or `.claude/skills/<name>/`
when the skill entry is a real directory rather than a symlink to
`skills/<name>`. `.claude/skills/<name>` symlinks inherit the corresponding
`.agents/skills/<name>` classification. Those installed skill directories are
vendored. Continue reviewing first-party skill files under the canonical
`skills/<name>/` path.

Before evaluating version-sensitive rules, read `pyproject.toml` from the
repo root once to find the `requires-python` value. If the project's
minimum Python is 3.10+, the modern-typing rule applies. If
`pyproject.toml` is unreadable or lacks `requires-python`, assume 3.12.

## Tier A — mechanically detectable from the diff alone

Flag these whenever you see them in added or modified lines.

1. **Exception-as-control-flow.** Flag `try/except KeyError` wrapped
   around a simple dict access, `try/except (OSError, ValueError)` around
   path operations, and similar patterns where LBYL would work. Correct
   shapes: `if key in mapping`, `mapping.get(key, default)`, `if
   path.exists()` before `.resolve()` / `.is_relative_to()`.
2. **Path `.resolve()` or `.is_relative_to()` without a prior
   `.exists()` check.** The golden rule: check existence first.
3. **`os.path.*` instead of `pathlib`.** Flag `os.path.join`,
   `os.path.exists`, `os.path.isdir`, `os.path.expanduser`, and
   `open(string_path, ...)` on a path that would be clearer as
   `Path(...)`.
4. **`read_text()` / `write_text()` without `encoding=`.** These
   default to the platform encoding. Always pass `encoding="utf-8"`
   (or the appropriate explicit encoding).
5. **Inline imports without justification.** Flag `import` statements
   inside a function body that aren't guarded by `TYPE_CHECKING`,
   conditional optional-dependency probes, or a comment explaining a
   documented circular-dependency break. Default is module-level
   imports.
6. **Relative imports.** Flag `from .foo import bar` and
   `from ..pkg import mod`. Imports must be absolute.
7. **Re-exports in `__init__.py`.** Flag non-empty `__all__` in an
   `__init__.py`, or `from x import y` (without the `as y` redundant
   form) used as a re-export. The repo convention is that
   `__init__.py` files are empty; when a re-export is genuinely
   required (e.g., plugin entry points), use the explicit
   `from x import y as y` form.
8. **Properties doing I/O.** Flag `@property` methods whose body calls
   subprocess, network, database, filesystem, or gateway methods.
   Properties must be O(1) / pure accessors. Rename to an explicit
   `fetch_*` / `load_*` method instead.
9. **Indentation deeper than 4 levels.** Flag control-flow nesting
   that reaches 5+ levels inside a single function. The fix is to
   extract a helper, not to rewrite in place.

## Tier B — light judgment; skip if unsure

These rules require a little interpretation. If the diff context is
ambiguous, **skip the finding** rather than flag it. False positives
here cost more than misses.

10. **Declare variables close to use.** Flag a local that is assigned
    and then not used until ~10+ lines later in the same function,
    with intervening unrelated work. Do NOT flag: loop accumulators,
    values pre-computed for arguments to a single downstream call,
    variables used multiple times, or variables whose name genuinely
    documents intent.
11. **Don't destructure into single-use locals.** Flag `x = obj.field`
    (or tuple-unpack into single-use names) when `x` is used exactly
    once on an adjacent line. Skip when the local name clarifies an
    otherwise cryptic field, or when destructuring is what makes a
    subsequent call readable.
12. **No backwards-compatibility preservation in new code.** Flag _new_
    code in the diff that introduces legacy-format branches,
    deprecation shims, or aliases kept "for existing callers" without
    a public-API justification visible in the diff. Do NOT flag
    unchanged legacy code the diff merely touches.
13. **Version-sensitive typing.** If the project's minimum Python (from
    `pyproject.toml`) is 3.10 or newer, flag `Optional[X]`,
    `Union[X, Y]`, `List[X]`, `Dict[K, V]`, `Tuple[...]` imported from
    `typing`. The modern equivalents are `X | None`, `X | Y`,
    `list[X]`, `dict[K, V]`, `tuple[...]`. Also flag other modern
    syntax replacements the minimum version makes available (e.g.,
    `typing.Self` on 3.11+ instead of `"ClassName"` string forward
    refs to the enclosing class; `match` statements are optional, not
    required).

## Severity

- `error` — violations that would fail review outright (mutable
  defaults in public APIs, exception-as-control-flow in production
  paths, `.resolve()` without `.exists()`).
- `warning` — conventions the team enforces but that are survivable
  (most of the rules above default here).
- `info` — sparingly, for patterns worth noting but not fixing.

If there are no violations in the diff, return an empty findings list.
