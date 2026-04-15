from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRSummary
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
    pr: FakePRGateway
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
        pr=fakes.pr,
        storage=fakes.storage,
        pool_state=fakes.pool_state,
        clipboard=fakes.clipboard,
        slots_root=slots_root,
    )


def _fake_for_repo(
    tmp_path: Path,
    *,
    pr: FakePRGateway | None = None,
    branches: tuple[str, ...] = (),
    branch_head_by_name: dict[str, str] | None = None,
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | None] | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = tmp_path / "slots" / "repos" / "repo" / "pool.json"
    storage = FakeSlotsStorageGateway(existing_paths={repo_root, Path.cwd(), *extra_existing})
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        branch_head_by_name=branch_head_by_name,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        file_status_by_path=file_status_by_path,
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        storage=storage,
    )
    return _SlotFakes(
        git=git,
        pr=FakePRGateway() if pr is None else pr,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        clipboard=FakeClipboardGateway(),
        repo_root=repo_root,
    )


def _pr(*, number: int, branch_name: str, head_ref_oid: str, state: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/twerk/pull/{number}",
        head_ref_name=branch_name,
        head_ref_oid=head_ref_oid,
        base_ref_name="main",
        state=state,
    )


def _seed_assigned(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    slot_name: str = "slot-01",
    branch: str = "feat/x",
    branch_head: str = "abc123",
    pool_size: int = 4,
    file_status: FileStatus | None = None,
) -> Path:
    worktree_path = slots_root / "repos" / "repo" / "worktrees" / slot_name
    fakes.storage._existing_paths.add(worktree_path)
    fakes.git._existing_paths.add(worktree_path)
    fakes.git._branches.add(branch)
    fakes.git._branch_head_by_name[branch] = branch_head
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


def test_slot_gc_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot gc" in result.output
    assert "Garbage-collect slot assignments" in result.output
    assert "--dry-run" in result.output


def test_slot_gc_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "gc" in result.output


def test_slot_gc_outside_repo_errors(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--git-common-dir"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["gc"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output


def test_slot_gc_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "No pool configured" in result.output


def test_slot_gc_frees_merged_slot(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    head = "abc123"
    fakes = _fake_for_repo(
        tmp_path,
        pr=FakePRGateway(
            prs_by_branch_state={
                ("feat/merged", "all"): (
                    _pr(number=47, branch_name="feat/merged", head_ref_oid=head, state="MERGED"),
                )
            }
        ),
    )
    _seed_assigned(fakes, slots_root, branch="feat/merged", branch_head=head)

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Freed slot-01" in result.output
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments == ()


def test_slot_gc_dry_run_leaves_pool_unchanged(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    head = "abc123"
    fakes = _fake_for_repo(
        tmp_path,
        pr=FakePRGateway(
            prs_by_branch_state={
                ("feat/dry-run", "all"): (
                    _pr(number=48, branch_name="feat/dry-run", head_ref_oid=head, state="CLOSED"),
                )
            }
        ),
    )
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/dry-run", branch_head=head)

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Dry run" in result.output
    assert "Would free slot-01" in result.output
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments == (
        SlotAssignment("slot-01", "feat/dry-run", "2026-04-01T00:00:00+00:00", worktree_path),
    )


def test_slot_gc_keeps_open_pr_slot(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    head = "abc123"
    fakes = _fake_for_repo(
        tmp_path,
        pr=FakePRGateway(
            prs_by_branch_state={
                ("feat/open", "all"): (
                    _pr(number=49, branch_name="feat/open", head_ref_oid=head, state="OPEN"),
                )
            }
        ),
    )
    _seed_assigned(fakes, slots_root, branch="feat/open", branch_head=head)

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Kept slot-01" in result.output
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1


def test_slot_gc_json_returns_entries_and_counts(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    head = "abc123"
    fakes = _fake_for_repo(
        tmp_path,
        pr=FakePRGateway(
            prs_by_branch_state={
                ("feat/json", "all"): (
                    _pr(number=50, branch_name="feat/json", head_ref_oid=head, state="MERGED"),
                )
            }
        ),
    )
    _seed_assigned(fakes, slots_root, branch="feat/json", branch_head=head)

    result = CliRunner().invoke(
        cli_group,
        ["json", "gc"],
        input="",
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["freed_count"] == 1
    assert payload["entries"][0]["action"] == "freed"
    assert payload["entries"][0]["pr_state"] == "MERGED"


def test_slot_gc_json_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "gc", "--schema"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}
