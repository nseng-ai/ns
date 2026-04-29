"""Scenario tests for ``objective exec reconcile-plan``.

The skill ``objective-reconcile`` runs this command to gather raw evidence
for canonical objectives. These tests exercise the contract end to end via
``build_cli()`` with the standard fakes used across objective scenario
tests, focusing on the JSON envelope shape, slug-set resolution, PR-state
gating, and old-SHA capture.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.exec.reconcile_plan import PLAN_SCHEMA
from twerk_objectives.main import build_cli


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


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_reconcile_plan_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "reconcile-plan", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec reconcile-plan" in result.output


def test_reconcile_plan_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "reconcile-plan", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# empty registry
# ---------------------------------------------------------------------------


def test_reconcile_plan_empty_registry_emits_clean_envelope(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    data = payload["data"]
    assert data["schema"] == PLAN_SCHEMA
    assert data["canonical_branch"] == "master"
    assert data["requested_slugs"] == []
    assert data["slugs"] == []


# ---------------------------------------------------------------------------
# single slug, varying branch evidence
# ---------------------------------------------------------------------------


def test_reconcile_plan_single_slug_no_snapshots_emits_gap(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# Widget\n")
    obj = _make_obj(gateway=gateway, branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert len(data["slugs"]) == 1
    item = data["slugs"][0]
    assert item["slug"] == "widget-rewrite"
    assert item["canonical_present"] is True
    files = {f["file"]: f for f in item["canonical_files"]}
    assert files["body.md"]["present"] is True
    assert files["body.md"]["expected_old_blob_sha"] is not None
    assert files["body.md"]["expected_old_head_sha"] is not None
    assert files["body.md"]["content"] == "# Widget\n"
    assert files["roadmap.md"]["present"] is False
    assert files["roadmap.md"]["expected_old_blob_sha"] is None
    assert files["roadmap.md"]["expected_old_head_sha"] is None
    assert files["notes.md"]["present"] is False
    assert item["included_snapshots"] == []
    assert item["skipped_snapshots"] == []
    assert item["gaps"] == ["no merged PR-backed branch snapshots carry slug 'widget-rewrite'"]
    assert item["conflicts"] == []


def test_reconcile_plan_single_merged_snapshot_is_included(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# Widget canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# Widget branch\n")
    gateway.put("objectives", "widget-rewrite/notes.md", "feat/x", "- finding A\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x"),
        prs_by_branch={
            "feat/x": _pr(number=42, state="MERGED", head="feat/x"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    item = json.loads(result.output)["data"]["slugs"][0]
    assert item["skipped_snapshots"] == []
    assert len(item["included_snapshots"]) == 1
    snap = item["included_snapshots"][0]
    assert snap["branch"] == "feat/x"
    assert snap["pr"]["state"] == "MERGED"
    assert snap["pr"]["number"] == 42
    files = {f["file"]: f for f in snap["files"]}
    assert files["body.md"]["content"] == "# Widget branch\n"
    assert files["notes.md"]["content"] == "- finding A\n"
    # roadmap absent on the branch — should not appear.
    assert "roadmap.md" not in files
    # No gaps when there is at least one eligible snapshot.
    assert item["gaps"] == []


def test_reconcile_plan_open_pr_skipped_merged_pr_included(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# Widget\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# branch x\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/y", "# branch y\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/y"),
        prs_by_branch={
            "feat/x": _pr(number=10, state="OPEN", head="feat/x"),
            "feat/y": _pr(number=11, state="MERGED", head="feat/y"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    item = json.loads(result.output)["data"]["slugs"][0]
    assert [s["branch"] for s in item["included_snapshots"]] == ["feat/y"]
    assert [s["branch"] for s in item["skipped_snapshots"]] == ["feat/x"]
    assert item["skipped_snapshots"][0]["reason"] == "open"
    assert item["skipped_snapshots"][0]["pr"]["state"] == "OPEN"
    assert item["gaps"] == []


def test_reconcile_plan_classifies_skip_reasons(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    for branch in ("feat/open", "feat/closed", "feat/no-pr"):
        gateway.put("objectives", "widget-rewrite/body.md", branch, "# branch\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/open", "feat/closed", "feat/no-pr"),
        prs_by_branch={
            "feat/open": _pr(number=1, state="OPEN", head="feat/open"),
            "feat/closed": _pr(number=2, state="CLOSED", head="feat/closed"),
            # feat/no-pr intentionally omitted -> FakePRGateway returns
            # PRLookupError(returncode=1) -> classified as `no_pr`.
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    item = json.loads(result.output)["data"]["slugs"][0]
    by_branch = {s["branch"]: s for s in item["skipped_snapshots"]}
    assert by_branch["feat/open"]["reason"] == "open"
    assert by_branch["feat/closed"]["reason"] == "closed_unmerged"
    assert by_branch["feat/no-pr"]["reason"] == "no_pr"
    assert by_branch["feat/no-pr"]["pr"]["error"] is None
    # No merged eligible evidence -> gap.
    assert item["gaps"] == ["no merged PR-backed branch snapshots carry slug 'widget-rewrite'"]


def test_reconcile_plan_pr_lookup_error_is_classified_as_lookup_error(
    cli_group: ClinkrGroup,
) -> None:
    from twerk_core.gh.pr_gateway import PRGateway
    from twerk_core.gh.types import PRLookupError

    class _BoomGateway(PRGateway):
        def get_pr_for_branch(self, branch: str):  # type: ignore[override]
            return PRLookupError(stderr="auth failed", returncode=4)

        def get_pr_details_for_branch(self, branch: str):  # type: ignore[override]
            return PRLookupError(stderr="auth failed", returncode=4)

        def search_prs(self, query: str, *, state):  # type: ignore[override]
            return PRLookupError(stderr="auth failed", returncode=4)

        def merge_pr(self, pr_number, *, match_head_commit, admin, auto):  # type: ignore[override]
            raise NotImplementedError

    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# branch\n")
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "master"},
        branches=("master", "feat/x"),
        trunk_branch="master",
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=_BoomGateway(),
    )
    obj = build_clinkr_context_object(lambda: ctx)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    item = json.loads(result.output)["data"]["slugs"][0]
    assert item["skipped_snapshots"][0]["reason"] == "lookup_error"
    assert item["skipped_snapshots"][0]["pr"]["error"] == "auth failed"


# ---------------------------------------------------------------------------
# slug list narrowing
# ---------------------------------------------------------------------------


def test_reconcile_plan_slug_list_narrowing(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# alpha\n")
    gateway.put("objectives", "beta/body.md", "master", "# beta\n")
    gateway.put("objectives", "gamma/body.md", "master", "# gamma\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "alpha,gamma", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert data["requested_slugs"] == ["alpha", "gamma"]
    assert [item["slug"] for item in data["slugs"]] == ["alpha", "gamma"]


def test_reconcile_plan_unknown_slug_becomes_gap(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# alpha\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "alpha,unknown", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    by_slug = {item["slug"]: item for item in data["slugs"]}
    assert by_slug["alpha"]["canonical_present"] is True
    assert by_slug["alpha"]["gaps"] == ["no merged PR-backed branch snapshots carry slug 'alpha'"]
    assert by_slug["unknown"]["canonical_present"] is False
    assert by_slug["unknown"]["gaps"] == [
        "slug 'unknown' requested but no canonical body.md on master; use objective-create first"
    ]
    # Keep going across slugs even when one is gap-only.
    assert "alpha" in by_slug
    assert "unknown" in by_slug


def test_reconcile_plan_default_sweep_sorts_alphabetically(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "zeta/body.md", "master", "# zeta\n")
    gateway.put("objectives", "alpha/body.md", "master", "# alpha\n")
    gateway.put("objectives", "mu/body.md", "master", "# mu\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert [item["slug"] for item in data["slugs"]] == ["alpha", "mu", "zeta"]


# ---------------------------------------------------------------------------
# canonical body.md missing becomes a conflict
# ---------------------------------------------------------------------------


def test_reconcile_plan_missing_canonical_body_is_conflict(cli_group: ClinkrGroup) -> None:
    """A slug whose canonical roadmap.md exists on master but body.md does not.

    The slug is in the canonical set (has at least one master file), so it
    enters the sweep, but its body.md is missing — this surfaces as a
    conflict, not a gap.
    """
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/roadmap.md", "master", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    item = json.loads(result.output)["data"]["slugs"][0]
    assert item["canonical_present"] is True
    files = {f["file"]: f for f in item["canonical_files"]}
    assert files["body.md"]["present"] is False
    assert files["roadmap.md"]["present"] is True
    assert item["conflicts"] == ["canonical body.md missing for slug 'widget-rewrite' on master"]
    assert item["included_snapshots"] == []
    assert item["skipped_snapshots"] == []


# ---------------------------------------------------------------------------
# determinism — sweep order, snapshot order, file order
# ---------------------------------------------------------------------------


def test_reconcile_plan_deterministic_shape(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/b", "# b\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/a", "# a\n")
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
        ["exec", "reconcile-plan", "--format", "json"],
        obj=obj,
    )

    item = json.loads(result.output)["data"]["slugs"][0]
    # Branches are sorted alphabetically -> deterministic.
    assert [s["branch"] for s in item["included_snapshots"]] == ["feat/a", "feat/b"]
    # Canonical files are emitted in body / roadmap / notes order.
    assert [f["file"] for f in item["canonical_files"]] == [
        "body.md",
        "roadmap.md",
        "notes.md",
    ]
