from __future__ import annotations

from click.testing import CliRunner

from vibechk.cli import build_cli


def test_vibechk_help() -> None:
    result = CliRunner().invoke(build_cli(), ["-h"])

    assert result.exit_code == 0
    assert "Usage: vibechk" in result.output
    assert "Run lightweight agent context evals and publish Markdown evidence." in result.output
    assert "--version" in result.output


def test_vibechk_version() -> None:
    result = CliRunner().invoke(build_cli(), ["--version"])

    assert result.exit_code == 0
    assert "vibechk" in result.output
    assert "version" in result.output.lower()
