from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRCommandError, PRDetails
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead, FileStatus, WorktreeInfo
from twerk_slots.cli.main import build_cli
from twerk_slots.cli.slot.gt.context import SlotGtContext
from twerk_slots.cli.slot.gt.testing import FakeGtGateway
from twerk_slots.cli.slot.gt.types import UntrackedBranch
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
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": _land_pr(number=123)})
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr_gateway=pr_gateway)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert "would request squash merge for PR #123 at feat/base-oid" in result.output
    assert "branch feat/base -> main" in result.output
    assert pr_gateway.merge_calls == ()
    assert fakes.gt.sync_calls == ()
    assert fakes.gt.restack_calls == ()


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


def test_slot_gt_land_requests_merge_once_without_repair(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": _land_pr(number=124)})
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr_gateway=pr_gateway)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert pr_gateway.merge_calls == ((124, "feat/base-oid", False, False),)
    assert fakes.gt.sync_calls == ()
    assert fakes.gt.restack_calls == ()
    assert fakes.git.fetch_calls == ()
    assert fakes.git.pull_calls == ()
    assert fakes.git.update_ref_calls == ()
    assert "merge request completed for PR #124" in result.output
    assert "merged PR" not in result.output


def test_slot_gt_land_admin_passes_admin_to_merge(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": _land_pr(number=125)})
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr_gateway=pr_gateway)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--admin"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert pr_gateway.merge_calls == ((125, "feat/base-oid", True, False),)


def test_slot_gt_land_auto_passes_auto_and_does_not_repair(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": _land_pr(number=126)})
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr_gateway=pr_gateway)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--auto"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert pr_gateway.merge_calls == ((126, "feat/base-oid", False, True),)
    assert fakes.gt.sync_calls == ()
    assert fakes.gt.restack_calls == ()
    assert "auto-merge request completed for PR #126" in result.output


@pytest.mark.parametrize(
    "flag",
    ["--up", "--down", "--no-restack", "--no-free-slot", "--no-checks"],
)
def test_slot_gt_land_removed_flags_are_rejected_by_click(
    cli_group: ClinkrGroup,
    flag: str,
) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "land", flag])

    assert result.exit_code == 2
    assert f"No such option: {flag}" in result.output


def _land_pr(
    *,
    number: int = 200,
    head_ref_name: str = "feat/base",
    base_ref_name: str = "main",
    head_ref_oid: str = "feat/base-oid",
) -> PRDetails:
    return PRDetails(
        number=number,
        head_ref_name=head_ref_name,
        base_ref_name=base_ref_name,
        head_ref_oid=head_ref_oid,
    )


def _land_fakes_for_bottom_pr(
    tmp_path: Path,
    *,
    pr: PRDetails | None = None,
    pr_gateway: FakePRGateway | None = None,
    gt: FakeGtGateway | None = None,
) -> _GtFakes:
    main_path = (tmp_path / "repo").resolve()
    base_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    assignments = (SlotAssignment("slot-01", "feat/base", "now", base_path),)
    resolved_pr_gateway = pr_gateway or FakePRGateway(
        pr_details_by_branch={"feat/base": pr or _land_pr()}
    )
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
        ),
        pr=resolved_pr_gateway,
    )


def test_slot_gt_land_detached_head_is_refused_before_merge(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    repo_root = (tmp_path / "repo").resolve()
    pr_gateway = FakePRGateway(pr_details_by_branch={"feat/base": _land_pr()})
    fakes = _make_fakes(
        tmp_path,
        current_branch_by_path={repo_root: DetachedHead()},
        pr=pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "detached" in result.output
    assert "merge not attempted" in result.output
    assert pr_gateway.merge_calls == ()


def test_slot_gt_land_pr_head_ref_mismatch_is_refused(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(head_ref_name="other-branch")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "head ref is 'other-branch'" in result.output
    assert "merge not attempted" in result.output


def test_slot_gt_land_pr_base_ref_mismatch_is_refused(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(base_ref_name="develop")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "base ref is 'develop'" in result.output
    assert "merge not attempted" in result.output


def test_slot_gt_land_local_head_mismatch_is_refused(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr = _land_pr(head_ref_oid="remote-head-oid")
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=pr)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "local HEAD feat/base-oid does not match PR head remote-head-oid" in result.output
    assert "merge not attempted" in result.output


def test_slot_gt_land_merge_failure_returns_github_error(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    pr_gateway = FakePRGateway(
        pr_details_by_branch={"feat/base": _land_pr(number=127)},
        merge_failure=PRCommandError(stderr="required checks are failing", returncode=1),
    )
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr_gateway=pr_gateway)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "required checks are failing" in result.output
    assert pr_gateway.merge_calls == ((127, "feat/base-oid", False, False),)


def test_slot_gt_land_json_output_contains_merge_request_summary(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _land_fakes_for_bottom_pr(tmp_path, pr=_land_pr(number=128))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "land", "--dry-run", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    data = _machine_data(result.output)
    assert data["dry_run"] is True
    assert data["pr_number"] == 128
    assert data["current_branch"] == "feat/base"
    assert data["trunk_branch"] == "main"
    assert data["head_oid"] == "feat/base-oid"
