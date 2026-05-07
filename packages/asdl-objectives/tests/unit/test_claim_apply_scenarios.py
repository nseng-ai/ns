"""Scenario-style coverage for the internal claim applier.

The applier consumes a plan envelope and performs the carry-forward. These
tests cover plan-file shape validation, schema mismatch handling, branch-source
``brmem copy``, local-file source ``brmem put``, and apply-time drift checks.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.serialization import serialize_to_json_dict
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.claim import PLAN_SCHEMA, apply_claim_plan_file
from brmem.fake import FakeBranchMemoryGateway


def _make_ctx(gateway: FakeBranchMemoryGateway) -> ObjectiveCliContext:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "feat/x"},
        branches=("master", "feat/x"),
        trunk_branch="master",
    )
    return ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )


def _write_plan_file(
    tmp_path: Path,
    *,
    plan: dict[str, object] | None = None,
    status: str = "plan",
    schema: str = PLAN_SCHEMA,
    canonical_branch: str = "master",
    ambiguity: dict[str, object] | None = None,
    error: dict[str, object] | None = None,
) -> Path:
    envelope = {
        "json_schema": schema,
        "canonical_branch": canonical_branch,
        "requested_slug": None,
        "requested_target": None,
        "requested_from_branch": None,
        "requested_from_file": None,
        "status": status,
        "plan": plan,
        "ambiguity": ambiguity,
        "error": error,
    }
    plan_path = tmp_path / "plan.json"
    plan_path.write_text(json.dumps(envelope), encoding="utf-8")
    return plan_path


def _branch_source_plan(
    *,
    slug: str,
    target_branch: str,
    source_branch: str,
    label: str | None = None,
    kind: str = "branch",
) -> dict[str, object]:
    return {
        "slug": slug,
        "target_branch": target_branch,
        "source": {
            "kind": kind,
            "branch": source_branch,
            "from_file_path": None,
            "label": label or f"branch {source_branch} (explicit --from)",
        },
    }


def _local_file_plan(*, slug: str, target_branch: str, from_file_path: str) -> dict[str, object]:
    return {
        "slug": slug,
        "target_branch": target_branch,
        "source": {
            "kind": "local_file",
            "branch": None,
            "from_file_path": from_file_path,
            "label": f"local file {from_file_path}",
        },
    }


def _apply_data(ctx: ObjectiveCliContext, plan_file: Path) -> dict:
    return serialize_to_json_dict(apply_claim_plan_file(ctx, plan_file))


def _assert_hard_failure(
    ctx: ObjectiveCliContext,
    plan_file: Path,
    *,
    error_type: str,
) -> ClinkrFailure:
    with pytest.raises(ClinkrFailure) as exc_info:
        apply_claim_plan_file(ctx, plan_file)

    assert exc_info.value.error_type == error_type
    return exc_info.value


def test_claim_apply_branch_source_carries_every_file(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/source", "# source body\n")
    gateway.put("objectives", "widget-rewrite/notes.md", "feat/source", "- finding A\n")
    plan = _write_plan_file(
        tmp_path,
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    ctx = _make_ctx(gateway)

    data = _apply_data(ctx, plan)

    assert data["json_schema"] == PLAN_SCHEMA
    assert data["slug"] == "widget-rewrite"
    assert data["target_branch"] == "feat/x"
    assert data["source_kind"] == "branch"
    assert data["source_branch"] == "feat/source"
    assert {f["file"] for f in data["files_carried"]} == {"body.md", "notes.md"}
    assert data["destination_ref"] == "refs/brmem/ns/objectives/feat---x"
    assert data["destination_commit_sha"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# source body\n"
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") == "- finding A\n"


def test_claim_apply_local_file_source_writes_only_body(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    body_path = tmp_path / "body.md"
    body_path.write_text("# new body from disk\n", encoding="utf-8")
    plan = _write_plan_file(
        tmp_path,
        plan=_local_file_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            from_file_path=str(body_path),
        ),
    )
    ctx = _make_ctx(gateway)

    data = _apply_data(ctx, plan)

    assert data["source_kind"] == "local_file"
    assert data["source_branch"] is None
    assert [f["file"] for f in data["files_carried"]] == ["body.md"]
    assert data["destination_commit_sha"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# new body from disk\n"
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") is None
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "feat/x") is None


def test_claim_apply_rejects_malformed_json(tmp_path: Path) -> None:
    plan_path = tmp_path / "bad.json"
    plan_path.write_text("not-json", encoding="utf-8")
    ctx = _make_ctx(FakeBranchMemoryGateway())

    _assert_hard_failure(ctx, plan_path, error_type="malformed_plan_file")


def test_claim_apply_rejects_schema_mismatch(tmp_path: Path) -> None:
    plan = _write_plan_file(
        tmp_path,
        schema="claim-plan/v0",
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    ctx = _make_ctx(FakeBranchMemoryGateway())

    failure = _assert_hard_failure(ctx, plan, error_type="schema_mismatch")

    assert "claim-plan/v0" in failure.message


def test_claim_apply_rejects_non_plan_status(tmp_path: Path) -> None:
    plan = _write_plan_file(
        tmp_path,
        status="ambiguous",
        plan=None,
        ambiguity={
            "reason": "ambiguous_slug_candidates",
            "message": "pick one",
            "slug_alternatives": [],
            "branch_alternatives": [],
        },
    )
    ctx = _make_ctx(FakeBranchMemoryGateway())

    _assert_hard_failure(ctx, plan, error_type="not_a_plan")


def test_claim_apply_rejects_when_target_now_carries_slug(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/source", "# source\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# already there\n")
    plan = _write_plan_file(
        tmp_path,
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    ctx = _make_ctx(gateway)

    failure = _assert_hard_failure(ctx, plan, error_type="target_collision")

    assert "widget-rewrite" in failure.message
    assert "feat/x" in failure.message
    assert "objective-update" in failure.message
    assert "objective-reconcile" in failure.message
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# already there\n"


def test_claim_apply_rejects_when_source_no_longer_has_slug(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    plan = _write_plan_file(
        tmp_path,
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    ctx = _make_ctx(gateway)

    _assert_hard_failure(ctx, plan, error_type="source_missing_slug")


def test_claim_apply_rejects_when_from_file_no_longer_exists(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    plan = _write_plan_file(
        tmp_path,
        plan=_local_file_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            from_file_path=str(tmp_path / "missing.md"),
        ),
    )
    ctx = _make_ctx(gateway)

    _assert_hard_failure(ctx, plan, error_type="from_file_unreadable")


def test_claim_apply_canonical_source_writes_to_branch(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical body\n")
    plan = _write_plan_file(
        tmp_path,
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="master",
            kind="canonical",
            label="canonical objective",
        ),
    )
    ctx = _make_ctx(gateway)

    data = _apply_data(ctx, plan)

    assert data["source_kind"] == "canonical"
    assert data["source_branch"] == "master"
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# canonical body\n"
