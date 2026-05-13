from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_initiatives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_initiative_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: initiative" in result.output
    assert "Work with checked-in Initiative records." in result.output
    assert "--version" in result.output
    assert "exec" not in result.output


def test_initiative_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_initiative_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec" in result.output
    assert "Commands for use by initiative skills." in result.output
    assert "list" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "list", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec list" in result.output
    assert "List checked-in Initiative record directories" in result.output


def test_initiative_exec_list_absent_root(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "root_path": ".asdl/initiatives",
            "root_exists": False,
            "entries": [],
        },
    }


def test_initiative_exec_list_empty_root(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".asdl" / "initiatives").mkdir(parents=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"] == {
        "root_path": ".asdl/initiatives",
        "root_exists": True,
        "entries": [],
    }


def test_initiative_exec_list_sorts_open_and_closed_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "zeta", closed=True)
    _write_initiative(root, "alpha")

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["alpha", "zeta"]
    assert entries[0]["path"] == ".asdl/initiatives/alpha"
    assert entries[0]["closed"] is False
    assert entries[1]["path"] == ".asdl/initiatives/zeta"
    assert entries[1]["closed"] is True
    assert entries[1]["files"]["closed_md"] is True


def test_initiative_exec_list_reports_missing_required_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    (root / "partial").mkdir(parents=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entry = json.loads(result.output)["data"]["entries"][0]
    assert entry["files"] == {
        "initiative_md": False,
        "roadmap_md": False,
        "updates_dir": False,
        "closed_md": False,
    }
    assert entry["update_count"] == 0


def test_initiative_exec_list_counts_direct_markdown_updates_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    initiative_path = _write_initiative(root, "counter", updates=("first.md", "second.md"))
    updates_dir = initiative_path / "updates"
    (updates_dir / "notes.txt").write_text("not markdown\n", encoding="utf-8")
    nested_dir = updates_dir / "nested"
    nested_dir.mkdir()
    (nested_dir / "third.md").write_text("nested update\n", encoding="utf-8")
    (updates_dir / "directory.md").mkdir()

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entry = json.loads(result.output)["data"]["entries"][0]
    assert entry["update_count"] == 2


def test_initiative_exec_list_ignores_non_directory_root_entries(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    root.mkdir(parents=True)
    (root / ".gitkeep").write_text("", encoding="utf-8")
    (root / "not-an-initiative.md").write_text("ignored\n", encoding="utf-8")
    _write_initiative(root, "real")

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["real"]


def test_initiative_exec_list_format_md(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "alpha", updates=("progress.md",))

    result = CliRunner().invoke(cli_group, ["exec", "list", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "Root: `.asdl/initiatives` (present)" in result.output
    assert "| slug | state | files | updates | path |" in result.output
    assert (
        "| alpha | open | initiative.md:yes, roadmap.md:yes, updates/:yes, closed.md:no | "
        "1 | `.asdl/initiatives/alpha` |"
    ) in result.output
    assert "choose" not in result.output.lower()
    assert "recommend" not in result.output.lower()


def _invoke_json(cli_group: ClinkrGroup) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["exec", "list", "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )


def _write_initiative(
    root: Path,
    slug: str,
    *,
    closed: bool = False,
    updates: tuple[str, ...] = (),
) -> Path:
    path = root / slug
    path.mkdir(parents=True)
    (path / "initiative.md").write_text(f"# {slug}\n", encoding="utf-8")
    (path / "roadmap.md").write_text("# Roadmap\n", encoding="utf-8")
    updates_dir = path / "updates"
    updates_dir.mkdir()
    for update_name in updates:
        (updates_dir / update_name).write_text("# Update\n", encoding="utf-8")
    if closed:
        (path / "closed.md").write_text("closed\n", encoding="utf-8")
    return path
