# Plan: One-liner `uv tool install` for twerk workspace

## Context

Running `uv tool install -e ~/code/twerk` installs the `twerk` CLI but crashes immediately:

```
ModuleNotFoundError: No module named 'twerk_core'
```

**Root cause.** In `/Users/schrockn/code/twerk/pyproject.toml`, the four workspace members (`twerk-core`, `twerk-objectives`, `twerk-pr-address`, `twerk-slots`) are declared only under `[dependency-groups.dev]` (lines 31–42). `uv tool install` installs `[project.dependencies]` only — dependency groups are dev-context conveniences consumed by `uv sync` / `uv run`, and `uv tool install` does not see them. `src/twerk/cli/plugins.py:10` imports `twerk_core.clinkr` unconditionally, so the CLI explodes on startup.

**Desired outcome.** A single `uv tool install -e …` command that produces a working `twerk` CLI with all workspace plugins available, while preserving the entry-point plugin model (plugins should stay opt-in at the package level, even if bundled by default for local dev).

## Approach

Express runtime requirements via PEP 621 fields that `uv tool install` honors:

1. **`[project.dependencies]`** — required at import time. Only `twerk-core` belongs here (imported unconditionally at CLI startup).
2. **`[project.optional-dependencies]`** — a `plugins` extra that bundles the optional plugin packages. Opt-in via `[plugins]`, or `--all-extras` for a name-free one-liner.

`[tool.uv.sources]` with `workspace = true` already points these names at the local workspace members, so no PyPI lookup happens — uv resolves them from `packages/*` on disk. This works because `uv tool install -e <workspace-root>` reads the root `pyproject.toml` including its `[tool.uv.sources]`.

## Changes

**File: `/Users/schrockn/code/twerk/pyproject.toml`**

Add `twerk-core` to runtime deps (line 24–26):

```toml
dependencies = [
  "click>=8.1.7",
  "twerk-core",
]
```

Add a `plugins` extra (new section, after `[project.scripts]`). `twerk-core` is intentionally omitted here — it's already a required runtime dep above:

```toml
[project.optional-dependencies]
plugins = [
  "twerk-objectives",
  "twerk-pr-address",
  "twerk-slots",
]
```

`[dependency-groups.dev]` (lines 31–42) — leave as is. The dev group can still list the plugin members for `uv sync`-based dev workflows; it's orthogonal to `uv tool install`.

No changes to `[tool.uv.workspace]` or `[tool.uv.sources]`.

## Install one-liners

After the `pyproject.toml` edit, any of these work:

```bash
# Core CLI only (twerk-core pulled in transitively) — the default
uv tool install -e ~/code/twerk

# Core + all optional plugins — the full-tool one-liner
uv tool install -e "~/code/twerk[plugins]"

# Equivalent, name-free, future-proof if more extras are added
uv tool install -e ~/code/twerk --all-extras
```

`--all-extras` is the cleanest one-liner for "install everything." `[plugins]` is explicit and self-documenting.

## Why not alternatives

- **Move all four to `[project.dependencies]`** — works with a bare `uv tool install -e ~/code/twerk`, but it fuses plugins into the core package and defeats the entry-point plugin model. Anyone consuming `twerk` as a library would be forced to pull all plugins.
- **`uv tool install -e ~/code/twerk --with <path> --with <path> …`** — works without `pyproject.toml` changes, but the one-liner balloons to four `--with` flags with absolute paths. Doesn't scale and doesn't get committed to the repo.
- **Put members back in a dev group and document `uv sync` instead** — fine for contributors but doesn't satisfy "install as a tool."

## Critical files

- `/Users/schrockn/code/twerk/pyproject.toml` — only file modified.
- `/Users/schrockn/code/twerk/src/twerk/cli/plugins.py:10` — the import that makes `twerk-core` a hard runtime dep.
- `/Users/schrockn/code/twerk/packages/twerk-core/` — resolved locally via `workspace = true`.

## Verification

1. `uv tool uninstall twerk` (clear prior install).
2. `uv tool install -e ~/code/twerk` — bare install. `twerk-core` should appear in the install output as a transitive dep resolved from `packages/twerk-core`. `twerk --help` loads without `ModuleNotFoundError`; no plugin subcommands present.
3. `uv tool uninstall twerk` and then `uv tool install -e "~/code/twerk[plugins]"` (or `--all-extras`). `twerk --help` now lists the plugin subcommands registered via the `twerk.plugins` entry-point group.
4. `twerk --version` — prints `0.1.0`.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-enable-uv-tool-install.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
