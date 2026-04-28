"""Scenario tests for ``objective exec current``.

These exercise the rendered Markdown contract end-to-end through
``build_cli()`` with the fake gateway stack (`brmem`, git, gh, gt) the
rest of the objective scenario suite uses. The skill `objective-current`
prints this output verbatim, so substring assertions on
``result.output`` cover the user-facing surface.
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
    patch_ids_by_range: dict[str, tuple[tuple[str, str | None], ...]] | None = None,
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway(
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
            commits_by_range=commits_by_range,
            patch_ids_by_range=patch_ids_by_range,
        )
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
            commits_by_range=commits_by_range,
            patch_ids_by_range=patch_ids_by_range,
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
        gt_gateway=gt_gateway if gt_gateway is not None else FakeGtGateway(trunk="master"),
    )
    return build_clinkr_context_object(lambda: ctx)


def _invoke_current(cli_group: ClinkrGroup, obj: ClinkrContextObject) -> str:
    result = CliRunner().invoke(cli_group, ["exec", "current"], obj=obj)
    assert result.exit_code == 0, result.output
    return result.output


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_current_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "current", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec current" in result.output
    assert "orientation brief" in result.output


def test_current_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "current", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}
    assert payload["output_schema"]["properties"]["prompt"]["type"] == "string"


# ---------------------------------------------------------------------------
# branch resolution
# ---------------------------------------------------------------------------


def test_current_detached_head(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch=DetachedHead(), gt_gateway=FakeGtGateway(trunk="master"))

    out = _invoke_current(cli_group, obj)

    assert "# Detached HEAD" in out
    assert "Trunk is `master`." in out
    assert "## Stack Map" not in out
    assert "## Current Branch Context" not in out


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

    out = _invoke_current(cli_group, obj)

    assert "# On `master`" in out
    assert "## Stack Map" in out
    assert "master  <- current" in out
    assert "+- feat/child" in out


# ---------------------------------------------------------------------------
# current-branch header
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

    out = _invoke_current(cli_group, obj)

    assert "# On `feat/current`" in out
    assert "**Objective:** _none claimed_" in out
    assert "**Snapshot:**" not in out
    assert "**PR:** _no PR_" in out
    assert "**brmem:** _none_" in out
    assert "## Current Branch Context" not in out
    assert "## Next Orientation Step" not in out


def test_current_single_claim_fresh(cli_group: ClinkrGroup) -> None:
    cwd = Path.cwd()
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget objective\n")
    gateway.put(
        "objectives",
        "widget/.absorbed.jsonl",
        "feat/current",
        (
            '{"schema":1,"sha":"aaa111","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T07:30:00+00:00","subject":"Wire widget"}\n'
        ),
    )
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
    patch_ids_by_range = {
        "master..feat/current": (("aaa111", "pid-1"),),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
        patch_ids_by_range=patch_ids_by_range,
    )

    out = _invoke_current(cli_group, obj)

    assert "**Objective:** `widget`" in out
    assert "**Snapshot:** fresh" in out
    assert "## Next Orientation Step" in out
    assert "`objective-digest widget`" in out


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
    # Branch carries a novel patch-id not absorbed by any ancestor.
    patch_ids_by_range = {
        "master..feat/current": (("bbb222", "pid-novel"),),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        gt_gateway=gt_gateway,
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
        patch_ids_by_range=patch_ids_by_range,
    )

    out = _invoke_current(cli_group, obj)

    assert "**Snapshot:** stale - run `objective-update widget` to refresh" in out


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

    out = _invoke_current(cli_group, obj)

    assert "**Objective:** `alpha`" in out
    assert "_also claimed: bravo, charlie_" in out


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

    out = _invoke_current(cli_group, obj)

    assert "**brmem:** 2 entries" in out
    assert "## Current Branch Context" in out
    assert "- `base` `plans/feat-plan.md` (14 bytes) - # Plan" in out
    assert "- `objectives` `widget/body.md`" in out


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

    out = _invoke_current(cli_group, obj)

    assert "**PR:** [#42](https://example.com/pull/42) OPEN - Wire feat" in out


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

    out = _invoke_current(cli_group, obj)

    assert "**PR:** _lookup failed: auth failed_" in out


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

    out = _invoke_current(cli_group, obj)

    assert "## Stack Map" in out
    assert "```text\nmaster\n" in out
    assert "+- feat/parent  no PR  no objective" in out
    assert "   +- feat/current  no PR  no objective  <- current" in out
    assert "      +- feat/child-a  no PR  no objective" in out
    assert "      +- feat/child-b  no PR  no objective" in out


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

    out = _invoke_current(cli_group, obj)

    assert "+- feat/current" in out
    assert "<- current" in out
    # No upstack rows after the current row.
    stack_lines = out.split("## Stack Map", 1)[1].splitlines()
    current_line_idx = next(i for i, line in enumerate(stack_lines) if "<- current" in line)
    fence_close_idx = next(
        i
        for i, line in enumerate(stack_lines[current_line_idx + 1 :], start=current_line_idx + 1)
        if line.strip() == "```"
    )
    assert fence_close_idx == current_line_idx + 1


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

    out = _invoke_current(cli_group, obj)

    assert "feat/child-deleted" in out
    # Deleted branch carries the deleted marker in its label.
    assert "feat/child-deleted  no PR  no objective (deleted)" in out


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

    out = _invoke_current(cli_group, obj)

    assert "# On `feat/current`" in out
    assert "> Warning: gt unavailable - stack walk skipped: `not a gt repo`" in out
    # No downstack/upstack rows — only the current row in the tree.
    assert "+- feat/parent" not in out


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

    out = _invoke_current(cli_group, obj)

    assert "> Warnings:" in out
    assert "> - gt_log: siblings off-column dropped" in out


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

    out = _invoke_current(cli_group, obj)

    assert "+- feat/parent  no PR  widget fresh" in out
