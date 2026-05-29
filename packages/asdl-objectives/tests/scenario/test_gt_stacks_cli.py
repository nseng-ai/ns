from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch
from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import GtBranchGraph, GtCommandFailure, GtTrackedBranch
from asdl_objectives.context import ObjectiveCliContext, ObjectiveCliUnavailable
from asdl_objectives.gt.context import ObjectiveGtContext
from asdl_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


# ---------------------------------------------------------------------------
# Section-10 fakes (blueprint §5.4 / §5.5 / §6.1)
# ---------------------------------------------------------------------------


def _section10_gt() -> FakeGtGateway:
    return FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=("feat/a", "feat/b"),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(
                    name="feat/a",
                    parent="main",
                    children=("feat/connector",),
                    validation_result="OK",
                ),
                GtTrackedBranch(
                    name="feat/connector",
                    parent="feat/a",
                    children=("feat/c",),
                    validation_result="VALID",
                    needs_restack=True,
                ),
                GtTrackedBranch(
                    name="feat/c",
                    parent="feat/connector",
                    children=(),
                    validation_result=None,
                ),
                GtTrackedBranch(
                    name="feat/b",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
            ),
            warnings=(),
        )
    )


def _section10_git() -> FakeGitGateway:
    return FakeGitGateway(
        repo_root=Path("/repo"),
        branches=("main", "feat/a", "feat/connector", "feat/c", "feat/b"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a-multi",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md", ".asdl/objectives/beta/o.md"),
                ),
            ),
            ("feat/connector..feat/c", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="c-alpha",
                    committed_iso="2026-05-20T11:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
            ("main..feat/b", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="b-alpha",
                    committed_iso="2026-05-20T12:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
        },
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
    )


def _ctx(
    *,
    gt: FakeGtGateway,
    git: FakeGitGateway,
    repo_root: Path = Path("/repo"),
    trunk_branch: str = "main",
) -> ObjectiveGtContext:
    return ObjectiveGtContext(
        base=ObjectiveCliContext(repo_root=repo_root, trunk_branch=trunk_branch, git=git),
        gt=gt,
    )


def _invoke(
    cli_group: ClinkrGroup,
    ctx: ObjectiveGtContext | ObjectiveCliUnavailable,
    *,
    fmt: str | None = None,
    json_schema: bool = False,
) -> Result:
    args = ["gt", "stacks"]
    if json_schema:
        args.append("--json-schema")
    if fmt is not None:
        args.extend(("--format", fmt))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


# ---------------------------------------------------------------------------
# A9 — help
# ---------------------------------------------------------------------------


def test_a9_gt_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective gt" in result.output
    assert "Work with Graphite Objective stack projections" in result.output
    assert "stacks" in result.output


def test_a9_gt_is_visible_in_top_level_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "gt" in result.output


def test_a9_stacks_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "stacks", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective gt stacks" in result.output
    assert "Show Objective work across Graphite-tracked branches" in result.output
    assert "--format" in result.output
    assert "--json-schema" in result.output


# ---------------------------------------------------------------------------
# A10 — JSON envelope + --json-schema
# ---------------------------------------------------------------------------


_EXPECTED_ENVELOPE = {
    "exit_code": 0,
    "data": {
        "trunk_branch": "main",
        "warnings": [],
        "objectives": [
            {
                "slug": "alpha",
                "status": "open",
                "objective_branch_count": 3,
                "segment_count": 2,
                "latest_work": {
                    "branch": "feat/b",
                    "committed_iso": "2026-05-20T12:00:00Z",
                    "oid": "b-alpha",
                },
                "segments": [
                    {
                        "index": 1,
                        "rows": [
                            {
                                "branch": "feat/a",
                                "parent": "main",
                                "depth": 0,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": ["beta"],
                                "validation_result": "OK",
                                "needs_restack": False,
                            },
                            {
                                "branch": "feat/connector",
                                "parent": "feat/a",
                                "depth": 1,
                                "touches_objective": False,
                                "connector": True,
                                "also_touches": [],
                                "validation_result": "VALID",
                                "needs_restack": True,
                            },
                            {
                                "branch": "feat/c",
                                "parent": "feat/connector",
                                "depth": 2,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": [],
                                "validation_result": None,
                                "needs_restack": False,
                            },
                        ],
                    },
                    {
                        "index": 2,
                        "rows": [
                            {
                                "branch": "feat/b",
                                "parent": "main",
                                "depth": 0,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": [],
                                "validation_result": None,
                                "needs_restack": False,
                            }
                        ],
                    },
                ],
            },
            {
                "slug": "beta",
                "status": "in-flight",
                "objective_branch_count": 1,
                "segment_count": 1,
                "latest_work": {
                    "branch": "feat/a",
                    "committed_iso": "2026-05-20T10:00:00Z",
                    "oid": "a-multi",
                },
                "segments": [
                    {
                        "index": 1,
                        "rows": [
                            {
                                "branch": "feat/a",
                                "parent": "main",
                                "depth": 0,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": ["alpha"],
                                "validation_result": "OK",
                                "needs_restack": False,
                            }
                        ],
                    }
                ],
            },
        ],
    },
}


