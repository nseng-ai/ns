from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from twerk_slots.gateway import real_git
from twerk_slots.gateway.git import FileStatus, WorktreeInfo
from twerk_slots.gateway.pool_state_gateway import RealPoolStateGateway
from twerk_slots.gateway.real_git import (
    RealGitGateway,
    parse_porcelain_status,
    parse_worktree_list_output,
)
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.pool_state import DEFAULT_POOL_SIZE, PoolState, SlotAssignment


def test_real_gateway_instantiates() -> None:
    # Regression: the ABC must be fully implemented so construction works.
    assert isinstance(RealGitGateway(repo_root=Path("/r")), RealGitGateway)


def test_list_worktrees_parses_porcelain(monkeypatch: pytest.MonkeyPatch) -> None:
    porcelain = (
        "worktree /home/alice/repo\n"
        "HEAD abc123\n"
        "branch refs/heads/main\n"
        "\n"
        "worktree /home/alice/.slots/repos/repo/worktrees/slot-01\n"
        "HEAD def456\n"
        "branch refs/heads/feat/x\n"
        "\n"
        "worktree /home/alice/detached\n"
        "HEAD 111aaa\n"
        "detached\n"
        "\n"
    )

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["git", "worktree", "list", "--porcelain"]
        return subprocess.CompletedProcess(cmd, 0, stdout=porcelain, stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    worktrees = RealGitGateway(repo_root=Path("/home/alice/repo")).list_worktrees()

    assert len(worktrees) == 3
    assert worktrees[0].path == Path("/home/alice/repo")
    assert worktrees[0].branch == "main"
    assert worktrees[1].path == Path("/home/alice/.slots/repos/repo/worktrees/slot-01")
    assert worktrees[1].branch == "feat/x"
    assert worktrees[2].branch is None  # detached HEAD


def test_list_worktrees_handles_bare(monkeypatch: pytest.MonkeyPatch) -> None:
    porcelain = "worktree /tmp/bare.git\nbare\n\n"

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout=porcelain, stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    worktrees = RealGitGateway(repo_root=Path("/tmp/bare.git")).list_worktrees()
    assert worktrees[0].is_bare is True


def test_branch_exists_uses_show_ref(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    assert RealGitGateway(repo_root=Path("/r")).branch_exists("feat/x") is True
    assert captured == [
        ["git", "show-ref", "--verify", "--quiet", "refs/heads/feat/x"],
    ]


def test_branch_exists_returns_false_on_nonzero(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    assert RealGitGateway(repo_root=Path("/r")).branch_exists("nope") is False


def test_get_current_branch_returns_none_when_detached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="fatal: ref HEAD")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    assert RealGitGateway(repo_root=Path("/r")).get_current_branch(Path("/r")) is None


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        ("", FileStatus(False, False, False)),
        ("?? untracked.py\n", FileStatus(False, False, True)),
        (" M modified.py\n", FileStatus(False, True, False)),
        ("A  staged.py\n", FileStatus(True, False, False)),
        (" M modified.py\nA  staged.py\n?? untracked.py\n", FileStatus(True, True, True)),
        ("MM conflicted.py\n", FileStatus(True, True, False)),
        ("R  old.py -> new.py\n", FileStatus(True, False, False)),
        ("D  gone.py\n", FileStatus(True, False, False)),
        ("T  typechange.py\n", FileStatus(True, False, False)),
        ("?\n", FileStatus(False, False, False)),
    ],
    ids=[
        "empty",
        "untracked_only",
        "modified_only",
        "staged_only",
        "all_three",
        "staged_and_modified_same_file",
        "rename_staged",
        "deleted_staged",
        "typechange_staged",
        "short_line_ignored",
    ],
)
def test_parse_porcelain_status(stdout: str, expected: FileStatus) -> None:
    assert parse_porcelain_status(stdout) == expected


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        (
            "",
            (),
        ),
        (
            "worktree /home/alice/repo\nHEAD abc123\nbranch refs/heads/main\n\n",
            (WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),),
        ),
        (
            "worktree /home/alice/detached\nHEAD abc123\ndetached\n\n",
            (WorktreeInfo(path=Path("/home/alice/detached"), branch=None, is_bare=False),),
        ),
        (
            "worktree /tmp/bare.git\nbare\n\n",
            (WorktreeInfo(path=Path("/tmp/bare.git"), branch=None, is_bare=True),),
        ),
        (
            (
                "worktree /home/alice/repo\nHEAD abc\nbranch refs/heads/main\n\n"
                "worktree /home/alice/wt\nHEAD def\nbranch refs/heads/feat/x\n\n"
            ),
            (
                WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),
                WorktreeInfo(path=Path("/home/alice/wt"), branch="feat/x", is_bare=False),
            ),
        ),
        (
            "worktree /home/alice/repo\nHEAD abc\nbranch refs/heads/main\n",
            (WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),),
        ),
        (
            (
                "worktree /home/alice/repo\nHEAD abc\nbranch refs/heads/main\n"
                "sparse-checkout\nlocked\n\n"
            ),
            (WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),),
        ),
        (
            "branch refs/heads/orphan\n\n",
            (),
        ),
    ],
    ids=[
        "empty",
        "single_with_branch",
        "detached_head",
        "bare",
        "multiple_worktrees",
        "no_trailing_blank_line",
        "unknown_porcelain_keys_ignored",
        "branch_line_before_worktree_line_ignored",
    ],
)
def test_parse_worktree_list_output(stdout: str, expected: tuple[WorktreeInfo, ...]) -> None:
    assert parse_worktree_list_output(stdout) == expected


