"""Scenario tests for ``objective close`` and ``objective reopen``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(gateway: FakeBranchMemoryGateway) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "feat/x"},
        branches=("master", "feat/x"),
        trunk_branch="master",
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed_canonical(slug: str = "demo") -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", f"{slug}/body.md", "master", "seed\n")
    return gateway


def _seed_archived(slug: str = "demo") -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives-archive", f"{slug}/body.md", "master", "seed\n")
    gateway.put("objectives-archive", f"{slug}/.closed", "master", '{"schema":1,"closed_at":"t"}\n')
    return gateway


def test_close_moves_active_entries_to_archive(cli_group: ClinkrGroup) -> None:
    gateway = _seed_canonical()
    gateway.put("objectives", "demo/body.md", "feat/x", "branch snapshot\n")

    result = CliRunner().invoke(
        cli_group,
        ["close", "demo", "--reason", "shipped"],
        obj=_make_obj(gateway),
    )

    assert result.exit_code == 0, result.output
    assert "Closed demo on master" in result.output
    assert gateway.get("objectives", "demo/body.md", "master") is None
    assert gateway.get("objectives", "demo/body.md", "feat/x") is None
    assert gateway.get("objectives-archive", "demo/body.md", "master") == "seed\n"
    assert gateway.get("objectives-archive", "demo/body.md", "feat/x") == "branch snapshot\n"
    content = gateway.get("objectives-archive", "demo/.closed", "master")
    assert content is not None
    payload = json.loads(content)
    assert payload["schema"] == 1
    assert payload["reason"] == "shipped"
    assert payload["closed_at"]


def test_close_is_idempotent_when_archived(cli_group: ClinkrGroup) -> None:
    gateway = _seed_canonical()
    runner = CliRunner()

    first = runner.invoke(cli_group, ["close", "demo"], obj=_make_obj(gateway))
    assert first.exit_code == 0, first.output
    closed_at_first = json.loads(gateway.get("objectives-archive", "demo/.closed", "master"))[
        "closed_at"
    ]

    second = runner.invoke(cli_group, ["close", "demo"], obj=_make_obj(gateway))
    assert second.exit_code == 0, second.output
    assert "already closed" in second.output
    closed_at_second = json.loads(gateway.get("objectives-archive", "demo/.closed", "master"))[
        "closed_at"
    ]
    assert closed_at_first == closed_at_second
    assert gateway.get("objectives", "demo/body.md", "master") is None


def test_close_unknown_slug_fails(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()

    result = CliRunner().invoke(
        cli_group,
        ["close", "missing"],
        obj=_make_obj(gateway),
    )

    assert result.exit_code == 2
    assert "missing" in result.output or "missing" in result.stderr


def test_close_fails_when_archive_conflicts_with_active(cli_group: ClinkrGroup) -> None:
    gateway = _seed_canonical()
    gateway.put("objectives-archive", "demo/body.md", "master", "different\n")
    gateway.put("objectives-archive", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    result = CliRunner().invoke(cli_group, ["close", "demo"], obj=_make_obj(gateway))

    assert result.exit_code == 2
    assert "archive" in result.output.lower() or "archive" in result.stderr.lower()
    assert gateway.get("objectives", "demo/body.md", "master") == "seed\n"


def test_close_cleans_active_refs_when_archive_already_matches(cli_group: ClinkrGroup) -> None:
    gateway = _seed_canonical()
    gateway.put("objectives-archive", "demo/body.md", "master", "seed\n")
    gateway.put("objectives-archive", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    result = CliRunner().invoke(cli_group, ["close", "demo"], obj=_make_obj(gateway))

    assert result.exit_code == 0, result.output
    assert "already closed" in result.output
    assert gateway.get("objectives", "demo/body.md", "master") is None
    assert gateway.get("objectives-archive", "demo/body.md", "master") == "seed\n"


def test_reopen_moves_archive_back_to_active(cli_group: ClinkrGroup) -> None:
    gateway = _seed_archived()
    gateway.put("objectives-archive", "demo/body.md", "feat/x", "branch snapshot\n")

    result = CliRunner().invoke(cli_group, ["reopen", "demo"], obj=_make_obj(gateway))

    assert result.exit_code == 0, result.output
    assert "Reopened demo" in result.output
    assert gateway.get("objectives", "demo/body.md", "master") == "seed\n"
    assert gateway.get("objectives", "demo/body.md", "feat/x") == "branch snapshot\n"
    assert gateway.get("objectives", "demo/.closed", "master") is None
    assert gateway.get("objectives-archive", "demo/body.md", "master") is None
    assert gateway.get("objectives-archive", "demo/.closed", "master") is None


def test_reopen_is_idempotent_on_open_objective(cli_group: ClinkrGroup) -> None:
    gateway = _seed_canonical()

    result = CliRunner().invoke(cli_group, ["reopen", "demo"], obj=_make_obj(gateway))

    assert result.exit_code == 0, result.output
    assert "already open" in result.output


def test_list_hides_closed_by_default(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "open-one/body.md", "master", "seed\n")
    gateway.put("objectives-archive", "closed-one/body.md", "master", "seed\n")
    gateway.put(
        "objectives-archive",
        "closed-one/.closed",
        "master",
        '{"schema":1,"closed_at":"t"}\n',
    )

    result = CliRunner().invoke(cli_group, ["list"], obj=_make_obj(gateway))

    assert result.exit_code == 0, result.output
    assert "open-one" in result.output
    assert "closed-one" not in result.output


def test_list_all_includes_closed(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "open-one/body.md", "master", "seed\n")
    gateway.put("objectives-archive", "closed-one/body.md", "master", "seed\n")
    gateway.put(
        "objectives-archive",
        "closed-one/.closed",
        "master",
        '{"schema":1,"closed_at":"t"}\n',
    )

    result = CliRunner().invoke(cli_group, ["list", "--all"], obj=_make_obj(gateway))

    assert result.exit_code == 0, result.output
    assert "open-one" in result.output
    assert "closed-one" in result.output
    assert "STATE" in result.output


def test_list_closed_only(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "open-one/body.md", "master", "seed\n")
    gateway.put("objectives-archive", "closed-one/body.md", "master", "seed\n")
    gateway.put(
        "objectives-archive",
        "closed-one/.closed",
        "master",
        '{"schema":1,"closed_at":"t"}\n',
    )

    result = CliRunner().invoke(cli_group, ["list", "--closed"], obj=_make_obj(gateway))

    assert result.exit_code == 0, result.output
    assert "closed-one" in result.output
    assert "open-one" not in result.output


def test_list_all_and_closed_conflict(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()

    result = CliRunner().invoke(cli_group, ["list", "--all", "--closed"], obj=_make_obj(gateway))

    assert result.exit_code == 2
