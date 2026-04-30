from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
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
    slots_root: Path


def _make_obj(fakes: _SlotFakes) -> ClinkrContextObject:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=fakes.slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    ctx = SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        pool_state=fakes.pool_state,
        clipboard=fakes.clipboard,
        pr=FakePRGateway(),
        slots_root=fakes.slots_root,
    )
    return build_clinkr_context_object(lambda: ctx)


def _slot_path(slots_root: Path, slot_name: str = "slot-01") -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / slot_name


def _detached_slot(slots_root: Path, n: int) -> WorktreeInfo:
    return WorktreeInfo(path=_slot_path(slots_root, f"slot-{n:02d}"), branch=None, is_bare=False)


def _assigned_slot(slots_root: Path, n: int, branch: str) -> WorktreeInfo:
    return WorktreeInfo(
        path=_slot_path(slots_root, f"slot-{n:02d}"),
        branch=branch,
        is_bare=False,
    )


def _fake_for_repo(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    pool_worktrees: tuple[WorktreeInfo, ...] = (),
    extra_worktrees: tuple[WorktreeInfo, ...] = (),
    main_branch: str | None = None,
    current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None,
    previous_branch_by_path: dict[Path, str | None] | None = None,
    trunk_branch: str = "main",
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
    repository_root_by_cwd: dict[Path, Path] | None = None,
    clipboard_should_succeed: bool = True,
) -> _SlotFakes:
    """Build the fake gateway bundle for a slots scenario test.

    ``pool_worktrees`` declares the managed pool slots seeded into git. Pass
    ``main_branch`` to also seed the main repo worktree (otherwise the main
    worktree is omitted, simulating discovery from inside a managed slot or
    from outside any slot). ``extra_worktrees`` covers any other entries the
    test wants in ``git worktree list``.
    """
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    slots_root = tmp_path / "slots"
    pool_json_path = slots_root / "repos" / "repo" / "pool.json"

    main_wt: tuple[WorktreeInfo, ...] = ()
    if main_branch is not None:
        main_wt = (WorktreeInfo(path=repo_root, branch=main_branch, is_bare=False),)

    seeded_worktrees = main_wt + pool_worktrees + extra_worktrees
    seeded_paths = {wt.path for wt in seeded_worktrees}

    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *seeded_paths, *extra_existing},
    )
    root_map = (
        dict(repository_root_by_cwd)
        if repository_root_by_cwd is not None
        else {Path.cwd().resolve(): repo_root}
    )

    seeded_current_branch: dict[Path, str | DetachedHead | GitCommandFailure] = {}
    for wt in seeded_worktrees:
        seeded_current_branch[wt.path] = wt.branch if wt.branch is not None else DetachedHead()
    if current_branch_by_path is not None:
        seeded_current_branch.update(current_branch_by_path)

    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=seeded_worktrees,
        current_branch_by_path=seeded_current_branch,
        previous_branch_by_path=previous_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        existing_paths={repo_root, Path.cwd(), *seeded_paths, *extra_existing},
        repository_root_by_cwd=root_map,
        on_add_worktree=storage.ensure_dir,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        clipboard=FakeClipboardGateway(should_succeed=clipboard_should_succeed),
        repo_root=repo_root,
        slots_root=slots_root,
    )


def _worktree_for_path(fakes: _SlotFakes, path: Path) -> WorktreeInfo:
    worktree = next((wt for wt in fakes.git.list_worktrees() if wt.path == path), None)
    assert worktree is not None, f"missing worktree for {path}"
    return worktree


def _assert_assigned_slot_state(
    fakes: _SlotFakes,
    *,
    slot_name: str,
    branch_name: str,
) -> Path:
    worktree_path = _slot_path(fakes.slots_root, slot_name)
    assert fakes.git.get_current_branch(worktree_path) == branch_name
    assert _worktree_for_path(fakes, worktree_path) == WorktreeInfo(
        path=worktree_path,
        branch=branch_name,
        is_bare=False,
    )
    return worktree_path


# -- help / shape -----------------------------------------------------------


