"""Scenario tests for ``objective exec attach``.

The high-level command is the agent-facing attach contract. It wraps the
lower-level plan/apply commands, applies unique plans, and returns generic
selection or blocked payloads without requiring callers to understand
internal planner reason codes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.attach import ATTACH_SCHEMA, PLAN_SCHEMA
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


def test_attach_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "attach", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec attach" in result.output


def test_attach_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "attach", "--json-schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_attach_explicit_slug_applies_unique_plan(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical body\n")
    gateway.put("objectives", "widget-rewrite/notes.md", "master", "- canonical note\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "attach", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["json_schema"] == ATTACH_SCHEMA
    assert data["status"] == "attached"
    assert data["result"]["json_schema"] == PLAN_SCHEMA
    assert data["result"]["slug"] == "widget-rewrite"
    assert data["result"]["source_label"] == "canonical objective"
    assert {f["file"] for f in data["result"]["files_carried"]} == {
        "body.md",
        "notes.md",
    }
    assert "Attached objective: widget-rewrite" in data["message"]
    assert "objective-reconcile widget-rewrite on master" in data["message"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# canonical body\n"
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") == "- canonical note\n"


def test_attach_ambiguous_slugs_returns_generic_selection(cli_group: ClinkrGroup) -> None:
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
        ["exec", "attach", "--target", "feat/custom", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "needs_selection"
    assert data["selection"]["kind"] == "slug"
    assert data["selection"]["prompt"] == "Multiple objectives are reachable. Choose one to attach:"
    assert data["result"] is None
    assert data["block"] is None
    options = {option["value"]: option for option in data["selection"]["options"]}
    assert options["alpha"]["rerun_args"] == ["alpha", "--target", "feat/custom"]
    assert options["beta"]["rerun_args"] == ["beta", "--target", "feat/custom"]
    assert "objective exec attach alpha --target feat/custom" in data["message"]


def test_attach_ambiguous_sources_includes_resolved_slug_in_rerun_args(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/a", "# alpha from a\n")
    gateway.put("objectives", "alpha/body.md", "feat/b", "# alpha from b\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/a", "feat/b"),
        ancestors=(("feat/a", "HEAD"), ("feat/b", "HEAD")),
        commit_count_by_range={"feat/a..HEAD": 1, "feat/b..HEAD": 1},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "attach", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "needs_selection"
    assert data["selection"]["kind"] == "source_branch"
    options = {option["value"]: option for option in data["selection"]["options"]}
    assert options["feat/a"]["rerun_args"] == ["alpha", "--from", "feat/a"]
    assert options["feat/b"]["rerun_args"] == ["alpha", "--from", "feat/b"]


def test_attach_plan_error_returns_blocked(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "attach", "missing", "--format", "json"],
        obj=_make_obj(gateway=FakeBranchMemoryGateway()),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "blocked"
    assert data["block"]["reason"] == "explicit_slug_not_found"
    assert "Cannot attach objective" in data["message"]
    assert data["selection"] is None
    assert data["result"] is None
