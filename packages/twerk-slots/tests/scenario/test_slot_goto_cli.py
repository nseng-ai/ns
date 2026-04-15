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
from twerk_slots.context import SlotsCliContext
from twerk_slots.context_testing import build_test_slots_context
from twerk_slots.gateway import real_git
from twerk_slots.gateway.git import FileStatus, WorktreeInfo
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    pool_state: FakePoolStateGateway
    clipboard: FakeClipboardGateway
    repo_root: Path


def _make_obj(fakes: _SlotFakes, slots_root: Path) -> SlotsCliContext:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    return build_test_slots_context(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        pool_state=fakes.pool_state,
        clipboard=fakes.clipboard,
        slots_root=slots_root,
    )


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
        clipboard=FakeClipboardGateway(),
        repo_root=repo_root,
    )


def _seed_assigned(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    slot_name: str = "slot-01",
    branch: str = "feat/x",
    pool_size: int = 4,
) -> Path:
    """Seed pool state + fakes so ``slot_name`` holds ``branch``. Returns worktree path."""
    worktree_path = slots_root / "repos" / "repo" / "worktrees" / slot_name
    fakes.storage._existing_paths.add(worktree_path)
    fakes.git._existing_paths.add(worktree_path)
    fakes.git._branches.add(branch)
    fakes.git._worktrees.append(
        WorktreeInfo(path=worktree_path, branch=branch, is_bare=False),
    )
    fakes.git._current_branch_by_path[worktree_path] = branch
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


def test_slot_goto_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["goto", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot goto" in result.output
    assert "worktree path" in result.output


def test_slot_goto_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "goto" in result.output


# -- happy paths ------------------------------------------------------------


def test_slot_goto_by_slot_name(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    # Header mentions slot name + branch; last non-empty line is pipeable path.
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    last_line = result.output.strip().splitlines()[-1]
    assert last_line == str(worktree_path)


def test_slot_goto_by_slot_number(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, slot_name="slot-03", branch="feat/three")

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--num", "3"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-03" in result.output
    assert "feat/three" in result.output
    last_line = result.output.strip().splitlines()[-1]
    assert last_line == str(worktree_path)


# -- JSON mode --------------------------------------------------------------


def test_slot_goto_json_returns_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["json", "goto"],
        input=json.dumps({"wt": "slot-01"}),
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["slot_name"] == "slot-01"
    assert payload["branch_name"] == "feat/x"
    assert payload["worktree_path"] == str(worktree_path)


def test_slot_goto_json_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "goto", "--schema"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


# -- error paths ------------------------------------------------------------


def test_slot_goto_slot_not_assigned_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # Seed an empty pool (load returns non-None but no assignments).
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-02"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not currently assigned" in result.output


def test_slot_goto_invalid_slot_num_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--num", "99"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "must be in 1..4" in result.output


def test_slot_goto_invalid_slot_wt_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "bogus"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not a valid slot name" in result.output


def test_slot_goto_missing_flag_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["goto"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "--num or --wt" in result.output


def test_slot_goto_conflicting_flags_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--num", "1", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not both" in result.output


def test_slot_goto_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # No prior `save` — pool_state.load() returns None.

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "No pool configured" in result.output


def test_slot_goto_worktree_missing_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    # Pool.json references the worktree but it's gone from disk.
    fakes.storage._existing_paths.discard(worktree_path)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "missing" in result.output
    assert "slot-01" in result.output


def test_slot_goto_not_in_repo_errors(
    cli_group: ClinkrGroup, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["goto", "--wt", "slot-01"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
