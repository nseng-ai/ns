from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_slots.cli.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj() -> object:
    return build_clinkr_context_object(lambda: None)


def _assert_wrapper_protocol(script: str) -> None:
    assert "slot()" in script
    assert "mktemp" in script
    assert "SLOT_CD_DIRECTIVE_FILE" in script
    assert 'command slot "$@"' in script
    assert "cd --" in script


def test_shell_show_zsh_renders_wrapper(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["shell", "show", "--shell", "zsh"], obj=_obj())

    assert result.exit_code == 0, result.output
    _assert_wrapper_protocol(result.output)


def test_shell_show_bash_renders_wrapper(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["shell", "show", "--shell", "bash"], obj=_obj())

    assert result.exit_code == 0, result.output
    _assert_wrapper_protocol(result.output)


def test_shell_show_unsupported_shell_fails(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["shell", "show", "--shell", "fish", "--format", "json"],
        obj=_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "unsupported_shell"


def test_shell_install_writes_marker_block(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))

    result = CliRunner().invoke(cli_group, ["shell", "install", "--shell", "zsh"], obj=_obj())

    assert result.exit_code == 0, result.output
    rc_path = tmp_path / ".zshrc"
    assert rc_path.exists()
    content = rc_path.read_text(encoding="utf-8")
    assert "# >>> slot shell integration >>>" in content
    assert "SLOT_CD_DIRECTIVE_FILE" in content
    assert 'command slot "$@"' in content
    assert "# <<< slot shell integration <<<" in content


def test_shell_install_is_idempotent(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    rc_path = tmp_path / ".zshrc"

    first = CliRunner().invoke(cli_group, ["shell", "install", "--shell", "zsh"], obj=_obj())
    assert first.exit_code == 0
    first_content = rc_path.read_text(encoding="utf-8")

    second = CliRunner().invoke(
        cli_group,
        ["shell", "install", "--shell", "zsh", "--format", "json"],
        obj=_obj(),
    )
    payload = json.loads(second.stdout)

    assert second.exit_code == 0
    assert payload["data"]["shell"] == "zsh"
    assert payload["data"]["rc_path"] == str(rc_path)
    assert payload["data"]["already_installed"] is True
    assert rc_path.read_text(encoding="utf-8") == first_content


def test_shell_install_appends_without_disturbing_completion_block(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    rc_path = tmp_path / ".zshrc"
    completion_block = (
        "# >>> slot completion >>>\n"
        'eval "$(_SLOT_COMPLETE=zsh_source slot)"\n'
        "# <<< slot completion <<<\n"
    )
    rc_path.write_text(completion_block, encoding="utf-8")

    result = CliRunner().invoke(cli_group, ["shell", "install", "--shell", "zsh"], obj=_obj())

    assert result.exit_code == 0, result.output
    content = rc_path.read_text(encoding="utf-8")
    assert content.startswith(completion_block)
    assert content.count("# >>> slot completion >>>") == 1
    assert content.count("# <<< slot completion <<<") == 1
    assert "# >>> slot shell integration >>>" in content
    assert "# <<< slot shell integration <<<" in content


def test_shell_appears_in_top_level_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--help"], obj=_obj())

    assert result.exit_code == 0, result.output
    assert "shell" in result.output
    assert "Manage parent-shell directory-changing integration" in result.output
