"""Scenario tests for reconcile summary/diff exec commands."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRSummary
from asdl_core.git.testing import FakeGitGateway
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _pr(
    *,
    number: int,
    state: str,
    title: str = "PR title",
    url: str = "https://example.com/pull/0",
    head: str = "feat/x",
    base: str = "master",
) -> PRSummary:
    return PRSummary(
        number=number,
        title=title,
        url=url,
        head_ref_name=head,
        base_ref_name=base,
        state=state,  # type: ignore[arg-type]
    )


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    branches: tuple[str, ...] = ("master",),
    prs_by_branch: dict[str, PRSummary] | None = None,
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "master"},
        branches=branches,
        trunk_branch="master",
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(prs_by_branch=prs_by_branch or {}),
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed_summary_fixture() -> tuple[FakeBranchMemoryGateway, ClinkrContextObject]:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# Widget canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/merged", "# Widget branch\n")
    gateway.put("objectives", "widget-rewrite/notes.md", "feat/merged", "- finding A\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/closed", "# closed\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/merged", "feat/closed"),
        prs_by_branch={
            "feat/merged": _pr(
                number=42,
                state="MERGED",
                title="Add widget evidence",
                head="feat/merged",
            ),
            "feat/closed": _pr(number=43, state="CLOSED", head="feat/closed"),
        },
    )
    return gateway, obj


def test_reconcile_summary_json_excludes_raw_file_content(cli_group: ClinkrGroup) -> None:
    _, obj = _seed_summary_fixture()

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-summary", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["schema"] == "reconcile-summary/v1"
    assert data["success"] is True
    assert data["summary"] == {
        "slug_count": 1,
        "actionable_slug_count": 1,
        "gap_count": 0,
        "conflict_count": 0,
    }
    slug = data["slugs"][0]
    assert slug["slug"] == "widget-rewrite"
    assert "content" not in slug["canonical_files"][0]
    assert slug["included_snapshots"] == [
        {
            "branch": "feat/merged",
            "pr_number": 42,
            "pr_state": "MERGED",
            "pr_title": "Add widget evidence",
            "pr_url": "https://example.com/pull/0",
            "files": ["body.md", "notes.md"],
        }
    ]
    assert slug["skipped_snapshots"][0]["reason"] == "closed_unmerged"


def test_reconcile_summary_markdown(cli_group: ClinkrGroup) -> None:
    _, obj = _seed_summary_fixture()

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-summary", "--format", "markdown"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "# Objective reconcile summary" in result.output
    assert "## widget-rewrite" in result.output
    assert "Status: actionable" in result.output
    assert "PR #42 MERGED — feat/merged" in result.output
    assert "feat/closed — closed_unmerged" in result.output
    assert "# Widget canonical" not in result.output


def test_reconcile_diff_json_covers_changed_unchanged_and_missing_files(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "master", "# Body old\n")
    gateway.put("objectives", "widget/roadmap.md", "master", "- same\n")
    gateway.put("objectives", "widget/notes.md", "master", "- canonical only\n")
    gateway.put("objectives", "widget/body.md", "feat/merged", "# Body new\n")
    gateway.put("objectives", "widget/roadmap.md", "feat/merged", "- same\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/merged"),
        prs_by_branch={
            "feat/merged": _pr(number=44, state="MERGED", head="feat/merged"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-diff", "widget", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["schema"] == "reconcile-diff/v1"
    snapshot = data["snapshots"][0]
    assert snapshot["branch"] == "feat/merged"
    files = {file["file"]: file for file in snapshot["files"]}
    assert files["body.md"]["changed"] is True
    assert "-# Body old" in files["body.md"]["diff"]
    assert "+# Body new" in files["body.md"]["diff"]
    assert files["roadmap.md"] == {
        "file": "roadmap.md",
        "canonical_present": True,
        "snapshot_present": True,
        "changed": False,
        "diff": "",
    }
    assert files["notes.md"]["canonical_present"] is True
    assert files["notes.md"]["snapshot_present"] is False
    assert files["notes.md"]["changed"] is True


def test_reconcile_diff_markdown_and_multiple_snapshots(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "master", "# Canonical\n")
    gateway.put("objectives", "widget/body.md", "feat/a", "# A\n")
    gateway.put("objectives", "widget/body.md", "feat/b", "# B\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/a", "feat/b"),
        prs_by_branch={
            "feat/a": _pr(number=1, state="MERGED", head="feat/a"),
            "feat/b": _pr(number=2, state="MERGED", head="feat/b"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-diff", "widget", "--format", "markdown"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "# Diff: widget" in result.output
    assert "## PR #1 — feat/a" in result.output
    assert "## PR #2 — feat/b" in result.output
    assert "```diff" in result.output
    assert "--- canonical/widget/body.md" in result.output


def test_reconcile_diff_missing_canonical_file(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "master", "# Body\n")
    gateway.put("objectives", "widget/roadmap.md", "feat/merged", "- branch only\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/merged"),
        prs_by_branch={
            "feat/merged": _pr(number=45, state="MERGED", head="feat/merged"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-diff", "widget", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    files = {
        file["file"]: file for file in json.loads(result.output)["data"]["snapshots"][0]["files"]
    }
    assert files["roadmap.md"]["canonical_present"] is False
    assert files["roadmap.md"]["snapshot_present"] is True
    assert files["roadmap.md"]["changed"] is True
