"""Scenario tests for ``objective exec current``.

These exercise the JSON contract end-to-end through ``build_cli()`` with the
fake gateway stack (`brmem`, git, gh, gt) the rest of the objective scenario
suite uses.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import CommitSummary, DetachedHead
from twerk_core.gt.testing import FakeGtGateway
from twerk_core.gt.types import GtCommandFailure, StackInfo
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _pr(
    *,
    number: int,
    title: str,
    url: str,
    state: str,
    head: str,
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
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | None = "feat/current",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
    gt_gateway: FakeGtGateway | None = None,
    file_last_touched: dict[tuple[str, str], str] | None = None,
    branch_head_iso: dict[str, str] | None = None,
    commits_by_range: dict[str, tuple[CommitSummary, ...]] | None = None,
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway(
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
            commits_by_range=commits_by_range,
        )
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
            commits_by_range=commits_by_range,
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
        gt_gateway=gt_gateway if gt_gateway is not None else FakeGtGateway(trunk="master"),
    )
    return build_clinkr_context_object(lambda: ctx)


def _invoke_current(cli_group: ClinkrGroup, obj: ClinkrContextObject) -> dict:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "current", "--format", "json"],
        obj=obj,
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    return payload["data"]


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_current_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "current", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec current" in result.output
    assert "stack map facts" in result.output


def test_current_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "current", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# branch resolution
# ---------------------------------------------------------------------------


def test_current_detached_head(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch=DetachedHead(), gt_gateway=FakeGtGateway(trunk="master"))

    data = _invoke_current(cli_group, obj)

    assert data["detached_head"] is True
    assert data["current_branch"] is None
    assert data["current"] is None
    assert data["downstack"] == []
    assert data["upstack"] == []
    assert data["trunk"] == "master"
    assert data["is_trunk"] is False


def test_current_on_trunk(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="master",
                ancestors=(),
                children=("feat/child",),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        branch="master",
        live_branches=("master", "feat/child"),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert data["current_branch"] == "master"
    assert data["is_trunk"] is True
    assert data["downstack"] == []
    assert [e["branch"] for e in data["upstack"]] == ["feat/child"]


# ---------------------------------------------------------------------------
# current-branch block
# ---------------------------------------------------------------------------


def test_current_no_objective_claimed_no_pr(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    obj = _make_obj(branch="feat/current", gt_gateway=gt_gateway)

    data = _invoke_current(cli_group, obj)

    current_block = data["current"]
    assert current_block is not None
    assert current_block["branch"] == "feat/current"
    assert current_block["objective"] is None
    assert current_block["objectives_extra"] == []
    assert current_block["pr"] is None
    assert current_block["pr_error"] is None
    assert current_block["brmem"] == []


def test_current_single_claim_fresh(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget objective\n")
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    file_last_touched = {
        ("refs/brmem/ns/objectives/feat---current", "widget/body.md"): "2026-04-26T08:00:00+00:00",
    }
    branch_head_iso = {"feat/current": "2026-04-26T07:00:00+00:00"}
    commits_by_range = {
        "master..feat/current": (
            CommitSummary(
                sha="aaa111",
                author_iso="2026-04-26T07:30:00+00:00",
                subject="Wire widget",
            ),
        ),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
    )

    data = _invoke_current(cli_group, obj)

    objective = data["current"]["objective"]
    assert objective["slug"] == "widget"
    assert objective["obj_state"] == "fresh"
    assert objective["body_last_touched"] == "2026-04-26T08:00:00+00:00"
    assert objective["branch_head_iso"] == "2026-04-26T07:00:00+00:00"
    assert objective["branch_max_author_iso"] == "2026-04-26T07:30:00+00:00"


def test_current_single_claim_stale(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget objective\n")
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    file_last_touched = {
        ("refs/brmem/ns/objectives/feat---current", "widget/body.md"): "2026-04-26T07:00:00+00:00",
    }
    # Latest author time on master..branch is newer than snapshot — stale.
    branch_head_iso = {"feat/current": "2026-04-26T08:00:00+00:00"}
    commits_by_range = {
        "master..feat/current": (
            CommitSummary(
                sha="bbb222",
                author_iso="2026-04-26T08:00:00+00:00",
                subject="Wire widget",
            ),
        ),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
    )

    data = _invoke_current(cli_group, obj)

    assert data["current"]["objective"]["obj_state"] == "stale"
    assert data["current"]["objective"]["branch_max_author_iso"] == "2026-04-26T08:00:00+00:00"


def test_current_multiple_claims_on_branch(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/current", "alpha")
    gateway.put("objectives", "bravo/body.md", "feat/current", "bravo")
    gateway.put("objectives", "charlie/body.md", "feat/current", "charlie")
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert data["current"]["objective"]["slug"] == "alpha"
    assert list(data["current"]["objectives_extra"]) == ["bravo", "charlie"]


def test_current_brmem_listing_includes_multiple_namespaces(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget body\n\nbody text")
    gateway.put(None, "plans/feat-plan.md", "feat/current", "# Plan\n\nstep 1")
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    listing = data["current"]["brmem"]
    by_key = {(e["namespace"], e["key"]): e for e in listing}
    assert (None, "plans/feat-plan.md") in by_key
    assert ("objectives", "widget/body.md") in by_key
    base_entry = by_key[(None, "plans/feat-plan.md")]
    assert base_entry["preview"] == "# Plan"
    assert base_entry["size"] == len("# Plan\n\nstep 1")


def test_current_pr_present(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    pr_gateway = FakePRGateway(
        prs_by_branch={
            "feat/current": _pr(
                number=42,
                title="Wire feat",
                url="https://example.com/pull/42",
                state="OPEN",
                head="feat/current",
            ),
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
        pr_gateway=pr_gateway,
    )

    data = _invoke_current(cli_group, obj)

    pr = data["current"]["pr"]
    assert pr == {
        "number": 42,
        "state": "OPEN",
        "title": "Wire feat",
        "url": "https://example.com/pull/42",
    }
    assert data["current"]["pr_error"] is None


class _BrokenPRGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


def test_current_pr_gateway_failure_surfaces_error(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
        pr_gateway=_BrokenPRGateway(),
    )

    data = _invoke_current(cli_group, obj)

    assert data["current"]["pr"] is None
    assert data["current"]["pr_error"] == "auth failed"


# ---------------------------------------------------------------------------
# stack walks
# ---------------------------------------------------------------------------


def test_current_mid_stack_with_downstack_and_children(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master", "feat/parent"),
                children=("feat/child-a", "feat/child-b"),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=(
            "master",
            "feat/parent",
            "feat/current",
            "feat/child-a",
            "feat/child-b",
        ),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert [e["branch"] for e in data["downstack"]] == ["master", "feat/parent"]
    assert [e["branch"] for e in data["upstack"]] == ["feat/child-a", "feat/child-b"]
    for entry in data["downstack"] + data["upstack"]:
        assert entry["deleted"] is False


def test_current_leaf_with_no_children(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("master", "feat/current"),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert [e["branch"] for e in data["downstack"]] == ["master"]
    assert data["upstack"] == []


def test_current_child_branch_deleted(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=("feat/child-deleted",),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("master", "feat/current"),  # feat/child-deleted not in branches
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert data["upstack"][0]["branch"] == "feat/child-deleted"
    assert data["upstack"][0]["deleted"] is True


def test_current_gt_failure_returns_warning_and_empty_stack(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={cwd: GtCommandFailure(message="not a gt repo", returncode=1)},
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert data["downstack"] == []
    assert data["upstack"] == []
    assert any("gt_failed" in w for w in data["warnings"])
    assert data["current"]["branch"] == "feat/current"
    assert data["trunk"] == "master"


def test_current_propagates_gt_log_warnings(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master",),
                children=(),
                warnings=("siblings off-column dropped",),
            )
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("master", "feat/current"),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    assert any("siblings off-column dropped" in w for w in data["warnings"])


def test_current_stack_entry_carries_objective_summary(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/parent", "# Widget objective\n")
    gt_gateway = FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/current",
                ancestors=("master", "feat/parent"),
                children=(),
                warnings=(),
            )
        },
    )
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("master", "feat/parent", "feat/current"),
        gt_gateway=gt_gateway,
    )

    data = _invoke_current(cli_group, obj)

    parent_entry = next(e for e in data["downstack"] if e["branch"] == "feat/parent")
    assert parent_entry["objective"] is not None
    assert parent_entry["objective"]["slug"] == "widget"
