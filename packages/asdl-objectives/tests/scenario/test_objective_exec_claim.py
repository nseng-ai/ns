"""Scenario tests for the skill-facing ``objective exec claim`` contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.claim import CLAIM_SCHEMA
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead = "feat/x",
    branches: tuple[str, ...] = ("master", "feat/x"),
    ancestors: tuple[tuple[str, str], ...] = (),
    commit_count_by_range: dict[str, int | GitCommandFailure] | None = None,
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        trunk_branch="master",
        ancestors=ancestors,
        commit_count_by_range=commit_count_by_range,
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _data(result: Result) -> dict[str, Any]:
    assert result.exit_code == 0, result.output
    return json.loads(result.output)["data"]


def _failure(result: Result) -> dict[str, Any]:
    assert result.exit_code == 2, result.output
    return json.loads(result.output)


def test_claim_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "claim", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec claim" in result.output


def test_claim_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "claim", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


def test_claim_explicit_slug_claims_canonical_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical body\n")
    gateway.put("objectives", "widget-rewrite/notes.md", "master", "- canonical note\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    data = _data(result)
    assert data["schema"] == CLAIM_SCHEMA
    assert data["status"] == "claimed"
    assert data["result"]["slug"] == "widget-rewrite"
    assert data["result"]["source_kind"] == "branch"
    assert data["result"]["source_label"] == "canonical objective"
    assert {file["file"] for file in data["result"]["files_carried"]} == {
        "body.md",
        "notes.md",
    }
    assert "Claimed objective: widget-rewrite" in data["message"]
    assert "objective-reconcile widget-rewrite on master" in data["message"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# canonical body\n"
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") == "- canonical note\n"


def test_claim_from_file_bootstraps_body_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    gateway = FakeBranchMemoryGateway()
    body_path = tmp_path / "body.md"
    body_path.write_text("# bootstrap body\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "widget-rewrite", "--from-file", str(body_path), "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )

    data = _data(result)
    assert data["status"] == "claimed"
    assert data["result"]["source_kind"] == "local_file"
    assert [file["file"] for file in data["result"]["files_carried"]] == ["body.md"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# bootstrap body\n"
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") is None


def test_claim_implicit_slug_picks_nearest_single_ancestor_objective(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# canonical alpha\n")
    gateway.put("objectives", "alpha/body.md", "feat/parent", "# parent alpha\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/parent"),
        ancestors=(("feat/parent", "HEAD"),),
        commit_count_by_range={"feat/parent..HEAD": 3},
    )

    result = CliRunner().invoke(cli_group, ["exec", "claim", "--format", "json"], obj=obj)

    data = _data(result)
    assert data["status"] == "claimed"
    assert data["result"]["slug"] == "alpha"
    assert data["result"]["source_branch"] == "feat/parent"
    assert data["result"]["source_label"] == "ancestor branch feat/parent"
    assert gateway.get("objectives", "alpha/body.md", "feat/x") == "# parent alpha\n"


def test_claim_implicit_slug_falls_back_to_canonical(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# canonical alpha\n")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )

    data = _data(result)
    assert data["status"] == "claimed"
    assert data["result"]["slug"] == "alpha"
    assert data["result"]["source_label"] == "canonical objective"
    assert gateway.get("objectives", "alpha/body.md", "feat/x") == "# canonical alpha\n"


def test_claim_multiple_candidate_slugs_returns_selection(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/parent", "# alpha\n")
    gateway.put("objectives", "beta/body.md", "feat/parent", "# beta\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/parent"),
        ancestors=(("feat/parent", "HEAD"),),
        commit_count_by_range={"feat/parent..HEAD": 2},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "--target", "feat/custom", "--format", "json"],
        obj=obj,
    )

    data = _data(result)
    assert data["status"] == "needs_selection"
    assert data["selection"]["kind"] == "slug"
    assert data["selection"]["prompt"] == "Multiple objectives are reachable. Choose one to claim:"
    assert data["result"] is None
    assert data["block"] is None
    options = {option["value"]: option for option in data["selection"]["options"]}
    assert options["alpha"]["rerun_args"] == ["alpha", "--target", "feat/custom"]
    assert options["beta"]["rerun_args"] == ["beta", "--target", "feat/custom"]
    assert "objective exec claim alpha --target feat/custom" in data["message"]


def test_claim_tied_source_branches_returns_selection(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/a", "# alpha from a\n")
    gateway.put("objectives", "alpha/body.md", "feat/b", "# alpha from b\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/a", "feat/b"),
        ancestors=(("feat/a", "HEAD"), ("feat/b", "HEAD")),
        commit_count_by_range={"feat/a..HEAD": 1, "feat/b..HEAD": 1},
    )

    result = CliRunner().invoke(cli_group, ["exec", "claim", "--format", "json"], obj=obj)

    data = _data(result)
    assert data["status"] == "needs_selection"
    assert data["selection"]["kind"] == "source_branch"
    options = {option["value"]: option for option in data["selection"]["options"]}
    assert options["feat/a"]["rerun_args"] == ["alpha", "--from", "feat/a"]
    assert options["feat/b"]["rerun_args"] == ["alpha", "--from", "feat/b"]


def test_claim_missing_source_returns_blocked(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "missing", "--format", "json"],
        obj=_make_obj(gateway=FakeBranchMemoryGateway()),
    )

    data = _data(result)
    assert data["status"] == "blocked"
    assert data["block"]["reason"] == "explicit_slug_not_found"
    assert "Cannot claim objective" in data["message"]
    assert data["selection"] is None
    assert data["result"] is None


def test_claim_explicit_from_branch_missing_slug_returns_blocked(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "other/body.md", "feat/source", "# other\n")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "widget-rewrite", "--from", "feat/source", "--format", "json"],
        obj=_make_obj(gateway=gateway, branches=("master", "feat/x", "feat/source")),
    )

    data = _data(result)
    assert data["status"] == "blocked"
    assert data["block"]["reason"] == "from_missing_slug"
    assert "feat/source" in data["message"]


def test_claim_target_already_carries_slug_returns_blocked(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# already claimed\n")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "widget-rewrite", "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )

    data = _data(result)
    assert data["status"] == "blocked"
    assert data["block"]["reason"] == "target_collision"
    assert "already carries keys" in data["message"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# already claimed\n"


def test_claim_detached_head_without_target_exits_nonzero(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "widget-rewrite", "--format", "json"],
        obj=_make_obj(gateway=FakeBranchMemoryGateway(), current_branch=DetachedHead()),
    )

    payload = _failure(result)
    assert payload["error_type"] == "detached_head"


def test_claim_target_trunk_exits_nonzero(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "widget-rewrite", "--target", "master", "--format", "json"],
        obj=_make_obj(gateway=FakeBranchMemoryGateway()),
    )

    payload = _failure(result)
    assert payload["error_type"] == "target_is_trunk"


def test_claim_from_and_from_file_together_exit_nonzero(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim",
            "widget-rewrite",
            "--from",
            "feat/source",
            "--from-file",
            str(body_path),
            "--format",
            "json",
        ],
        obj=_make_obj(gateway=FakeBranchMemoryGateway()),
    )

    payload = _failure(result)
    assert payload["error_type"] == "conflicting_source_flags"


def test_claim_from_without_explicit_slug_exits_nonzero(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "--from", "feat/source", "--format", "json"],
        obj=_make_obj(gateway=FakeBranchMemoryGateway()),
    )

    payload = _failure(result)
    assert payload["error_type"] == "source_flag_without_slug"


def test_claim_from_file_without_explicit_slug_exits_nonzero(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim", "--from-file", str(body_path), "--format", "json"],
        obj=_make_obj(gateway=FakeBranchMemoryGateway()),
    )

    payload = _failure(result)
    assert payload["error_type"] == "source_flag_without_slug"
