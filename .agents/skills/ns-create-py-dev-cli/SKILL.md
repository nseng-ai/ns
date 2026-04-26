---
name: ns-create-py-dev-cli
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Scaffold a -dev CLI workspace package for development tooling. Use when the user wants to add a dev CLI to an existing Python project, create developer commands, set up a -dev package, or add project-specific tooling as a click CLI. Creates the full package structure inside packages/<project>-dev/ with click CLI, static imports for shell completion, output routing, context injection, a starter clean-pyproject command, and wires up the uv workspace. Run when the user says things like 'add a dev CLI', 'create dev tooling', 'set up a -dev package', or 'scaffold developer commands'."
description: "Command: ns-create-py-dev-cli"
references:
  - templates/pyproject-toml
  - templates/source-files
  - templates/starter-command
  - templates/test-files
allowed-tools:
  - "Bash(uv *)"
  - "Bash(just *)"
  - "Bash(mkdir *)"
---

# create-dev-cli

Scaffold a `-dev` CLI workspace package inside an existing Python project.
The result is a separate click-based CLI for development tooling (cache
cleaning, version bumping, release management, etc.) that is installed as
a dev dependency and wired into the uv workspace.

## Stack

| Concern          | Tool                                        |
| ---------------- | ------------------------------------------- |
| CLI framework    | click                                       |
| Build backend    | hatchling                                   |
| Package manager  | uv workspace                                |
| Layout           | `packages/<project>-dev/src/<package>_dev/` |
| CLI architecture | Static imports (for shell completion)       |
| Output routing   | stderr for humans, stdout for machines      |

## Preconditions

Before running this skill, the following must already be true:

- The current directory is a git repo with an existing Python project
- A root `pyproject.toml` exists with `[project] name` defined
- The user has `uv` installed
- A `justfile` exists (typically created by `ns-create-pypackage-project`)

## Information to collect

Read these from the existing project. Confirm derived values with the
user before proceeding.

| Value              | Variable            | Example               | Default                                               |
| ------------------ | ------------------- | --------------------- | ----------------------------------------------------- |
| Root project name  | `PROJECT_NAME`      | `my-cool-lib`         | read from root `pyproject.toml` `[project] name`      |
| Root package name  | `ROOT_PACKAGE_NAME` | `my_cool_lib`         | `PROJECT_NAME` with hyphens to underscores            |
| Dev project name   | `DEV_PROJECT_NAME`  | `my-cool-lib-dev`     | `{PROJECT_NAME}-dev`                                  |
| Dev package name   | `DEV_PACKAGE_NAME`  | `my_cool_lib_dev`     | `{ROOT_PACKAGE_NAME}_dev`                             |
| Min Python version | `MIN_PYTHON`        | `3.11`                | read from root `pyproject.toml` `requires-python`     |
| Dev context class  | `DEV_CONTEXT_CLASS` | `MyCoolLibDevContext` | `DEV_PROJECT_NAME` converted to CamelCase + `Context` |

Derive `TARGET_VERSION_RUFF`: `"py" + MIN_PYTHON` without the dot (e.g., `"py311"`).

## Target directory structure

```
packages/<DEV_PROJECT_NAME>/
├── pyproject.toml
├── src/<DEV_PACKAGE_NAME>/
│   ├── __init__.py
│   ├── __main__.py
│   ├── AGENTS.md
│   ├── cli/
│   │   ├── __init__.py
│   │   └── output.py
│   ├── context.py
│   └── commands/
│       └── clean_pyproject/
│           └── command.py
└── tests/
    ├── __init__.py
    └── test_commands.py
```

## Step-by-step workflow

Follow these steps in order. Create all files, then run verification
at the end.

### Step 1: Collect information

Read `PROJECT_NAME` and `MIN_PYTHON` from root `pyproject.toml`. Derive
all other values. Confirm with the user before proceeding.

### Step 2: Create `packages/<DEV_PROJECT_NAME>/pyproject.toml`

Use the template from `templates/pyproject-toml.md`. Replace all placeholders
with the values collected in Step 1.

### Step 3: Create source package files

Create the directory structure first:

```bash
mkdir -p packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/cli
mkdir -p packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/commands
```

Use the templates from `templates/source-files.md` to create:

- `src/<DEV_PACKAGE_NAME>/__init__.py` (empty file)
- `src/<DEV_PACKAGE_NAME>/__main__.py`
- `src/<DEV_PACKAGE_NAME>/cli/__init__.py`
- `src/<DEV_PACKAGE_NAME>/cli/output.py`
- `src/<DEV_PACKAGE_NAME>/context.py`
- `src/<DEV_PACKAGE_NAME>/AGENTS.md`

### Step 4: Create starter command

Create the command directory first:

```bash
mkdir -p packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/commands/clean_pyproject
```

Use the template from `templates/starter-command.md` to create the
`clean-pyproject` command.

### Step 5: Create test files

Create the test directory first:

```bash
mkdir -p packages/<DEV_PROJECT_NAME>/tests
```

Use the templates from `templates/test-files.md` to create:

- `tests/__init__.py` (empty file)
- `tests/test_commands.py`

### Step 6: Update root `pyproject.toml`

Update these sections in the root `pyproject.toml`. If a section does not
exist, create it. If it exists, append to the existing list.

1. **Add or create `[tool.uv.workspace]`:**

   ```toml
   [tool.uv.workspace]
   members = [
     "packages/<DEV_PROJECT_NAME>",
   ]
   ```

2. **Add or create `[tool.uv.sources]`:**

   ```toml
   [tool.uv.sources]
   <DEV_PROJECT_NAME> = { workspace = true }
   ```

3. **Add to `[dependency-groups] dev`:**

   ```toml
   "<DEV_PROJECT_NAME>",
   ```

4. **Add to `[tool.ruff.lint.isort] known-first-party`:**

   ```toml
   "<DEV_PACKAGE_NAME>"
   ```

5. **Add to `[tool.pytest.ini_options] testpaths`:**

   ```toml
   "packages/<DEV_PROJECT_NAME>/tests"
   ```

   Note: `[tool.ty.src] include` is not updated here — the scaffolded root
   pyproject uses `packages/*/src`, which already covers every workspace
   package. If the root uses an explicit list instead of the glob, append
   `"packages/<DEV_PROJECT_NAME>/src"` to it.

### Step 7: Update root justfile

Replace the existing `clean` target with:

```justfile
clean:
    uv run <DEV_PROJECT_NAME> clean-pyproject
```

This delegates cache cleaning to the dev CLI as the single source of truth.

### Step 8: Install and verify

```bash
uv sync
uv run <DEV_PROJECT_NAME> --help
uv run <DEV_PROJECT_NAME> clean-pyproject --dry-run
```

All three must succeed.

### Step 9: Format

```bash
uv run ruff format packages/<DEV_PROJECT_NAME>/
```

### Step 10: Final verification

Run `just check` to confirm everything passes. If it fails, fix the issue
before considering scaffolding complete.

## After scaffolding

Tell the user:

1. The dev CLI is set up and `just check` passes.
2. The `<DEV_PROJECT_NAME>` command is available via `uv run <DEV_PROJECT_NAME>`.
3. To add a new command: create `commands/my_command/command.py`, import and
   register in `cli/__init__.py`, add a help test in `tests/test_commands.py`.
4. The justfile `clean` target now delegates to `<DEV_PROJECT_NAME> clean-pyproject`.
