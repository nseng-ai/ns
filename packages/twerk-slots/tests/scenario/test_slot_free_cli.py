from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from twerk_slots.cli.main import build_cli
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


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


def _make_obj(fakes: _SlotFakes, slots_root: Path) -> ClinkrContextObject:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    ctx = SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        pool_state=fakes.pool_state,
        clipboard=fakes.clipboard,
        pr=FakePRGateway(),
        slots_root=slots_root,
    )
    return build_clinkr_context_object(lambda: ctx)


def _fake_for_repo(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
    trunk_branch: str = "main",
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
        on_add_worktree=storage.ensure_dir,
        trunk_branch=trunk_branch,
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
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Freed" in result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    # Worktree detached at trunk.
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
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
        ["free", "--num", "3"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-03" in result.output
    assert "feat/three" in result.output


def test_slot_free_current_happy_path(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = worktree_path

    result = CliRunner().invoke(
        cli_group,
        ["free", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Freed" in result.output
    assert "slot-01" in result.output
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments == ()


def test_slot_free_current_short_flag(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = worktree_path

    result = CliRunner().invoke(
        cli_group,
        ["free", "-c"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output


def test_slot_free_current_outside_slot_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["free", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not a slot directory" in result.output


def test_slot_free_current_unassigned_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, slot_name="slot-01", branch="feat/x")
    slot_02_path = slots_root / "repos" / "repo" / "worktrees" / "slot-02"
    fakes.storage._existing_paths.add(slot_02_path)
    fakes.git._existing_paths.add(slot_02_path)
    fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = slot_02_path

    result = CliRunner().invoke(
        cli_group,
        ["free", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not currently assigned" in result.output


def test_slot_free_current_conflicts_with_num(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "--current", "--num", "1"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "exactly one of --num, --wt, or --current" in result.output


def test_slot_free_current_conflicts_with_wt(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "--current", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "exactly one of --num, --wt, or --current" in result.output


# -- JSON mode --------------------------------------------------------------


def test_slot_free_json_returns_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["json", "free"],
        input=json.dumps({"wt": "slot-01"}),
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["slot_name"] == "slot-01"
    assert payload["branch_name"] == "feat/x"
    assert "placeholder_branch" not in payload


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
        ["free", "--wt", "slot-02"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not currently assigned" in result.output


def test_slot_free_invalid_slot_num_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "--num", "99"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "must be in 1..4" in result.output


def test_slot_free_invalid_slot_wt_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "bogus"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not a valid slot name" in result.output


def test_slot_free_missing_flag_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "--num, --wt, or --current" in result.output


def test_slot_free_conflicting_flags_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    fakes.pool_state.save(PoolState(pool_size=4, assignments=()))

    result = CliRunner().invoke(
        cli_group,
        ["free", "--num", "1", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "exactly one of --num, --wt, or --current" in result.output


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
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "uncommitted changes" in result.output
    # Pool state unchanged.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1


def test_slot_free_surfaces_detach_head_failure_as_slot_allocation_error(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)

    def fail_detach(cwd: Path, ref: str) -> None:
        raise subprocess.CalledProcessError(
            128,
            ["git", "checkout", "--detach", ref],
            stderr="fatal: reference is not a tree: main",
        )

    monkeypatch.setattr(fakes.git, "detach_head", fail_detach)

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "Failed to detach" in result.output
    assert "reference is not a tree" in result.output
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments[0].worktree_path == worktree_path


def test_slot_free_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # No prior `save` — pool_state.exists() is False.

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "No pool configured" in result.output


def test_slot_free_not_in_repo_errors(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=build_clinkr_context_object(lambda: sentinel),
    )

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