def test_a10_json_envelope_verbatim(cli_group: ClinkrGroup) -> None:
    result = _invoke(cli_group, _ctx(gt=_section10_gt(), git=_section10_git()), fmt="json")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == _EXPECTED_ENVELOPE


def test_a10_empty_collections_serialize_as_arrays(cli_group: ClinkrGroup) -> None:
    gt = FakeGtGateway(trunk="main")
    git = FakeGitGateway(branches=("main",), trunk_branch="main")

    result = _invoke(cli_group, _ctx(gt=gt, git=git), fmt="json")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data == {"trunk_branch": "main", "warnings": [], "objectives": []}


def test_a10_json_schema_prints_input_and_output_and_exits_zero(cli_group: ClinkrGroup) -> None:
    result = _invoke(
        cli_group,
        _ctx(gt=_section10_gt(), git=_section10_git()),
        json_schema=True,
    )

    assert result.exit_code == 0, result.output
    doc = json.loads(result.output)
    assert "input_json_schema" in doc
    assert "output_json_schema" in doc


# ---------------------------------------------------------------------------
# A11 — failure taxonomy
# ---------------------------------------------------------------------------


def test_a11_not_in_repo(cli_group: ClinkrGroup) -> None:
    result = _invoke(
        cli_group,
        ObjectiveCliUnavailable("Not inside a git repository."),
        fmt="json",
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "not_in_repo",
        "message": "Not inside a git repository.",
    }


def test_a11_not_in_repo_human_stderr(cli_group: ClinkrGroup) -> None:
    result = _invoke(cli_group, ObjectiveCliUnavailable("Not inside a git repository."))

    assert result.exit_code == 2
    assert "error: Not inside a git repository." in result.stderr


def test_a11_gt_branch_graph_failed(cli_group: ClinkrGroup) -> None:
    gt = FakeGtGateway(branch_graph=GtCommandFailure(message="metadata missing", returncode=None))
    git = FakeGitGateway(branches=("main",), trunk_branch="main")

    result = _invoke(cli_group, _ctx(gt=gt, git=git), fmt="json")

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert "data" not in payload
    assert payload == {
        "exit_code": 2,
        "error_type": "gt_branch_graph_failed",
        "message": "Graphite branch graph failed: metadata missing",
    }


def test_a11_gt_branch_graph_failed_human_stderr(cli_group: ClinkrGroup) -> None:
    gt = FakeGtGateway(branch_graph=GtCommandFailure(message="metadata missing", returncode=None))
    git = FakeGitGateway(branches=("main",), trunk_branch="main")

    result = _invoke(cli_group, _ctx(gt=gt, git=git))

    assert result.exit_code == 2
    assert "error: Graphite branch graph failed: metadata missing" in result.stderr


def _single_branch_gt() -> FakeGtGateway:
    return FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=("feat/a",),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(name="feat/a", parent="main", children=(), validation_result="OK"),
            ),
            warnings=(),
        )
    )


def test_a11_gt_slice_read_failed(cli_group: ClinkrGroup) -> None:
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): GitCommandFailure(
                message="slice boom", returncode=128
            ),
        },
    )

    result = _invoke(cli_group, _ctx(gt=_single_branch_gt(), git=git), fmt="json")

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert "data" not in payload
    assert payload == {
        "exit_code": 2,
        "error_type": "gt_slice_read_failed",
        "message": "Failed to read branch slice: slice boom",
    }


def test_a11_trunk_status_read_failed(cli_group: ClinkrGroup) -> None:
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
        },
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): GitCommandFailure(
                message="trunk boom", returncode=129
            ),
        },
    )

    result = _invoke(cli_group, _ctx(gt=_single_branch_gt(), git=git), fmt="json")

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert "data" not in payload
    assert payload == {
        "exit_code": 2,
        "error_type": "trunk_status_read_failed",
        "message": "Failed to read trunk Objective status: trunk boom",
    }


# ---------------------------------------------------------------------------
# A14 — md == markdown conformance
# ---------------------------------------------------------------------------


def test_a14_md_equals_markdown(cli_group: ClinkrGroup) -> None:
    md = _invoke(cli_group, _ctx(gt=_section10_gt(), git=_section10_git()), fmt="md")
    markdown = _invoke(cli_group, _ctx(gt=_section10_gt(), git=_section10_git()), fmt="markdown")

    assert md.exit_code == 0, md.output
    assert markdown.exit_code == 0, markdown.output
    assert md.output == markdown.output
    assert md.output.startswith("# Objective stacks")
