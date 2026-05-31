from __future__ import annotations

import importlib.metadata

from click.testing import CliRunner

from areg.cli import main


def test_version_exists() -> None:
    """The package is importable and has a version in its metadata."""
    metadata = importlib.metadata.metadata("areg")
    assert metadata["Name"] == "areg"
    assert metadata["Version"] is not None


def test_cli_help() -> None:
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