def test_slot_checkout_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["checkout", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot checkout" in result.output
    assert "BRANCH_NAME" in result.output
    assert "BASE" in result.output
    assert "--current" in result.output
    assert "--new" in result.output
    assert "--no-clipboard" in result.output
    assert "--format" in result.output
    assert "--schema" in result.output


# -- checkout basic ---------------------------------------------------------


def test_slot_checkout_existing_branch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "Checked out" in result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    worktree_path = _slot_path(fakes.slots_root, "slot-01")
    assert f"cd {worktree_path}" in result.output
    assert "Copied cd command to clipboard." in result.output
    assert fakes.clipboard.last_copied == f"cd {worktree_path}"
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_branch_missing(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "does not exist" in result.output
    assert "-b/--new" in result.output
    assert fakes.clipboard.copy_calls == 0


def test_slot_checkout_pool_full(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/a", "feat/b", "feat/c"),
        pool_worktrees=(
            _assigned_slot(tmp_path / "slots", 1, "feat/a"),
            _assigned_slot(tmp_path / "slots", 2, "feat/b"),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/c"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "Pool is full" in result.output
    assert "slot-01 -> feat/a" in result.output
    assert "slot-02 -> feat/b" in result.output
    assert "Free a slot before checking out a new branch." in result.output
    assert fakes.clipboard.copy_calls == 0
    # No new allocations occurred.
    assert fakes.git._add_worktree_calls == []
    assert fakes.git._checkout_calls == []


def test_slot_checkout_already_assigned_reuses(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_assigned_slot(tmp_path / "slots", 1, "feat/x"),),
    )
    worktrees_before = fakes.git.list_worktrees()

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "already assigned" in result.output
    assert fakes.git.list_worktrees() == worktrees_before
    assert fakes.git._checkout_calls == []
    worktree_path = _slot_path(fakes.slots_root, "slot-01")
    assert fakes.clipboard.last_copied == f"cd {worktree_path}"


# -- checkout -b/--new ------------------------------------------------------


def test_slot_checkout_b_creates_branch_and_assigns(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "-b"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "Checked out" in result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    assert ("feat/x", "HEAD", False) in fakes.git._create_branch_calls
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_new_long_form(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/y", "--new"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert ("feat/y", "HEAD", False) in fakes.git._create_branch_calls
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/y")


def test_slot_checkout_b_on_existing_branch_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "-b"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "already exists" in result.output
    assert fakes.git._create_branch_calls == []
    assert fakes.git._checkout_calls == []
    assert fakes.clipboard.copy_calls == 0


def test_slot_checkout_b_with_base_creates_from_base(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("main",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "main", "-b"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert ("feat/x", "main", False) in fakes.git._create_branch_calls
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_b_with_missing_base_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "nonexistent", "-b"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "Base branch 'nonexistent' does not exist" in result.output
    assert fakes.git._create_branch_calls == []


def test_slot_checkout_base_without_new_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "main"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "only valid with -b/--new" in result.output


def test_slot_checkout_b_mutually_exclusive_with_current(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current", "-b"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "-b/--new cannot be combined with --current" in result.output
    assert fakes.git._create_branch_calls == []


def test_slot_checkout_dirty_available_slot_skipped(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    slot_01 = _slot_path(slots_root, "slot-01")
    slot_02 = _slot_path(slots_root, "slot-02")
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(
            _detached_slot(slots_root, 1),
            _detached_slot(slots_root, 2),
        ),
        file_status_by_path={slot_01: FileStatus(False, True, False)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "slot-02" in result.output
    # slot-01 was skipped despite being lower-numbered.
    assert (slot_02, "feat/x") in fakes.git._checkout_calls
    assert (slot_01, "feat/x") not in fakes.git._checkout_calls


# -- checkout --current -----------------------------------------------------


def test_slot_checkout_current_uses_previous_branch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "some-other-feat"),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        main_branch="feat/x",
        previous_branch_by_path={(tmp_path / "repo").resolve(): "some-other-feat"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    assert fakes.git.get_current_branch(fakes.repo_root) == "some-other-feat"
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_current_falls_back_to_trunk_when_no_previous(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        main_branch="feat/x",
        trunk_branch="main",
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git.get_current_branch(fakes.repo_root) == "main"
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_current_falls_back_to_trunk_when_previous_missing(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        main_branch="feat/x",
        previous_branch_by_path={(tmp_path / "repo").resolve(): "deleted-branch"},
        trunk_branch="main",
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git.get_current_branch(fakes.repo_root) == "main"
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_current_detaches_when_trunk_checked_out_elsewhere(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    sibling_wt = WorktreeInfo(path=tmp_path / "sibling", branch="main", is_bare=False)
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        extra_worktrees=(sibling_wt,),
        main_branch="feat/x",
        trunk_branch="main",
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git.get_current_branch(fakes.repo_root) == DetachedHead()
    assert "checked out" in result.output
    assert "detached HEAD" in result.output
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


def test_slot_checkout_current_recovers_orphaned_slot_wt(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """A slot worktree already on a real branch is reused as-is by `slot
    checkout --current` when invoked from inside it: the inventory already
    sees it as assigned, so the planner short-circuits via the already-in-slot
    branch — no detach, no churn."""
    slots_root = tmp_path / "slots"
    slot_01_path = _slot_path(slots_root, "slot-01")
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/child", "main"),
        pool_worktrees=(_assigned_slot(slots_root, 1, "feat/child"),),
        trunk_branch="main",
        repository_root_by_cwd={Path.cwd().resolve(): slot_01_path},
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/child")
    assert fakes.git._detach_head_calls == []


def test_slot_checkout_current_rejects_detached_head(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("main",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        current_branch_by_path={(tmp_path / "repo").resolve(): DetachedHead()},
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "detached" in result.output.lower()
    assert fakes.git._checkout_calls == []


def test_slot_checkout_current_surfaces_git_failure_as_slot_allocation_error(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("main",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        current_branch_by_path={
            (tmp_path / "repo").resolve(): GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "Failed to determine current branch" in result.output
    assert "not a git repository" in result.output


def test_slot_checkout_current_rejects_dirty_worktree(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    repo_root = (tmp_path / "repo").resolve()
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        main_branch="feat/x",
        trunk_branch="main",
        file_status_by_path={
            repo_root: FileStatus(staged=False, modified=True, untracked=False),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "uncommitted" in result.output
    assert fakes.git.get_current_branch(repo_root) == "feat/x"
    assert fakes.git._checkout_calls == []


def test_slot_checkout_current_branch_already_in_slot_is_reuse(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_assigned_slot(slots_root, 1, "feat/x"),),
        main_branch="feat/x",
    )
    worktrees_before = fakes.git.list_worktrees()
    repo_branch_before = fakes.git.get_current_branch(fakes.repo_root)

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "already assigned" in result.output
    assert fakes.git.list_worktrees() == worktrees_before
    assert fakes.git.get_current_branch(fakes.repo_root) == repo_branch_before


def test_slot_checkout_current_pool_full(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    """`slot checkout --current` with a fully-assigned pool surfaces
    pool-full with the new assigned-pairs message format."""
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "feat/a", "main"),
        pool_worktrees=(_assigned_slot(slots_root, 1, "feat/a"),),
        main_branch="feat/x",
        trunk_branch="main",
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "Pool is full" in result.output
    assert "slot-01 -> feat/a" in result.output


def test_slot_checkout_rejects_both_branch_and_current(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "--current"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "exactly one" in result.output


def test_slot_checkout_rejects_neither_branch_nor_current(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 2
    assert "BRANCH_NAME" in result.output or "--current" in result.output


def test_slot_checkout_format_json_returns_exit_envelope(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "--format", "json"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slot_name"] == "slot-01"
    assert data["branch_name"] == "feat/x"
    assert data["already_assigned"] is False


def test_slot_checkout_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["checkout", "--schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_schema", "output_schema"}


# -- clipboard behavior -----------------------------------------------------


def test_slot_checkout_no_clipboard_flag_skips_copy(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "--no-clipboard"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    worktree_path = _slot_path(fakes.slots_root, "slot-01")
    assert f"cd {worktree_path}" in result.output
    assert "Copied cd command" not in result.output
    assert "Clipboard unavailable" not in result.output
    assert fakes.clipboard.copy_calls == 0


def test_slot_checkout_clipboard_failure_warns_but_succeeds(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        clipboard_should_succeed=False,
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    worktree_path = _slot_path(fakes.slots_root, "slot-01")
    assert f"cd {worktree_path}" in result.output
    assert "Clipboard unavailable" in result.output
    assert fakes.clipboard.copy_calls == 1
    assert fakes.clipboard.last_copied is None


def test_slot_checkout_branch_in_main_worktree_redirects(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """`slot co master` from a slot worktree, when master is held by the main
    repo worktree, should redirect to that worktree instead of crashing."""
    repo_root = (tmp_path / "repo").resolve()
    fakes = _fake_for_repo(
        tmp_path,
        branches=("master",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
        main_branch="master",
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "master"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "already checked out" in result.output
    assert "main worktree" in result.output
    assert str(repo_root) in result.output
    assert f"cd {repo_root}" in result.output
    assert fakes.clipboard.last_copied == f"cd {repo_root}"
    # No checkout into the slot occurred.
    assert fakes.git._checkout_calls == []
    assert fakes.git._add_worktree_calls == []


def test_slot_co_alias(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["co", "feat/x"],
        obj=_make_obj(fakes),
    )

    assert result.exit_code == 0, result.output
    assert "Checked out" in result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    _assert_assigned_slot_state(fakes, slot_name="slot-01", branch_name="feat/x")


# -- --format json + --schema -----------------------------------------------


def test_slot_checkout_format_json_ok_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "--format", "json", "--no-clipboard"],
        obj=_make_obj(fakes),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slot_name"] == "slot-01"
    assert data["branch_name"] == "feat/x"
    assert "slot-01" in data["worktree_path"]


def test_slot_checkout_format_json_failure_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        pool_worktrees=(_detached_slot(tmp_path / "slots", 1),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x", "--format", "json"],
        obj=_make_obj(fakes),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "branch_missing"
    assert "does not exist" in payload["message"]


def test_slot_checkout_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["checkout", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema"}
