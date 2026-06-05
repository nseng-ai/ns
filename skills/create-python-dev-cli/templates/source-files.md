# Source file templates

## Placeholders

- `<DEV_PROJECT_NAME>` -- dev project name (e.g., `my-cool-lib-dev`)
- `<DEV_PACKAGE_NAME>` -- dev import name (e.g., `my_cool_lib_dev`)
- `<DEV_CONTEXT_CLASS>` -- context class name (e.g., `MyCoolLibDevContext`)
- `<PROJECT_NAME>` -- root project name (e.g., `my-cool-lib`)

## Package init

Create `src/<DEV_PACKAGE_NAME>/__init__.py` as an empty file.

## Entry point

**Target path:** `packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/__main__.py`

```python
"""Development CLI entry point."""

from <DEV_PACKAGE_NAME>.cli.main import cli

if __name__ == "__main__":
    cli()
```

## CLI package init

Create `src/<DEV_PACKAGE_NAME>/cli/__init__.py` as an empty file.

## CLI definition

**Target path:** `packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/cli/main.py`

```python
"""Static CLI definition for <DEV_PROJECT_NAME>.

This module uses static imports instead of dynamic command loading to enable
shell completion. Click's completion mechanism requires all commands to be
available at import time for inspection.
"""

import click

from <DEV_PACKAGE_NAME>.commands.clean_pyproject.command import clean_pyproject_command
from <DEV_PACKAGE_NAME>.context import create_context

CONTEXT_SETTINGS = dict(help_option_names=["-h", "--help"])


@click.group(name="<DEV_PROJECT_NAME>", context_settings=CONTEXT_SETTINGS)
@click.pass_context
def cli(ctx: click.Context) -> None:
    """Development tools for <PROJECT_NAME>."""
    if ctx.obj is None:
        ctx.obj = create_context()


# Register all commands
cli.add_command(clean_pyproject_command)
```

## Output utilities

**Target path:** `packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/cli/output.py`

```python
"""Output utilities for CLI commands with clear intent."""

from typing import Any

import click


def user_output(
    message: Any | None = None,
    nl: bool = True,
    color: bool | None = None,
) -> None:
    """Output informational message for human users.

    Routes to stderr so shell integration can capture structured data
    on stdout while users still see progress/status messages.
    """
    click.echo(message, nl=nl, err=True, color=color)


def machine_output(
    message: Any | None = None,
    nl: bool = True,
    color: bool | None = None,
) -> None:
    """Output structured data for machine/script consumption.

    Routes to stdout for shell wrappers to capture.
    """
    click.echo(message, nl=nl, err=False, color=color)
```

## Context management

**Target path:** `packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/context.py`

```python
"""Context for <DEV_PROJECT_NAME> CLI commands."""

import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class <DEV_CONTEXT_CLASS>:
    """Context object for <DEV_PROJECT_NAME> commands."""

    repo_root: Path


def create_context() -> <DEV_CONTEXT_CLASS>:
    """Create a context with the repository root path."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    repo_root = Path(result.stdout.strip()) if result.returncode == 0 else Path.cwd()
    return <DEV_CONTEXT_CLASS>(repo_root=repo_root)
```

## Developer guidelines

**Target path:** `packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/AGENTS.md`

````markdown
# Dev CLI Implementation Guidelines

## Command Structure

All <DEV_PROJECT_NAME> commands follow this structure:

```
commands/
├── my_command/
│   └── command.py    # Click command with all logic
```

## Critical: Function Naming Convention

**The Click command function MUST be named `{command_name}_command`** to match
the import in `cli/main.py`.

- Command name: `my-command` (kebab-case in CLI)
- Function name: `my_command_command` (snake_case with `_command` suffix)
- File location: `commands/my_command/command.py`

## Static Import Architecture

The `cli/main.py` module uses **static imports** (not dynamic command
discovery) to enable shell completion:

```python
from <DEV_PACKAGE_NAME>.commands.my_command.command import my_command_command
cli.add_command(my_command_command)
```

Click's completion mechanism requires all commands to be available at import
time for inspection.

## Adding a New Command

1. Create `commands/my_command/command.py`
2. Import and register in `cli/main.py`
3. Add a help test in `tests/test_commands.py`

## Context Injection

`<DEV_CONTEXT_CLASS>` provides dependency injection via `@click.pass_context`:

```python
@click.command(name="my-command")
@click.pass_context
def my_command_command(ctx: click.Context) -> None:
    dev_ctx: <DEV_CONTEXT_CLASS> = ctx.obj
    repo_root = dev_ctx.repo_root
```

Simple commands that only need subprocess can ignore the context entirely.

## Output Pattern

Use `user_output()` for human-readable messages (stderr) and
`machine_output()` for structured data (stdout).

## Subprocess Usage

Direct `subprocess.run` is acceptable for dev tooling. Use `check=False`
with explicit error handling (LBYL pattern).
````
