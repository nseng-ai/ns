"""Scenario-style coverage for the internal attach planner.

The planner resolves a one-slug carry-forward deterministically. These tests
exercise the structured plan / ambiguity / error result shape, source cascade,
and hard preconditions without exposing a separate ``objective exec`` command.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.serialization import serialize_to_json_dict
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.attach import PLAN_SCHEMA, AttachPlanRequest, plan_attach_objective
from brmem.fake import FakeBranchMemoryGateway


def _make_ctx(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead = "feat/x",
    branches: tuple[str, ...] = ("master", "feat/x"),
    ancestors: tuple[tuple[str, str], ...] = (),
    commit_count_by_range: dict[str, int | GitCommandFailure] | None = None,
) -> ObjectiveCliContext:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        trunk_branch="master",
        ancestors=ancestors,
        commit_count_by_range=commit_count_by_range,
    )
    return ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )


def _plan_data(ctx: ObjectiveCliContext, request: AttachPlanRequest) -> dict:
    return serialize_to_json_dict(plan_attach_objective(ctx, request))


def _assert_hard_failure(
    ctx: ObjectiveCliContext,
    request: AttachPlanRequest,
    *,
    error_type: str,
) -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        plan_attach_objective(ctx, request)

    assert exc_info.value.error_type == error_type


def test_attach_plan_explicit_slug_falls_back_to_canonical() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    ctx = _make_ctx(gateway=gateway)

    data = _plan_data(ctx, AttachPlanRequest(slug="widget-rewrite"))

    assert data["json_schema"] == PLAN_SCHEMA
    assert data["status"] == "plan"
    assert data["plan"]["slug"] == "widget-rewrite"
    assert data["plan"]["target_branch"] == "feat/x"
    assert data["plan"]["source"]["kind"] == "canonical"
    assert data["plan"]["source"]["branch"] == "master"
    assert data["plan"]["source"]["from_file_path"] is None
    assert data["plan"]["source"]["label"] == "canonical objective"
    assert data["ambiguity"] is None
    assert data["error"] is None


def test_attach_plan_explicit_slug_explicit_from_branch() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/source", "# source\n")
    ctx = _make_ctx(
        gateway=gateway,
        branches=("master", "feat/x", "feat/source"),
    )

    data = _plan_data(
        ctx,
        AttachPlanRequest(slug="widget-rewrite", from_branch="feat/source"),
    )

    assert data["status"] == "plan"
    assert data["plan"]["source"]["kind"] == "branch"
    assert data["plan"]["source"]["branch"] == "feat/source"
    assert "explicit --from" in data["plan"]["source"]["label"]


def test_attach_plan_explicit_slug_explicit_from_file(tmp_path: Path) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# new body\n", encoding="utf-8")
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    data = _plan_data(
        ctx,
        AttachPlanRequest(slug="widget-rewrite", from_file=str(body_path)),
    )

    assert data["status"] == "plan"
    assert data["plan"]["source"]["kind"] == "local_file"
    assert data["plan"]["source"]["from_file_path"] == str(body_path)
    assert data["plan"]["source"]["branch"] is None
    assert "local file" in data["plan"]["source"]["label"]


def test_attach_plan_no_slug_single_candidate_ancestor() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# canonical alpha\n")
    gateway.put("objectives", "alpha/body.md", "feat/parent", "# parent alpha\n")
    ctx = _make_ctx(
        gateway=gateway,
        branches=("master", "feat/x", "feat/parent"),
        ancestors=(("feat/parent", "HEAD"),),
        commit_count_by_range={"feat/parent..HEAD": 3},
    )

    data = _plan_data(ctx, AttachPlanRequest())

    assert data["status"] == "plan"
    assert data["plan"]["slug"] == "alpha"
    assert data["plan"]["source"]["kind"] == "branch"
    assert data["plan"]["source"]["branch"] == "feat/parent"
    assert data["plan"]["source"]["label"].startswith("ancestor branch ")


def test_attach_plan_no_slug_multi_candidate_ancestor() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/parent", "# alpha\n")
    gateway.put("objectives", "beta/body.md", "feat/parent", "# beta\n")
    ctx = _make_ctx(
        gateway=gateway,
        branches=("master", "feat/x", "feat/parent"),
        ancestors=(("feat/parent", "HEAD"),),
        commit_count_by_range={"feat/parent..HEAD": 2},
    )

    data = _plan_data(ctx, AttachPlanRequest())

    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "ambiguous_slug_candidates"
    assert {a["slug"] for a in amb["slug_alternatives"]} == {"alpha", "beta"}
    assert amb["branch_alternatives"] == []
    assert all(a["available_on_branch"] == "feat/parent" for a in amb["slug_alternatives"])


def test_attach_plan_no_slug_canonical_fallback_lists_master_slugs() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# alpha\n")
    gateway.put("objectives", "beta/body.md", "master", "# beta\n")
    gateway.put("objectives", "gamma/body.md", "master", "# gamma\n")
    ctx = _make_ctx(gateway=gateway, branches=("master", "feat/x"))

    data = _plan_data(ctx, AttachPlanRequest())

    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "ambiguous_slug_candidates"
    assert {a["slug"] for a in amb["slug_alternatives"]} == {"alpha", "beta", "gamma"}
    assert all(a["available_on_branch"] == "master" for a in amb["slug_alternatives"])


def test_attach_plan_no_slug_nothing_reachable() -> None:
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway(), branches=("master", "feat/x"))

    data = _plan_data(ctx, AttachPlanRequest())

    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "no_slug_no_candidates"
    assert "objective-create" in amb["message"]
    assert "--from-file" in amb["message"]
    assert amb["slug_alternatives"] == []
    assert amb["branch_alternatives"] == []


def test_attach_plan_target_collision() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# already attached\n")
    ctx = _make_ctx(gateway=gateway, branches=("master", "feat/x"))

    data = _plan_data(ctx, AttachPlanRequest(slug="widget-rewrite"))

    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "target_collision"
    assert "feat/x" in err["message"]
    assert "widget-rewrite" in err["message"]


def test_attach_plan_explicit_slug_not_found_anywhere() -> None:
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway(), branches=("master", "feat/x"))

    data = _plan_data(ctx, AttachPlanRequest(slug="ghost"))

    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "explicit_slug_not_found"
    assert "ghost" in err["message"]


def test_attach_plan_from_branch_missing_slug() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "other/body.md", "feat/source", "# other\n")
    ctx = _make_ctx(gateway=gateway, branches=("master", "feat/x", "feat/source"))

    data = _plan_data(
        ctx,
        AttachPlanRequest(slug="widget-rewrite", from_branch="feat/source"),
    )

    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "from_missing_slug"
    assert "feat/source" in err["message"]


def test_attach_plan_from_file_missing(tmp_path: Path) -> None:
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    data = _plan_data(
        ctx,
        AttachPlanRequest(slug="widget-rewrite", from_file=str(tmp_path / "does-not-exist.md")),
    )

    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "from_file_unreadable"


def test_attach_plan_detached_head_without_target_fails_hard() -> None:
    ctx = _make_ctx(
        gateway=FakeBranchMemoryGateway(),
        current_branch=DetachedHead(),
        branches=("master",),
    )

    _assert_hard_failure(
        ctx,
        AttachPlanRequest(slug="widget-rewrite"),
        error_type="detached_head",
    )


def test_attach_plan_target_trunk_fails_hard() -> None:
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    _assert_hard_failure(
        ctx,
        AttachPlanRequest(slug="widget-rewrite", target="master"),
        error_type="target_is_trunk",
    )


def test_attach_plan_from_branch_and_from_file_together_fail_hard(tmp_path: Path) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    _assert_hard_failure(
        ctx,
        AttachPlanRequest(
            slug="widget-rewrite",
            from_branch="feat/source",
            from_file=str(body_path),
        ),
        error_type="conflicting_source_flags",
    )


def test_attach_plan_from_branch_without_slug_fails_hard() -> None:
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    _assert_hard_failure(
        ctx,
        AttachPlanRequest(from_branch="feat/source"),
        error_type="source_flag_without_slug",
    )


def test_attach_plan_from_file_without_slug_fails_hard(tmp_path: Path) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    _assert_hard_failure(
        ctx,
        AttachPlanRequest(from_file=str(body_path)),
        error_type="source_flag_without_slug",
    )


def test_attach_plan_envelope_shape_is_deterministic(tmp_path: Path) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")
    ctx = _make_ctx(gateway=FakeBranchMemoryGateway())

    data = _plan_data(
        ctx,
        AttachPlanRequest(slug="widget-rewrite", from_file=str(body_path)),
    )

    assert set(data.keys()) == {
        "json_schema",
        "canonical_branch",
        "requested_slug",
        "resolved_slug",
        "requested_target",
        "requested_from_branch",
        "requested_from_file",
        "status",
        "plan",
        "ambiguity",
        "error",
    }
    assert data["json_schema"] == PLAN_SCHEMA
    assert data["canonical_branch"] == "master"
    assert data["requested_slug"] == "widget-rewrite"
    assert data["resolved_slug"] == "widget-rewrite"
    assert data["requested_target"] is None
    assert data["requested_from_branch"] is None
    assert data["requested_from_file"] == str(body_path)


def test_attach_plan_nearest_ancestor_wins() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/near", "# near\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/far", "# far\n")
    ctx = _make_ctx(
        gateway=gateway,
        branches=("master", "feat/x", "feat/near", "feat/far"),
        ancestors=(("feat/near", "HEAD"), ("feat/far", "HEAD")),
        commit_count_by_range={
            "feat/near..HEAD": 1,
            "feat/far..HEAD": 5,
        },
    )

    data = _plan_data(ctx, AttachPlanRequest(slug="widget-rewrite"))

    assert data["status"] == "plan"
    assert data["plan"]["source"]["branch"] == "feat/near"


def test_attach_plan_tied_ancestors_are_ambiguous() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/a", "# a\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/b", "# b\n")
    ctx = _make_ctx(
        gateway=gateway,
        branches=("master", "feat/x", "feat/a", "feat/b"),
        ancestors=(("feat/a", "HEAD"), ("feat/b", "HEAD")),
        commit_count_by_range={
            "feat/a..HEAD": 2,
            "feat/b..HEAD": 2,
        },
    )

    data = _plan_data(ctx, AttachPlanRequest(slug="widget-rewrite"))

    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "ambiguous_source_branches"
    assert [c["branch"] for c in amb["branch_alternatives"]] == ["feat/a", "feat/b"]
    assert all(c["distance"] == 2 for c in amb["branch_alternatives"])
