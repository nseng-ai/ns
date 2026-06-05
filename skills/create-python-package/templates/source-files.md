# Source and test file templates

## Placeholders

- `<PROJECT_NAME>` -- pypi project name
- `<PACKAGE_NAME>` -- import name

## Source package

Create `src/<PACKAGE_NAME>/__init__.py` as an empty file.

### CLI entry point (only if `HAS_CLI` is yes)

**Target path:** `src/<PACKAGE_NAME>/cli.py`

```python
from __future__ import annotations

import click


@click.group()
def main() -> None:
    """<PROJECT_NAME> CLI."""


if __name__ == "__main__":
    main()
```

## Tests

**Target path:** `tests/test_<PACKAGE_NAME>.py`

```python
from __future__ import annotations

import importlib.metadata


def test_version_exists() -> None:
    """The package is importable and has a version in its metadata."""
    metadata = importlib.metadata.metadata("<PROJECT_NAME>")
    assert metadata["Name"] == "<PROJECT_NAME>"
    assert metadata["Version"] is not None
```

### CLI smoke test (only if `HAS_CLI` is yes)

Add to the same test file:

```python
from click.testing import CliRunner

from <PACKAGE_NAME>.cli import main


def test_cli_help() -> None:
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
```
