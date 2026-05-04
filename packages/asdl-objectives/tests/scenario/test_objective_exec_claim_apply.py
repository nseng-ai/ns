"""Scenario tests for ``objective exec claim-apply``.

The lower-level apply primitive reads a plan envelope from
``objective exec claim-plan`` and performs the actual carry-forward. Tests
cover plan-file shape validation, schema-mismatch handling, branch-source
``brmem copy``, local-file source ``brmem put``, and apply-time drift checks
(target collision, source missing the slug, local file vanished).
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
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.claim_plan import PLAN_SCHEMA
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


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


def _write_plan_file(
    tmp_path: Path,
    *,
    plan: dict | None = None,
    status: str = "plan",
    schema: str = PLAN_SCHEMA,
    canonical_branch: str = "master",
    ambiguity: dict | None = None,
    error: dict | None = None,
) -> Path:
    envelope = {
        "schema": schema,
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
) -> dict:
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


def _local_file_plan(*, slug: str, target_branch: str, from_file_path: str) -> dict:
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


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_claim_apply_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "claim-apply", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec claim-apply" in result.output


def test_claim_apply_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "claim-apply", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# branch source happy path
# ---------------------------------------------------------------------------


def test_claim_apply_branch_source_carries_every_file(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
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
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["schema"] == PLAN_SCHEMA
    assert data["slug"] == "widget-rewrite"
    assert data["target_branch"] == "feat/x"
    assert data["source_kind"] == "branch"
    assert data["source_branch"] == "feat/source"
    assert {f["file"] for f in data["files_carried"]} == {"body.md", "notes.md"}
    assert data["destination_ref"] == "refs/brmem/ns/objectives/feat---x"
    assert data["destination_commit_sha"]
    # The carry actually landed on the target branch.
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# source body\n"
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") == "- finding A\n"


# ---------------------------------------------------------------------------
# local-file source happy path
# ---------------------------------------------------------------------------


def test_claim_apply_local_file_source_writes_only_body(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
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
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["source_kind"] == "local_file"
    assert data["source_branch"] is None
    assert [f["file"] for f in data["files_carried"]] == ["body.md"]
    assert data["destination_commit_sha"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# new body from disk\n"
    # No siblings synthesized.
    assert gateway.get("objectives", "widget-rewrite/notes.md", "feat/x") is None
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "feat/x") is None


# ---------------------------------------------------------------------------
# malformed plan file / schema mismatch
# ---------------------------------------------------------------------------


def test_claim_apply_rejects_malformed_json(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan_path = tmp_path / "bad.json"
    plan_path.write_text("not-json", encoding="utf-8")
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan_path), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "malformed_plan_file"


def test_claim_apply_rejects_schema_mismatch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan = _write_plan_file(
        tmp_path,
        schema="claim-plan/v0",
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "schema_mismatch"
    assert "claim-plan/v0" in payload["message"]


def test_claim_apply_rejects_non_plan_status(cli_group: ClinkrGroup, tmp_path: Path) -> None:
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
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "not_a_plan"


# ---------------------------------------------------------------------------
# drift since plan time
# ---------------------------------------------------------------------------


def test_claim_apply_rejects_when_target_now_carries_slug(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/source", "# source\n")
    # Some other process attached the slug to the target between plan and apply.
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# already there\n")
    plan = _write_plan_file(
        tmp_path,
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "target_collision"
    assert "widget-rewrite" in payload["message"]
    assert "feat/x" in payload["message"]
    # Hint: "objective-update" or "objective-reconcile" remediation.
    assert "objective-update" in payload["message"]
    assert "objective-reconcile" in payload["message"]
    # No write happened.
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# already there\n"


def test_claim_apply_rejects_when_source_no_longer_has_slug(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    plan = _write_plan_file(
        tmp_path,
        plan=_branch_source_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            source_branch="feat/source",
        ),
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "source_missing_slug"


def test_claim_apply_rejects_when_from_file_no_longer_exists(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    plan = _write_plan_file(
        tmp_path,
        plan=_local_file_plan(
            slug="widget-rewrite",
            target_branch="feat/x",
            from_file_path=str(tmp_path / "missing.md"),
        ),
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "from_file_unreadable"


# ---------------------------------------------------------------------------
# canonical-source kind happy path
# ---------------------------------------------------------------------------


def test_claim_apply_canonical_source_writes_to_branch(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
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
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["source_kind"] == "canonical"
    assert data["source_branch"] == "master"
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# canonical body\n"
