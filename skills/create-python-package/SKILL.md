---
name: create-python-package
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Scaffold a well-structured Python package project. Use when the user wants to create a new Python package, set up a Python project, initialize a pypackage, bootstrap a Python library or CLI tool, or start a new Python repo with modern tooling. Creates the full project structure: pyproject.toml (uv + hatchling), src layout, ruff, ty, pytest + pytest-xdist, justfile, and .gitignore. Produces a project that passes `just check` immediately. Run when the user says things like 'set up a new Python project', 'create a package called X', 'scaffold this repo', or 'initialize the project structure'."
description: "Command: create-python-package"
references:
  - templates/pyproject-toml
  - templates/justfile
  - templates/gitignore
  - templates/source-files
allowed-tools:
  - "Bash(uv *)"
  - "Bash(just *)"
  - "Bash(mkdir *)"
---

# create-python-package

Scaffold a complete Python package project with modern tooling. The result
is an opinionated, production-ready layout that passes `just check` on
first run.

## Stack

| Concern            | Tool                         |
| ------------------ | ---------------------------- |
| Package manager    | uv                           |
| Build backend      | hatchling                    |
| Layout             | `src/<package>/`             |
| Linter + formatter | ruff                         |
| Type checker       | ty                           |
| Test runner        | pytest + pytest-xdist        |
| Task runner        | justfile                     |
| Config             | Everything in pyproject.toml |

No pre-commit, no mypy, no tox, no Makefile.

## Preconditions

Before running this skill, the following must already be true:

- The current directory is a git repo (`git init` has been run)
- The user has `uv` installed
- `.agents/`, `.claude/`, and `skills/` directories may or may not exist

## Information to collect

Ask the user for these values before scaffolding. Use the defaults shown
if the user does not specify.

| Value                  | Variable       | Example                                     | Default                                   |
| ---------------------- | -------------- | ------------------------------------------- | ----------------------------------------- |
| Project name (pypi)    | `PROJECT_NAME` | `my-cool-lib`                               | -- (required)                             |
| Package / import name  | `PACKAGE_NAME` | `my_cool_lib`                               | `PROJECT_NAME` with hyphens → underscores |
| One-line description   | `DESCRIPTION`  | `A library for cool things`                 | `Add your description here`               |
| Author name            | `AUTHOR_NAME`  | `Jane Smith`                                | -- (required)                             |
| Author email           | `AUTHOR_EMAIL` | `jane@example.com`                          | -- (required)                             |
| Minimum Python version | `MIN_PYTHON`   | `3.11`                                      | `3.11`                                    |
| License                | `LICENSE_TYPE` | `MIT`, `Apache-2.0`, `BSD-3-Clause`, `none` | `MIT`                                     |
| CLI entry point?       | `HAS_CLI`      | yes / no                                    | no                                        |

Derive these automatically:

- `TARGET_VERSION_RUFF`: `"py" + MIN_PYTHON` without the dot.
  Example: `"py311"` for `3.11`.

## Target directory structure

```
<repo-root>/
├── .gitignore
├── justfile
├── LICENSE
├── pyproject.toml
├── README.md
├── src/
│   └── <PACKAGE_NAME>/
│       └── __init__.py
└── tests/
    └── test_<PACKAGE_NAME>.py
```

If `HAS_CLI` is yes, additionally:

```
src/<PACKAGE_NAME>/
├── __init__.py
└── cli.py
```

## Step-by-step workflow

Follow these steps in order. Create all files, then run verification
at the end.

### Step 1: Collect information

Ask the user for the values listed above. Confirm the derived values
(`PACKAGE_NAME`) before proceeding.

### Step 2: Create pyproject.toml

Use the template from `templates/pyproject-toml.md`. Replace all placeholders
with the values collected in Step 1. See the template's CLI variant section
if `HAS_CLI` is yes.

### Step 3: Create justfile

Use the template from `templates/justfile.md`. No placeholders to replace.

### Step 4: Create .gitignore

Use the template from `templates/gitignore.md`. No placeholders to replace.

### Step 5: Create LICENSE

If `LICENSE_TYPE` is `none`, skip this step and omit the `license` field
from `pyproject.toml`.

Otherwise, create a `LICENSE` file with the standard text for the chosen
license. Set the copyright year to the current year and `AUTHOR_NAME` as
the copyright holder. Use the canonical full text from
https://choosealicense.com/licenses/ for the selected license type.

### Step 6: Create README.md

If a README.md already exists with real content, do not overwrite it.
If it does not exist, or contains only a default heading, replace with:

````markdown
# <PROJECT_NAME>

<DESCRIPTION>

## Development

```bash
uv sync
just check
```
````

### Step 7: Create source package and tests

Use the templates from `templates/source-files.md` to create:

- `src/<PACKAGE_NAME>/__init__.py` (empty file)
- `src/<PACKAGE_NAME>/cli.py` (only if `HAS_CLI` is yes)
- `tests/test_<PACKAGE_NAME>.py` (include CLI smoke test if `HAS_CLI` is yes)

### Step 8: Install dependencies and verify

```bash
uv sync
just check
```

Both must succeed. If `just check` fails, fix the issue before
considering scaffolding complete.

### Step 9: Format the codebase

```bash
uv run ruff format
```

One-time pass to ensure all generated Python files conform.

### Step 10: Final verification

Run `just check` one final time to confirm everything passes.

## After scaffolding

Tell the user:

1. The project is set up and `just check` passes.
2. Key commands: `just check` (full suite), `just fix` (auto-fix lint
   and format), `uv add <dep>` (add a dependency).
3. Push to GitHub when ready.
