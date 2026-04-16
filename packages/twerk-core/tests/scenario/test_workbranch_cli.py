from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.workbranch.main import build_cli
from twerk_core.workbranch.testing import FakeWorkbranchGitGateway
from twerk_core.working_memory.testing import FakeWorkingMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(
    *,
    initial_files: dict[str, dict[str, str]] | None = None,
    current_branch: str | None = None,
    existing_branches: set[str] | None = None,
) -> dict[str, object]:
    return {
        "working_memory_gateway": FakeWorkingMemoryGateway(initial_files=initial_files),
        "workbranch_git_gateway": FakeWorkbranchGitGateway(
            current_branch=current_branch,
            existing_branches=existing_branches,
        ),
    }


def _json_output(text: str) -> dict[str, object]:
    return json.loads(text)


def test_workbranch_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: workbranch" in result.output
    assert "Manage branch-backed working memory." in result.output
    assert "--version" in result.output
    assert "create" in result.output
    assert "read" in result.output
    assert "json" in result.output


def test_workbranch_create_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["create", "-h"])

    assert result.exit_code == 0
    assert "Usage: workbranch create" in result.output
    assert "--plan-file" in result.output


def test_workbranch_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_workbranch_create_full_flow(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan_file = tmp_path / "plan.md"
    plan_file.write_text("# Plan\n")
    obj = _obj()

    result = CliRunner().invoke(
        cli_group,
        ["create", "feat/x", "--plan-file", str(plan_file)],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "Created branch feat/x" in result.output
    wm = obj["working_memory_gateway"]
    git = obj["workbranch_git_gateway"]
    assert isinstance(wm, FakeWorkingMemoryGateway)
    assert isinstance(git, FakeWorkbranchGitGateway)
    assert wm.read("feat/x", "plan.md") == "# Plan\n"
    assert git._created_branches == ["feat/x"]


def test_workbranch_json_create_returns_json(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan_file = tmp_path / "plan.md"
    plan_file.write_text("# Plan\n")
    obj = _obj()

    result = CliRunner().invoke(
        cli_group,
        ["json", "create"],
        input=json.dumps({"branch": "feat/x", "plan_file": str(plan_file)}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert payload == {
        "branch": "feat/x",
        "files_written": ["plan.md"],
        "success": True,
    }


def test_workbranch_read_returns_plan_content(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["read"],
        obj=_obj(initial_files={"feat/x": {"plan.md": "# Plan\n"}}, current_branch="feat/x"),
    )

    assert result.exit_code == 0
    assert result.output == "# Plan\n"


def test_workbranch_json_read_returns_json(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["json", "read"],
        input="",
        obj=_obj(initial_files={"feat/x": {"plan.md": "# Plan\n"}}, current_branch="feat/x"),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert payload == {
        "branch": "feat/x",
        "path": "plan.md",
        "content": "# Plan\n",
        "success": True,
    }


def test_workbranch_read_custom_path(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["read", "--path", "notes.md"],
        obj=_obj(initial_files={"feat/x": {"notes.md": "notes\n"}}, current_branch="feat/x"),
    )

    assert result.exit_code == 0
    assert result.output == "notes\n"


def test_workbranch_error_cases_surface_correctly(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan_file = tmp_path / "plan.md"
    plan_file.write_text("# Plan\n")

    create_result = CliRunner().invoke(
        cli_group,
        ["create", "feat/x", "--plan-file", str(plan_file)],
        obj=_obj(initial_files={"feat/x": {"plan.md": "old\n"}}),
    )
    read_result = CliRunner().invoke(cli_group, ["read"], obj=_obj(current_branch=None))

    assert create_result.exit_code == 1
    assert "Working memory already exists for branch: feat/x" in create_result.output
    assert read_result.exit_code == 1
    assert "Could not resolve a branch" in read_result.output


def test_workbranch_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