def test_get_file_status_delegates_to_parser(monkeypatch: pytest.MonkeyPatch) -> None:
    output = " M modified.py\nA  staged.py\n?? untracked.py\n"

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout=output, stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    assert RealGitGateway(repo_root=Path("/r")).get_file_status(Path("/r")) == FileStatus(
        True, True, True
    )


def test_create_branch_without_force(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    RealGitGateway(repo_root=Path("/r")).create_branch("feat/x", "main", force=False)

    assert captured == [["git", "branch", "feat/x", "main"]]


def test_create_branch_with_force(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    RealGitGateway(repo_root=Path("/r")).create_branch("feat/x", "main", force=True)

    assert captured == [["git", "branch", "-f", "feat/x", "main"]]


def test_list_local_branches_parses_for_each_ref(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="main\nfeat/x\n", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    assert RealGitGateway(repo_root=Path("/r")).list_local_branches() == ("main", "feat/x")


def test_get_git_common_dir_resolves_relative(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout=".git\n", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = RealGitGateway(repo_root=repo).get_git_common_dir(repo)
    assert result == (repo / ".git").resolve()


def test_get_git_common_dir_returns_none_outside_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    assert RealGitGateway(repo_root=Path("/tmp")).get_git_common_dir(Path("/tmp")) is None


# -- RealSlotsStorageGateway ------------------------------------------------


def test_real_storage_path_exists_reports_actual_filesystem(tmp_path: Path) -> None:
    gateway = RealSlotsStorageGateway()
    existing = tmp_path / "dir"
    existing.mkdir()

    assert gateway.path_exists(existing)
    assert not gateway.path_exists(tmp_path / "missing")


def test_real_storage_ensure_dir_creates_nested_directories(tmp_path: Path) -> None:
    gateway = RealSlotsStorageGateway()
    nested = tmp_path / "a" / "b" / "c"

    gateway.ensure_dir(nested)

    assert nested.is_dir()


def test_real_storage_ensure_dir_is_idempotent(tmp_path: Path) -> None:
    gateway = RealSlotsStorageGateway()
    target = tmp_path / "d"
    target.mkdir()

    gateway.ensure_dir(target)
    gateway.ensure_dir(target)

    assert target.is_dir()


# -- RealPoolStateGateway ---------------------------------------------------


def test_real_pool_state_load_missing_returns_none(tmp_path: Path) -> None:
    gateway = RealPoolStateGateway(pool_json_path=tmp_path / "missing.json")
    assert gateway.load() is None


def test_real_pool_state_save_creates_parent_directories(tmp_path: Path) -> None:
    pool_json = tmp_path / "nested" / "deep" / "pool.json"
    gateway = RealPoolStateGateway(pool_json_path=pool_json)

    gateway.save(PoolState(pool_size=16, assignments=()))

    assert pool_json.exists()
    assert json.loads(pool_json.read_text()) == {"pool_size": 16, "assignments": []}


def test_real_pool_state_round_trip_empty(tmp_path: Path) -> None:
    pool_json = tmp_path / "pool.json"
    gateway = RealPoolStateGateway(pool_json_path=pool_json)
    state = PoolState(pool_size=16, assignments=())

    gateway.save(state)

    assert gateway.load() == state


def test_real_pool_state_round_trip_preserves_assignments(tmp_path: Path) -> None:
    pool_json = tmp_path / "pool.json"
    gateway = RealPoolStateGateway(pool_json_path=pool_json)
    worktree = tmp_path / "worktrees" / "slot-01"
    state = PoolState(
        pool_size=8,
        assignments=(
            SlotAssignment(
                slot_name="slot-01",
                branch_name="feat/x",
                assigned_at="2026-04-12T00:00:00+00:00",
                worktree_path=worktree,
            ),
        ),
    )

    gateway.save(state)
    loaded = gateway.load()

    assert loaded == state
    assert loaded is not None
    assert loaded.assignments[0].worktree_path == worktree


def test_real_pool_state_load_missing_pool_size_falls_back_to_default(tmp_path: Path) -> None:
    pool_json = tmp_path / "pool.json"
    pool_json.write_text(json.dumps({"assignments": []}))
    gateway = RealPoolStateGateway(pool_json_path=pool_json)

    loaded = gateway.load()

    assert loaded is not None
    assert loaded.pool_size == DEFAULT_POOL_SIZE
