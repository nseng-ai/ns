from __future__ import annotations

import json
from pathlib import Path

import click
import pytest
from click.testing import CliRunner

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.main import build_cli
from twerk_core.clinkr.group import ClinkrGroup


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _json_output(text: str) -> dict[str, object]:
    return json.loads(text)


def test_brmem_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: brmem" in result.output
    assert "Manage branch-scoped memory stored in git refs." in result.output
    assert "--version" in result.output
    assert "put" in result.output
    assert "get" in result.output
    assert "json" in result.output


def test_brmem_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_brmem_put_and_get_round_trip(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = {"brmem_gateway": FakeBranchMemoryGateway()}

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "feat/x", "docs/notes.md", "--file", str(source_file)],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "feat/x", "docs/notes.md"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Wrote docs/notes.md to brmem for feat/x at fake-0001." in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_get_at_reads_older_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("feat/x", "docs/notes.md", "one\n")
    gateway.put("feat/x", "docs/notes.md", "two\n")

    result = CliRunner().invoke(
        cli_group,
        ["get", "feat/x", "docs/notes.md", "--at", first_commit],
        obj={"brmem_gateway": gateway},
    )

    assert result.exit_code == 0, result.output
    assert result.output == "one\n"


def test_brmem_json_put_and_get(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("json\n", encoding="utf-8")
    obj = {"brmem_gateway": FakeBranchMemoryGateway()}

    put_result = CliRunner().invoke(
        cli_group,
        ["json", "put"],
        input=json.dumps(
            {
                "branch": "feat/x",
                "path": "docs/notes.md",
                "source_file": str(source_file),
            }
        ),
        obj=obj,
    )
    put_payload = _json_output(put_result.output)

    get_result = CliRunner().invoke(
        cli_group,
        ["json", "get"],
        input=json.dumps({"branch": "feat/x", "path": "docs/notes.md"}),
        obj=obj,
    )
    get_payload = _json_output(get_result.output)

    assert put_result.exit_code == 0
    assert put_payload == {
        "branch": "feat/x",
        "path": "docs/notes.md",
        "commit": "fake-0001",
        "success": True,
    }
    assert get_result.exit_code == 0
    assert get_payload == {
        "branch": "feat/x",
        "path": "docs/notes.md",
        "content": "json\n",
        "at": None,
        "success": True,
    }


def test_brmem_invalid_branch_surfaces_clean_error(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        ["put", "feat---x", "docs/notes.md", "--file", str(source_file)],
        obj={"brmem_gateway": FakeBranchMemoryGateway()},
    )

    assert result.exit_code == 1
    assert "Invalid branch name 'feat---x'" in result.output


def test_brmem_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    assert isinstance(json_group, click.Group)
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
