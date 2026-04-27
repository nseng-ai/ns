from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRCheck, PRDetails
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead, FileStatus, WorktreeInfo
from twerk_slots.cli.main import build_cli
from twerk_slots.cli.slot.gt.context import SlotGtContext
from twerk_slots.cli.slot.gt.testing import FakeGtGateway
from twerk_slots.cli.slot.gt.types import GtCommandFailure, UntrackedBranch
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _GtFakes:
    ctx: SlotGtContext
    git: FakeGitGateway
    gt: FakeGtGateway
    clipboard: FakeClipboardGateway
    pr: FakePRGateway
    repo_root: Path
    slots_root: Path


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _machine_data(text: str) -> dict[str, object]:
    payload = json.loads(text)
    assert payload["exit_code"] == 0
    data = payload.get("data")
    assert isinstance(data, dict)
    return data


def _make_fakes(
    tmp_path: Path,
    *,
    current_path_name: str = "repo",
    current_branch: str = "feat/base",
    branches: tuple[str, ...] = ("main", "feat/base", "feat/child"),
    worktrees: tuple[WorktreeInfo, ...] | None = None,
    assignments: tuple[SlotAssignment, ...] = (),
    gt: FakeGtGateway | None = None,
    pr: FakePRGateway | None = None,
    current_branch_by_path: dict[Path, str | DetachedHead] | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
) -> _GtFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    slots_root = tmp_path / "slots"
    if current_path_name == "repo":
        current_root = repo_root
    else:
        current_root = slots_root / "repos" / "repo" / "worktrees" / current_path_name
    pool_json_path = slots_root / "repos" / "repo" / "pool.json"
    repo = RepoContext(
        root=current_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=slots_root / "repos" / "repo",
        worktrees_dir=slots_root / "repos" / "repo" / "worktrees",
        pool_json_path=pool_json_path,
    )
    resolved_worktrees = (
        worktrees
        if worktrees is not None
        else (WorktreeInfo(path=current_root, branch=current_branch, is_bare=False),)
    )
    branch_by_path = (
        dict(current_branch_by_path)
        if current_branch_by_path is not None
        else {current_root: current_branch}
    )
    existing_paths = {
        repo_root,
        current_root,
        *(assignment.worktree_path for assignment in assignments),
    }
    git = FakeGitGateway(
        repo_root=repo_root,
        branches=branches,
        worktrees=resolved_worktrees,
        current_branch_by_path=branch_by_path,
        branch_head_oid_by_branch={branch: f"{branch}-oid" for branch in branches},
        file_status_by_path=file_status_by_path,
        existing_paths=existing_paths,
        repository_root_by_cwd={current_root: current_root},
    )
    storage = FakeSlotsStorageGateway(existing_paths=existing_paths)
    pool_state = FakePoolStateGateway(
        pool_json_path,
        initial_state=PoolState(pool_size=4, assignments=assignments) if assignments else None,
    )
    clipboard = FakeClipboardGateway()
    pr_gateway = pr if pr is not None else FakePRGateway()
    slots_ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state,
        clipboard=clipboard,
        pr=pr_gateway,
        slots_root=slots_root,
    )
    gt_gateway = (
        gt if gt is not None else FakeGtGateway(branch_by_cwd={current_root: current_branch})
    )
    return _GtFakes(
        ctx=SlotGtContext(slots=slots_ctx, gt=gt_gateway),
        git=git,
        gt=gt_gateway,
        clipboard=clipboard,
        pr=pr_gateway,
        repo_root=repo_root,
        slots_root=slots_root,
    )


