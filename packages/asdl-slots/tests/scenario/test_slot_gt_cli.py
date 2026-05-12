from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, FileStatus, WorktreeInfo
from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import UntrackedBranch
from asdl_slots.cli.main import build_cli
from asdl_slots.cli.slot.gt.context import SlotGtContext
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import RepoContext
from asdl_slots.shell_integration import SLOT_CD_DIRECTIVE_FILE


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


def _compact(text: str) -> str:
    return " ".join(text.split())


def _make_fakes(
    tmp_path: Path,
    *,
    current_path_name: str = "repo",
    current_branch: str = "feat/base",
    branches: tuple[str, ...] = ("main", "feat/base", "feat/child"),
    worktrees: tuple[WorktreeInfo, ...] | None = None,
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
    repo = RepoContext(
        root=current_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=slots_root / "repos" / "repo",
        worktrees_dir=slots_root / "repos" / "repo" / "worktrees",
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
        *(wt.path for wt in resolved_worktrees),
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
    clipboard = FakeClipboardGateway()
    pr_gateway = pr if pr is not None else FakePRGateway()
    slots_ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
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


@pytest.mark.parametrize("command", [["gt", "up", "-h"], ["gt", "down", "-h"]])
def test_slot_gt_navigation_help_mentions_shell_integration(
    cli_group: ClinkrGroup, command: list[str]
) -> None:
    result = CliRunner().invoke(cli_group, command)
    output = _compact(result.output)

    assert result.exit_code == 0, result.output
    assert "active shell integration can cd the parent shell" in output


def test_slot_gt_up_navigates_to_single_child_slot(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slot_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-02"
    fakes = _make_fakes(
        tmp_path,
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
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["gt", "up"],
        obj=_obj(fakes.ctx),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.exit_code == 0, result.output
    assert "slot-02" in result.output
    assert f"cd {slot_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {slot_path}"
    assert directive_path.read_text(encoding="utf-8") == str(slot_path)


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
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["gt", "down"],
        obj=_obj(fakes.ctx),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.exit_code == 0, result.output
    assert f"cd {main_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {main_path}"
    assert directive_path.read_text(encoding="utf-8") == str(main_path)


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
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["gt", "up", "--format", "json"],
        obj=_obj(fakes.ctx),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )
    data = _machine_data(result.output)

    assert result.exit_code == 0
    assert data["branch_name"] == "feat/child"
    assert data["worktree_path"] == str(child_path)
    assert not directive_path.exists()
