from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.main import build_cli
from twerk_slots.gateway import real_git
from twerk_slots.gateway.git import FileStatus, WorktreeInfo
from twerk_slots.gateway.testing import (
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    pool_state: FakePoolStateGateway
    repo_root: Path


def _make_obj(fakes: _SlotFakes, slots_root: Path) -> dict[str, object]:
    return {
        "git_gateway": fakes.git,
        "storage_gateway": fakes.storage,
        "pool_state_gateway": fakes.pool_state,
        "slots_root": slots_root,
    }


def _fake_for_repo(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | None] | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = tmp_path / "slots" / "repos" / "repo" / "pool.json"
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *extra_existing},
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        file_status_by_path=file_status_by_path,
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        storage=storage,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        repo_root=repo_root,
    )


def _seed_assigned(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    slot_name: str = "slot-01",
    branch: str = "feat/x",
    pool_size: int = 4,
    file_status: FileStatus | None = None,
) -> Path:
    """Seed pool state + git fakes so ``slot_name`` holds ``branch``. Returns worktree path."""
    worktree_path = slots_root / "repos" / "repo" / "worktrees" / slot_name
    fakes.storage._existing_paths.add(worktree_path)
    fakes.git._existing_paths.add(worktree_path)
    fakes.git._branches.add(branch)
    fakes.git._worktrees.append(
        WorktreeInfo(path=worktree_path, branch=branch, is_bare=False),
    )
    fakes.git._current_branch_by_path[worktree_path] = branch
    if file_status is not None:
        fakes.git._file_status_by_path[worktree_path] = file_status
    fakes.pool_state.save(
        PoolState(
            pool_size=pool_size,
            assignments=(
                SlotAssignment(
                    slot_name=slot_name,
                    branch_name=branch,
                    assigned_at="2026-04-01T00:00:00+00:00",
                    worktree_path=worktree_path,
                ),
            ),
        ),
    )
    return worktree_path


# -- help / shape -----------------------------------------------------------


def test_slot_free_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["free", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot free" in result.output
    assert "Release a slot assignment" in result.output


def test_slot_free_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "free" in result.output


# -- happy paths ------------------------------------------------------------


def test_slot_free_by_slot_name(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["free", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Freed" in result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    # Placeholder checkout happened.
    assert fakes.git._checkout_calls == [(worktree_path, "__slot-01-br-stub__")]
    # pool.json now has the slot removed.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments == ()


def test_slot_free_by_slot_number(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, slot_name="slot-03", branch="feat/three")

    result = CliRunner().invoke(
        cli_group,
        ["free", "3"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-03" in result.output
    assert "feat/three" in result.output


def test_slot_free_from_cwd_autodetects(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    worktree_path.mkdir(parents=True)
    monkeypatch.chdir(worktree_path)

    result = CliRunner().invoke(
        cli_group,
        ["free"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output


# -- JSON mode --------------------------------------------------------------


def test_slot_free_json_returns_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["json", "free"],
        input=json.dumps({"slot": "slot-01"}),
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["slot_name"] == "slot-01"
    assert payload["branch_name"] == "feat/x"
    assert payload["placeholder_branch"] == "__slot-01-br-stub__"


def test_slot_free_json_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "free", "--schema"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


# -- error paths ------------------------------------------------------------


def test_slot_free_unknown_slot_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # Seed an empty pool (load returns non-None but no assignments).
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "slot-02"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not currently assigned" in result.output


def test_slot_free_invalid_slot_arg_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "99"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not a valid slot number" in result.output


def test_slot_free_dirty_worktree_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(
        fakes,
        slots_root,
        file_status=FileStatus(staged=False, modified=True, untracked=False),
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "uncommitted changes" in result.output
    # Pool state unchanged.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1


def test_slot_free_cwd_not_in_slot_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # Pool exists but cwd (the test's cwd) is not inside any slot worktree.
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "Not inside a pool slot" in result.output


def test_slot_free_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # No prior `save` — pool_state.load() returns None.

    result = CliRunner().invoke(
        cli_group,
        ["free", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "No pool configured" in result.output


def test_slot_free_not_in_repo_errors(
    cli_group: ClinkrGroup, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["free", "slot-01"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
