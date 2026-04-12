# Test file templates

## Placeholders

- `<DEV_PROJECT_NAME>` -- dev project name (e.g., `my-cool-lib-dev`)
- `<DEV_PACKAGE_NAME>` -- dev import name (e.g., `my_cool_lib_dev`)

## Test package init

Create `packages/<DEV_PROJECT_NAME>/tests/__init__.py` as an empty file.

## Command tests

**Target path:** `packages/<DEV_PROJECT_NAME>/tests/test_commands.py`

```python
from pathlib import Path

from click.testing import CliRunner

from <DEV_PACKAGE_NAME>.cli import cli


def test_cli_help_shows_commands() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "clean-pyproject" in result.output


def test_clean_pyproject_help() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["clean-pyproject", "--help"])
    assert result.exit_code == 0
    assert "Clean Python project cache and build artifacts" in result.output


def test_all_command_directories_are_registered() -> None:
    """Ensure all command directories have corresponding CLI commands.

    Prevents forgetting to register new commands when using static imports.
    """
    import <DEV_PACKAGE_NAME>

    commands_dir = Path(<DEV_PACKAGE_NAME>.__file__).parent / "commands"
    command_dirs = [
        d.name.replace("_", "-")
        for d in commands_dir.iterdir()
        if d.is_dir() and not d.name.startswith("_") and (d / "command.py").exists()
    ]

    registered_commands = list(cli.commands.keys())

    missing = set(command_dirs) - set(registered_commands)
    extra = set(registered_commands) - set(command_dirs)

    assert not missing, f"Commands not registered in CLI: {missing}"
    assert not extra, f"Commands registered but no directory: {extra}"
    assert len(command_dirs) == len(registered_commands)
```
