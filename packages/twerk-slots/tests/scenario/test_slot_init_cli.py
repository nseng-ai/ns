from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from twerk_slots.cli.main import build_cli
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing.clipboard import FakeClipboardGateway
from twerk_slots.gateway.testing.pool_state import FakePoolStateGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway
from twerk_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


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
    extra_existing: Iterable[Path] = (),
) -> SlotsCliContext:
    resolved_slots_root = slots_root if slots_root is not None else (tmp_path / "slots")
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = resolved_slots_root / "repos" / "repo" / "pool.json"
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
        pool_state=FakePoolStateGateway(pool_json_path),
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


def test_slot_init_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["init", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot init" in result.output
    assert "--size" in result.output


def test_slot_init_creates_n_detached_worktrees(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path, trunk_branch="main")

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "3", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 0, result.output
    payload = _machine_data(result.output)
    assert payload["pool_size"] == 3
    assert payload["created"] == ["slot-01", "slot-02", "slot-03"]

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    calls = git._add_detached_worktree_calls
    assert len(calls) == 3
    expected_dir = _worktrees_dir(tmp_path)
    for (_, path, ref), expected_n in zip(calls, (1, 2, 3), strict=True):
        assert path == expected_dir / f"slot-{expected_n:02d}"
        assert ref == "main"

    worktrees = git.list_worktrees()
    assert len(worktrees) == 3
    assert all(wt.branch is None for wt in worktrees)


def test_slot_init_size_one(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "1", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["pool_size"] == 1
    assert payload["created"] == ["slot-01"]


def test_slot_init_size_99(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "99", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["pool_size"] == 99
    assert len(payload["created"]) == 99
    assert payload["created"][-1] == "slot-99"


@pytest.mark.parametrize("size", ["0", "-1", "100"])
def test_slot_init_rejects_invalid_size(cli_group: ClinkrGroup, tmp_path: Path, size: str) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", size, "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "invalid_size"


def test_slot_init_refuses_when_pool_already_initialized(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "3", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "pool_already_initialized"
    assert "slot resize" in payload["message"]

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    assert git._add_detached_worktree_calls == []


def test_slot_init_format_json_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "2", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert set(data) == {"pool_size", "created", "worktrees_dir"}
    assert data["worktrees_dir"].endswith("/worktrees")


def test_slot_init_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["init", "--schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_schema", "output_schema"}


def test_slot_init_no_repo_sentinel(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "2", "--format", "json"],
        obj=_obj(sentinel),
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "not_in_repo"


def test_slot_init_uses_repo_worktrees_dir(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["init", "--size", "2", "--format", "json"],
        obj=_obj(ctx),
    )

    payload = _machine_data(result.output)
    assert payload["worktrees_dir"] == str(_worktrees_dir(tmp_path))

    git = ctx.git
    assert isinstance(git, FakeGitGateway)
    for _, path, _ in git._add_detached_worktree_calls:
        assert path.parent == _worktrees_dir(tmp_path)
