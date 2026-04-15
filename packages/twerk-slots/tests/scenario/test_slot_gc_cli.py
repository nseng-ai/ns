"""Scenario tests for `slot gc`."""

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


def _make_obj(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    pr: FakePRGateway | None = None,
) -> SlotsCliContext:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    return SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        pool_state=fakes.pool_state,
        clipboard=fakes.clipboard,
        pr=pr or FakePRGateway(),
        slots_root=slots_root,
    )


def _fake_for_repo(
    tmp_path: Path,
    *,
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
    slot_name: str,
    branch: str,
    pool_size: int = 4,
    file_status: FileStatus | None = None,
) -> Path:
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
    state = fakes.pool_state.load()
    existing = state.assignments if state is not None else ()
    fakes.pool_state.save(
        PoolState(
            pool_size=pool_size,
            assignments=(
                *existing,
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


def _make_pr(number: int, state: str, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/twerk/pull/{number}",
        head_ref_name=branch,
        base_ref_name="master",
        state=state,  # type: ignore[arg-type]
    )


# -- help / shape -----------------------------------------------------------


def test_slot_gc_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot gc" in result.output
    assert "merged or closed PR" in result.output


def test_slot_gc_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "gc" in result.output


# -- error paths ------------------------------------------------------------


def test_slot_gc_not_in_repo_errors(
    cli_group: ClinkrGroup, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["gc"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output


def test_slot_gc_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # No `save` — pool_state.exists() is False.

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "No pool configured" in result.output


# -- happy paths ------------------------------------------------------------


def test_slot_gc_frees_merged_assignment(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, slot_name="slot-01", branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert "freed" in result.output.lower()
    assert "slot-01" in result.output
    assert "feat/done" in result.output
    # Pool state drained.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments == ()
    # Placeholder checkout happened.
    assert fakes.git._checkout_calls == [(worktree_path, "__slot-01-br-stub__")]


def test_slot_gc_dry_run_preserves_state(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, slot_name="slot-01", branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    # Pool unchanged.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1
    assert fakes.git._checkout_calls == []


# -- JSON mode --------------------------------------------------------------


def test_slot_gc_json_mode_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, slot_name="slot-01", branch="feat/done")
    _seed_assigned(fakes, slots_root, slot_name="slot-02", branch="feat/wip")
    pr = FakePRGateway(
        prs_by_branch={
            "feat/done": _make_pr(7, "MERGED", "feat/done"),
            "feat/wip": _make_pr(8, "OPEN", "feat/wip"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["json", "gc"],
        input=json.dumps({"dry_run": False}),
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["freed_count"] == 1
    assert payload["kept_count"] == 1
    assert payload["skipped_count"] == 0
    assert payload["error_count"] == 0
    assert payload["dry_run"] is False
    actions_by_slot = {e["slot_name"]: e["action"] for e in payload["entries"]}
    assert actions_by_slot == {"slot-01": "freed", "slot-02": "kept_open_pr"}


def test_slot_gc_json_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "gc", "--schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}
