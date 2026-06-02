from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_handoff.cli.handoff.context import HandoffCliContext
from asdl_handoff.cli.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _json_output(text: str) -> dict[str, Any]:
    return json.loads(text)


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | GitCommandFailure | None = "feat/x",
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway()
    else:
        git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): branch})
    ctx = HandoffCliContext(brmem_gateway=brmem_gateway, git_gateway=git_gateway)
    return build_clinkr_context_object(lambda: ctx)


def test_handoff_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: handoff" in result.output
    assert "Work with directed handoff artifacts." in result.output
    assert "--version" in result.output
    assert "list" in result.output


def test_handoff_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_handoff_list_defaults_to_current_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/x", "alpha")
    gateway.put("handoffs", "bravo.md", "feat/y", "bravo")
    gateway.put("notes", "ignore.md", "feat/x", "ignored")
    gateway.put("handoffs", "nested/ignore.md", "feat/x", "ignored")
    gateway.put("handoffs", "not-md.txt", "feat/x", "ignored")

    result = CliRunner().invoke(cli_group, ["list"], obj=_make_obj(gateway=gateway))

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["Handoffs on feat/x", "", "  - alpha"]


def test_handoff_list_explicit_branch_bypasses_current_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "bravo.md", "feat/other", "bravo")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/other"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["Handoffs on feat/other", "", "  - bravo"]


def test_handoff_list_all_branches(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all-branches"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "Handoffs across branches",
        "",
        "feat/a",
        "  - alpha",
        "",
        "feat/b",
        "  - bravo",
    ]


def test_handoff_json_list_all_branches(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all-branches", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "scope": "all-branches",
        "branch": None,
        "handoffs": [
            {
                "branch": "feat/a",
                "slug": "alpha",
                "key": "alpha.md",
                "entry_locator": "refs/brmem/ns/handoffs/feat---a:alpha.md",
            },
            {
                "branch": "feat/b",
                "slug": "bravo",
                "key": "bravo.md",
                "entry_locator": "refs/brmem/ns/handoffs/feat---b:bravo.md",
            },
        ],
    }


def test_handoff_list_empty_returns_message(cli_group: ClinkrGroup) -> None:
    current = CliRunner().invoke(cli_group, ["list"], obj=_make_obj())
    all_branches = CliRunner().invoke(
        cli_group,
        ["list", "--all-branches"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert current.exit_code == 0, current.output
    assert current.output == "No saved handoffs found on branch feat/x.\n"
    assert all_branches.exit_code == 0, all_branches.output
    assert all_branches.output == "No saved handoffs found across branches.\n"


def test_handoff_list_rejects_detached_head_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "Cannot list handoffs in detached HEAD" in result.output
    assert "--all-branches" in result.output


def test_handoff_list_surfaces_git_failure_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(
            branch=GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        ),
    )

    assert result.exit_code == 2
    assert "not a git repository" in result.output


def test_handoff_list_branch_and_all_branches_conflict(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/x", "--all-branches", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "branch_and_all_branches_conflict"
    assert "--branch and --all-branches are mutually exclusive." in payload["message"]


def test_handoff_list_rejects_invalid_branch(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat---x", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "invalid_branch_name"
    assert "feat---x" in payload["message"]
