"""Scenario tests for ``objective exec record-evidence``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.testing import FakeIssueGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import CommitSummary, DetachedHead
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead = "feat/x",
    branches: tuple[str, ...] = ("feat/x",),
    branch_head_oid_by_branch: dict[str, str] | None = None,
    commits_by_range: dict[str, tuple[CommitSummary, ...]] | None = None,
    patch_ids_by_range: dict[str, tuple[tuple[str, str | None], ...]] | None = None,
) -> ClinkrContextObject:
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=FakeGitGateway(
            current_branch_by_path={Path.cwd(): current_branch},
            branches=branches,
            branch_head_oid_by_branch=branch_head_oid_by_branch,
            commits_by_range=commits_by_range,
            patch_ids_by_range=patch_ids_by_range,
            trunk_branch="master",
        ),
        pr_gateway=FakePRGateway(),
        issue_gateway=FakeIssueGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def test_record_evidence_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "record-evidence", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec record-evidence" in result.output


def test_record_evidence_writes_marker(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/x", "# Widget\n")
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    obj = _make_obj(
        gateway=gateway,
        branch_head_oid_by_branch={"feat/x": "head-1"},
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={"master..HEAD": (("sha-2", "pid-2"), ("sha-1", "pid-1"))},
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-evidence",
            "widget",
            "--expected-head",
            "head-1",
            "--format",
            "json",
        ],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["marker_key"] == "widget/.durable-evidence.jsonl"
    assert data["old_head_sha"] is None
    assert data["new_head_sha"] is not None
    assert [(r["sha"], r["patch_id"]) for r in data["records"]] == [
        ("sha-1", "pid-1"),
        ("sha-2", "pid-2"),
    ]
    assert gateway.get("objectives", "widget/.durable-evidence.jsonl", "feat/x") == (
        '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
        '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
        '{"schema":1,"sha":"sha-2","patch_id":"pid-2",'
        '"author_iso":"2026-04-26T19:00:00+00:00","subject":"Second"}\n'
    )


def test_record_evidence_rejects_moved_head(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/x", "# Widget\n")
    obj = _make_obj(
        gateway=gateway,
        branch_head_oid_by_branch={"feat/x": "head-after"},
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-evidence",
            "widget",
            "--expected-head",
            "head-before",
            "--format",
            "json",
        ],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "head_moved"
    assert gateway.get("objectives", "widget/.durable-evidence.jsonl", "feat/x") is None


def test_record_evidence_requires_attached_slug(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        branch_head_oid_by_branch={"feat/x": "head-1"},
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-evidence",
            "widget",
            "--expected-head",
            "head-1",
            "--format",
            "json",
        ],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "slug_not_attached"