def test_slot_help_lists_gt(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "gt" in result.output


def test_slot_gt_help_lists_commands(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot gt" in result.output
    assert "up" in result.output
    assert "down" in result.output
    assert "land" in result.output


def test_slot_gt_up_navigates_to_single_child_slot(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slot_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-02"
    assignment = SlotAssignment("slot-02", "feat/child", "now", slot_path)
    fakes = _make_fakes(
        tmp_path,
        assignments=(assignment,),
        worktrees=(
            WorktreeInfo(path=tmp_path / "repo", branch="feat/base", is_bare=False),
            WorktreeInfo(path=slot_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={
            (tmp_path / "repo").resolve(): "feat/base",
            slot_path: "feat/child",
        },
        gt=FakeGtGateway(
            branch_by_cwd={(tmp_path / "repo").resolve(): "feat/base"},
            children_by_branch={"feat/base": ("feat/child",)},
        ),
    )

    result = CliRunner().invoke(cli_group, ["gt", "up"], obj=_obj(fakes.ctx))

    assert result.exit_code == 0, result.output
    assert "slot-02" in result.output
    assert f"cd {slot_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {slot_path}"


def test_slot_gt_up_multiple_children_is_negative(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _make_fakes(
        tmp_path,
        gt=FakeGtGateway(
            branch_by_cwd={(tmp_path / "repo").resolve(): "feat/base"},
            children_by_branch={"feat/base": ("feat/a", "feat/b")},
        ),
    )

    result = CliRunner().invoke(cli_group, ["gt", "up"], obj=_obj(fakes.ctx))

    assert result.exit_code == 1
    assert "Multiple upstack branches" in result.output
    assert "feat/a" in result.output
    assert "feat/b" in result.output


def test_slot_gt_down_navigates_to_parent_main_worktree(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    main_path = (tmp_path / "repo").resolve()
    child_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-02"
    fakes = _make_fakes(
        tmp_path,
        current_path_name="slot-02",
        current_branch="feat/child",
        worktrees=(
            WorktreeInfo(path=main_path, branch="main", is_bare=False),
            WorktreeInfo(path=child_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={main_path: "main", child_path: "feat/child"},
        gt=FakeGtGateway(
            branch_by_cwd={child_path: "feat/child"},
            parent_by_branch={"feat/child": "main"},
        ),
    )

    result = CliRunner().invoke(cli_group, ["gt", "down"], obj=_obj(fakes.ctx))

    assert result.exit_code == 0, result.output
    assert f"cd {main_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {main_path}"


def test_slot_gt_down_untracked_branch_failure(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _make_fakes(
        tmp_path,
        gt=FakeGtGateway(
            parent_by_cwd={
                (tmp_path / "repo").resolve(): UntrackedBranch(message="Cannot perform this")
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["gt", "down"], obj=_obj(fakes.ctx))

    assert result.exit_code == 2
    assert "not tracked by Graphite" in result.output


def test_slot_gt_down_detached_head_failure(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = (tmp_path / "repo").resolve()
    fakes = _make_fakes(
        tmp_path,
        current_branch_by_path={repo_root: DetachedHead()},
    )

    result = CliRunner().invoke(cli_group, ["gt", "down"], obj=_obj(fakes.ctx))

    assert result.exit_code == 2
    assert "detached" in result.output


def test_slot_gt_up_format_json(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    child_path = tmp_path / "child"
    fakes = _make_fakes(
        tmp_path,
        worktrees=(
            WorktreeInfo(path=(tmp_path / "repo").resolve(), branch="feat/base", is_bare=False),
            WorktreeInfo(path=child_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/base"},
        gt=FakeGtGateway(
            branch_by_cwd={(tmp_path / "repo").resolve(): "feat/base"},
            children_by_branch={"feat/base": ("feat/child",)},
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "up", "--format", "json"],
        obj=_obj(fakes.ctx),
    )
    data = _machine_data(result.output)

    assert result.exit_code == 0
    assert data["branch_name"] == "feat/child"
    assert data["worktree_path"] == str(child_path)


def test_slot_gt_land_dry_run_plans_bottom_pr(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    main_path = (tmp_path / "repo").resolve()
    base_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    child_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-02"
    assignments = (
        SlotAssignment("slot-01", "feat/base", "now", base_path),
        SlotAssignment("slot-02", "feat/child", "now", child_path),
    )
    pr = PRDetails(
        number=123,
        url="https://github.example/pr/123",
        head_ref_name="feat/base",
        base_ref_name="main",
        state="OPEN",
        head_ref_oid="feat/base-oid",
        mergeable="MERGEABLE",
        merge_state_status="CLEAN",
        is_draft=False,
    )
    pr_gateway = FakePRGateway(
        pr_details_by_branch={"feat/base": pr},
        required_checks_by_pr={
            123: (PRCheck(name="ci", bucket="pass", state="SUCCESS", link=None),)
        },
    )
    fakes = _make_fakes(
        tmp_path,
        current_path_name="slot-01",
        current_branch="feat/base",
        assignments=assignments,
        worktrees=(
            WorktreeInfo(path=main_path, branch="main", is_bare=False),
            WorktreeInfo(path=base_path, branch="feat/base", is_bare=False),
            WorktreeInfo(path=child_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={
            main_path: "main",
            base_path: "feat/base",
            child_path: "feat/child",
        },
        gt=FakeGtGateway(
            branch_by_cwd={base_path: "feat/base", child_path: "feat/child"},
            parent_by_branch={"feat/base": "main", "feat/child": "feat/base"},
            children_by_branch={"feat/base": ("feat/child",)},
        ),
        pr=pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run", "--up"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert "would merge PR #123 from feat/base into main" in result.output
    assert "would restack:" in result.output
    assert "slot-02 feat/child" in result.output
    assert f"final navigation: cd {child_path}" in result.output
    assert pr_gateway.merge_calls == ()


def test_slot_gt_land_refuses_mid_stack_branch(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _make_fakes(
        tmp_path,
        gt=FakeGtGateway(
            branch_by_cwd={(tmp_path / "repo").resolve(): "feat/base"},
            parent_by_branch={"feat/base": "feat/parent"},
            children_by_branch={"feat/base": ()},
            trunk="main",
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "not bottom-of-stack" in result.output
    assert "merge not attempted" in result.output


def test_slot_gt_land_merges_and_repairs_over_fakes(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    main_path = (tmp_path / "repo").resolve()
    base_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    assignments = (SlotAssignment("slot-01", "feat/base", "now", base_path),)
    pr = PRDetails(
        number=124,
        url="https://github.example/pr/124",
        head_ref_name="feat/base",
        base_ref_name="main",
        state="OPEN",
        head_ref_oid="feat/base-oid",
        mergeable="MERGEABLE",
        merge_state_status="CLEAN",
        is_draft=False,
    )
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": pr})
    gt_gateway = FakeGtGateway(
        branch_by_cwd={base_path: "feat/base"},
        parent_by_branch={"feat/base": "main"},
        children_by_branch={"feat/base": ()},
    )
    fakes = _make_fakes(
        tmp_path,
        current_path_name="slot-01",
        current_branch="feat/base",
        assignments=assignments,
        worktrees=(
            WorktreeInfo(path=main_path, branch="main", is_bare=False),
            WorktreeInfo(path=base_path, branch="feat/base", is_bare=False),
        ),
        current_branch_by_path={main_path: "main", base_path: "feat/base"},
        gt=gt_gateway,
        pr=pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--no-checks", "--no-restack", "--no-free-slot"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert pr_gateway.merge_calls == ((124, "feat/base-oid", False, False),)
    assert gt_gateway.sync_calls == ((base_path, False),)
    assert "merged PR #124 with squash" in result.output
    assert "updated local main" in result.output
    assert "synced Graphite metadata" in result.output
    assert "left current slot assigned" in result.output


def test_slot_gt_land_conflicting_navigation_flags(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "land", "--up", "--down"])

    assert result.exit_code == 2
    assert "mutually exclusive" in result.output


def test_slot_gt_land_no_checks_with_auto_is_conflicting(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "land", "--no-checks", "--auto"])

    assert result.exit_code == 2
    assert "--no-checks" in result.output
    assert "--auto" in result.output


def _land_pr(
    *,
    mergeable: str | None = "MERGEABLE",
    merge_state_status: str | None = "CLEAN",
) -> PRDetails:
    return PRDetails(
        number=200,
        url="https://github.example/pr/200",
        head_ref_name="feat/base",
        base_ref_name="main",
        state="OPEN",
        head_ref_oid="feat/base-oid",
        mergeable=mergeable,
        merge_state_status=merge_state_status,
        is_draft=False,
    )


def _land_fakes_for_bottom_pr(
    tmp_path: Path,
    *,
    pr: PRDetails,
    gt: FakeGtGateway | None = None,
) -> _GtFakes:
    main_path = (tmp_path / "repo").resolve()
    base_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    assignments = (SlotAssignment("slot-01", "feat/base", "now", base_path),)
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": pr})
    return _make_fakes(
        tmp_path,
        current_path_name="slot-01",
        current_branch="feat/base",
        assignments=assignments,
        worktrees=(
            WorktreeInfo(path=main_path, branch="main", is_bare=False),
            WorktreeInfo(path=base_path, branch="feat/base", is_bare=False),
        ),
        current_branch_by_path={main_path: "main", base_path: "feat/base"},
        gt=gt
        if gt is not None
        else FakeGtGateway(
            branch_by_cwd={base_path: "feat/base"},
            parent_by_branch={"feat/base": "main"},
            children_by_branch={"feat/base": ()},
        ),
        pr=pr_gateway,
    )


def test_slot_gt_land_refuses_conflicting_mergeable(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(mergeable="CONFLICTING")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "merge conflicts" in result.output
    assert "merge not attempted" in result.output


def test_slot_gt_land_refuses_dirty_merge_state(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(merge_state_status="DIRTY")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "merge state is DIRTY" in result.output


def test_slot_gt_land_behind_refused_without_auto(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(merge_state_status="BEHIND")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "BEHIND" in result.output
    assert "--auto" in result.output


def test_slot_gt_land_behind_passes_with_auto(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(merge_state_status="BEHIND")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run", "--auto"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert "would merge PR #200" in result.output


def test_slot_gt_land_emits_repair_incomplete_when_restack_fails(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    main_path = (tmp_path / "repo").resolve()
    base_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    child_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-02"
    assignments = (
        SlotAssignment("slot-01", "feat/base", "now", base_path),
        SlotAssignment("slot-02", "feat/child", "now", child_path),
    )
    pr = _land_pr()
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": pr})
    gt_gateway = FakeGtGateway(
        branch_by_cwd={base_path: "feat/base", child_path: "feat/child"},
        parent_by_branch={"feat/base": "main", "feat/child": "feat/base"},
        children_by_branch={"feat/base": ("feat/child",)},
        restack_failure_by_branch={
            "feat/child": GtCommandFailure(message="conflict", returncode=1),
        },
    )
    fakes = _make_fakes(
        tmp_path,
        current_path_name="slot-01",
        current_branch="feat/base",
        assignments=assignments,
        worktrees=(
            WorktreeInfo(path=main_path, branch="main", is_bare=False),
            WorktreeInfo(path=base_path, branch="feat/base", is_bare=False),
            WorktreeInfo(path=child_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={
            main_path: "main",
            base_path: "feat/base",
            child_path: "feat/child",
        },
        gt=gt_gateway,
        pr=pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--no-checks", "--no-free-slot"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "merge succeeded; repair incomplete" in result.output
    assert "feat/child" in result.output


def test_slot_gt_land_repair_incomplete_envelope_has_structured_data(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    main_path = (tmp_path / "repo").resolve()
    base_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    child_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-02"
    assignments = (
        SlotAssignment("slot-01", "feat/base", "now", base_path),
        SlotAssignment("slot-02", "feat/child", "now", child_path),
    )
    pr = _land_pr()
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": pr})
    gt_gateway = FakeGtGateway(
        branch_by_cwd={base_path: "feat/base", child_path: "feat/child"},
        parent_by_branch={"feat/base": "main", "feat/child": "feat/base"},
        children_by_branch={"feat/base": ("feat/child",)},
        restack_failure_by_branch={
            "feat/child": GtCommandFailure(message="conflict", returncode=1),
        },
    )
    fakes = _make_fakes(
        tmp_path,
        current_path_name="slot-01",
        current_branch="feat/base",
        assignments=assignments,
        worktrees=(
            WorktreeInfo(path=main_path, branch="main", is_bare=False),
            WorktreeInfo(path=base_path, branch="feat/base", is_bare=False),
            WorktreeInfo(path=child_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={
            main_path: "main",
            base_path: "feat/base",
            child_path: "feat/child",
        },
        gt=gt_gateway,
        pr=pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--no-checks", "--no-free-slot", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "repair_incomplete"
    data = payload["data"]
    assert isinstance(data, dict)
    failures = data["failures"]
    assert isinstance(failures, list)
    assert any(failure["target"] == "slot-02 feat/child" for failure in failures), failures
