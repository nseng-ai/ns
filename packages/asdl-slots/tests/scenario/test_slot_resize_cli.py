from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
    WorktreeOccupancy,
)
from asdl_slots.cli.main import build_cli
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _fake_for_repo(
    tmp_path: Path,
    *,
    slots_root: Path | None = None,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None,
    trunk_branch: str = "main",
    file_status_by_path: dict[Path, FileStatus] | None = None,
    operations_by_path: dict[Path, WorktreeOccupancy] | None = None,
    extra_existing: Iterable[Path] = (),
) -> SlotsCliContext:
    resolved_slots_root = slots_root if slots_root is not None else (tmp_path / "slots")
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *extra_existing},
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        operations_by_path=operations_by_path,
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=resolved_slots_root, git=git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=resolved_slots_root,
    )


def _machine_data(text: str) -> dict[str, object]:
    payload = json.loads(text)
    assert payload["exit_code"] == 0
    data = payload.get("data")
    assert isinstance(data, dict)
    return data


def _managed_wt(worktrees_dir: Path, n: int, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(
        path=worktrees_dir / f"slot-{n:02d}",
        branch=branch,
        is_bare=False,
    )


def _worktrees_dir(tmp_path: Path) -> Path:
    return tmp_path / "slots" / "repos" / "repo" / "worktrees"


def test_slot_resize_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["resize", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot resize" in result.output
    assert "--size" in result.output


def test_slot_resize_grow_from_empty(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path, trunk_branch="main")

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "3", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["previous_pool_size"] == 0
    assert payload["pool_size"] == 3
    assert payload["created"] == ["slot-01", "slot-02", "slot-03"]
    assert payload["removed"] == []


def test_slot_resize_grow_extends(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None), _managed_wt(wt_dir, 2, None)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "4", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["created"] == ["slot-03", "slot-04"]
    assert payload["removed"] == []

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert [path.name for _, path, _ in git._add_detached_worktree_calls] == [
        "slot-03",
        "slot-04",
    ]


def test_slot_resize_grow_fills_gap_then_extends(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None), _managed_wt(wt_dir, 3, None)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "4", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["created"] == ["slot-02", "slot-04"]
    assert payload["removed"] == []


def test_slot_resize_same_size_is_noop(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None), _managed_wt(wt_dir, 2, None)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "2", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["created"] == []
    assert payload["removed"] == []
    assert payload["pool_size"] == 2

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert git._add_detached_worktree_calls == []
    assert git._remove_worktree_calls == []


def test_slot_resize_shrink_removes_high_numbered(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=tuple(_managed_wt(wt_dir, n, None) for n in (1, 2, 3, 4)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "2", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["created"] == []
    assert payload["removed"] == ["slot-03", "slot-04"]
    assert payload["pool_size"] == 2

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert [path.name for _, path in git._remove_worktree_calls] == ["slot-03", "slot-04"]


def test_slot_resize_shrink_refuses_when_assigned(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        worktrees=(
            _managed_wt(wt_dir, 1, None),
            _managed_wt(wt_dir, 2, "feat/x"),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "resize_unsafe"
    assert "slot-02" in payload["message"]
    assert "feat/x" in payload["message"]

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert git._remove_worktree_calls == []


@pytest.mark.parametrize(
    ("operation", "recovery_fragment"),
    [("rebase", "git rebase"), ("bisect", "git bisect reset")],
)
def test_slot_resize_shrink_refuses_when_operation_in_progress(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    operation: str,
    recovery_fragment: str,
) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    slot_02 = wt_dir / "slot-02"
    branch = f"feat/{operation}"
    ctx = _fake_for_repo(
        tmp_path,
        branches=(branch,),
        worktrees=(_managed_wt(wt_dir, 1, None), _managed_wt(wt_dir, 2, None)),
        operations_by_path={
            slot_02: WorktreeOccupancy(
                path=slot_02,
                branch=branch,
                operation=operation,
            ),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "resize_unsafe"
    assert "slot-02" in payload["message"]
    assert branch in payload["message"]
    assert operation in payload["message"]
    assert recovery_fragment in payload["message"]

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert git._remove_worktree_calls == []


def test_slot_resize_shrink_refuses_when_dirty(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    slot_02 = wt_dir / "slot-02"
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None), _managed_wt(wt_dir, 2, None)),
        file_status_by_path={slot_02: FileStatus(False, True, False)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "resize_unsafe"
    assert "slot-02" in payload["message"]

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert git._remove_worktree_calls == []


def test_slot_resize_shrink_lists_all_offenders(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    slot_03 = wt_dir / "slot-03"
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        worktrees=(
            _managed_wt(wt_dir, 1, None),
            _managed_wt(wt_dir, 2, "feat/x"),
            _managed_wt(wt_dir, 3, None),
        ),
        file_status_by_path={slot_03: FileStatus(False, True, False)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert "slot-02" in payload["message"]
    assert "slot-03" in payload["message"]

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert git._remove_worktree_calls == []


def test_slot_resize_shrink_assigned_takes_priority_over_dirty(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    slot_02 = wt_dir / "slot-02"
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        worktrees=(
            _managed_wt(wt_dir, 1, None),
            _managed_wt(wt_dir, 2, "feat/x"),
        ),
        file_status_by_path={slot_02: FileStatus(False, True, False)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = json.loads(result.output)
    assert payload["error_type"] == "resize_unsafe"
    message = payload["message"]
    assert "assigned" in message.lower()
    assert "uncommitted" not in message.lower()


def test_slot_resize_shrink_to_one(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=tuple(_managed_wt(wt_dir, n, None) for n in (1, 2, 3)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["pool_size"] == 1
    assert payload["removed"] == ["slot-02", "slot-03"]


@pytest.mark.parametrize("size", ["0", "-1", "100"])
def test_slot_resize_invalid_size(cli_group: ClinkrGroup, tmp_path: Path, size: str) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", size, "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "invalid_size"


def test_slot_resize_no_repo_sentinel(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "2", "--format", "json"],
        obj=_obj(sentinel),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "not_in_repo"


def test_slot_resize_format_json_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["resize", "--size", "2", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert set(data) == {
        "previous_pool_size",
        "pool_size",
        "created",
        "removed",
        "worktrees_dir",
    }


def test_slot_resize_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["resize", "--json-schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_json_schema", "output_json_schema"}
