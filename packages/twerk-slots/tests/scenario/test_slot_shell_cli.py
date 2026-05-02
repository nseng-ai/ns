from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj() -> object:
    return build_clinkr_context_object(lambda: None)


@pytest.mark.parametrize("shell", ["zsh", "bash"])
def test_shell_show_prints_wrapper(cli_group: ClinkrGroup, shell: str) -> None:
    result = CliRunner().invoke(cli_group, ["shell", "show", "--shell", shell], obj=_obj())

    assert result.exit_code == 0, result.output
    assert "slot() {" in result.output
    assert "SLOT_CD_DIRECTIVE_FILE" in result.output
    assert "mktemp" in result.output
    assert 'command slot "$@"' in result.output
    assert 'SLOT_CD_DIRECTIVE_FILE="$_slot_cd_file" slot "$@"' not in result.output
    assert "cd --" in result.output


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
    assert "slot() {" in content
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
    assert payload["data"]["already_installed"] is True
    assert rc_path.read_text(encoding="utf-8") == first_content


def test_shell_install_appends_to_existing_rc(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    rc_path = tmp_path / ".zshrc"
    rc_path.write_text("# existing content\nalias ll='ls -la'\n", encoding="utf-8")

    result = CliRunner().invoke(cli_group, ["shell", "install", "--shell", "zsh"], obj=_obj())

    assert result.exit_code == 0, result.output
    content = rc_path.read_text(encoding="utf-8")
    assert content.startswith("# existing content\n")
    assert "alias ll='ls -la'" in content
    assert "# >>> slot shell integration >>>" in content


def test_shell_install_unsupported_shell_fails(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))

    result = CliRunner().invoke(
        cli_group,
        ["shell", "install", "--shell", "fish", "--format", "json"],
        obj=_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "unsupported_shell"


def test_shell_and_completion_marker_blocks_can_coexist(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))

    completion = CliRunner().invoke(
        cli_group,
        ["completion", "install", "--shell", "zsh"],
        obj=_obj(),
    )
    assert completion.exit_code == 0, completion.output

    shell = CliRunner().invoke(cli_group, ["shell", "install", "--shell", "zsh"], obj=_obj())
    assert shell.exit_code == 0, shell.output

    content = (tmp_path / ".zshrc").read_text(encoding="utf-8")
    assert content.count("# >>> slot completion >>>") == 1
    assert content.count("# >>> slot shell integration >>>") == 1
    assert "_SLOT_COMPLETE=zsh_source slot" in content
    assert 'command slot "$@"' in content
