from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from asdl_slots.cli.main import build_cli
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    clipboard: FakeClipboardGateway
    repo_root: Path


def _make_obj(fakes: _SlotFakes, slots_root: Path) -> ClinkrContextObject:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    ctx = SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
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
        clipboard=FakeClipboardGateway(),
        repo_root=repo_root,
    )


def _slot_path(slots_root: Path, slot_name: str) -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / slot_name


def _seed_pool(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    assignments: tuple[tuple[str, str], ...],
    pool_size: int = 4,
    file_status_by_slot: dict[str, FileStatus] | None = None,
) -> dict[str, Path]:
    """Seed a managed slot pool of size ``pool_size`` into the FakeGitGateway.

    Each entry in ``assignments`` becomes an assigned slot worktree (branch
    set). Remaining slots up to ``pool_size`` are seeded as detached
    worktrees (branch ``None``) so ``inventory.pool_size`` matches.

    Returns a dict mapping every assigned slot name to its worktree path.
    """
    file_status_by_slot = file_status_by_slot or {}
    assigned_branch_by_slot = {slot_name: branch for slot_name, branch in assignments}
    paths: dict[str, Path] = {}

    for slot_num in range(1, pool_size + 1):
        slot_name = f"slot-{slot_num:02d}"
        worktree_path = _slot_path(slots_root, slot_name)
        fakes.storage._existing_paths.add(worktree_path)
        fakes.git._existing_paths.add(worktree_path)
        if slot_name in assigned_branch_by_slot:
            branch = assigned_branch_by_slot[slot_name]
            fakes.git._branches.add(branch)
            fakes.git._worktrees.append(
                WorktreeInfo(path=worktree_path, branch=branch, is_bare=False),
            )
            fakes.git._current_branch_by_path[worktree_path] = branch
            if slot_name in file_status_by_slot:
                fakes.git._file_status_by_path[worktree_path] = file_status_by_slot[slot_name]
            paths[slot_name] = worktree_path
        else:
            fakes.git._worktrees.append(
                WorktreeInfo(path=worktree_path, branch=None, is_bare=False),
            )
    return paths


def _seed_assigned(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    slot_name: str = "slot-01",
    branch: str = "feat/x",
    pool_size: int = 4,
    file_status: FileStatus | None = None,
) -> Path:
    """Backwards-compatible single-slot helper used by simple happy-path tests."""
    return _seed_pool(
        fakes,
        slots_root,
        assignments=((slot_name, branch),),
        pool_size=pool_size,
        file_status_by_slot={slot_name: file_status} if file_status is not None else None,
    )[slot_name]


def _assigned_worktrees(fakes: _SlotFakes) -> dict[str, str]:
    """Return slot_name -> branch for every still-assigned managed worktree."""
    return {
        wt.path.name: wt.branch
        for wt in fakes.git.list_worktrees()
        if wt.path.name.startswith("slot-") and wt.branch is not None
    }


# -- help / shape -----------------------------------------------------------


def test_slot_free_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["free", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot free" in result.output
    assert "Detach one or more assigned managed slots at trunk" in result.output
    assert "--format" in result.output
    assert "--schema" in result.output
    # Short flags advertised in help.
    assert "-n" in result.output
    assert "-w" in result.output
    assert "-b" in result.output
    assert "--branch" in result.output
    assert "-c" in result.output


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
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    assert _assigned_worktrees(fakes) == {}


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


def test_slot_free_short_flag_n(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, slot_name="slot-02", branch="feat/two")

    result = CliRunner().invoke(
        cli_group,
        ["free", "-n", "2"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-02" in result.output
    assert "feat/two" in result.output


def test_slot_free_short_flag_w(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["free", "-w", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output


def test_slot_free_by_branch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, slot_name="slot-02", branch="feat/y")

    result = CliRunner().invoke(
        cli_group,
        ["free", "--branch", "feat/y"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Freed" in result.output
    assert "slot-02" in result.output
    assert "feat/y" in result.output
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    assert _assigned_worktrees(fakes) == {}


def test_slot_free_short_flag_b(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, slot_name="slot-03", branch="feat/z")

    result = CliRunner().invoke(
        cli_group,
        ["free", "-b", "feat/z"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-03" in result.output
    assert "feat/z" in result.output


def test_slot_free_branch_not_in_slot_is_noop(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=(("slot-01", "feat/x"),))

    result = CliRunner().invoke(
        cli_group,
        ["free", "--branch", "feat/missing"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "not checked out in a managed slot" in result.output
    assert "feat/missing" in result.output
    assert fakes.git._detach_head_calls == []
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/x"}


def test_slot_free_branch_in_main_worktree_is_noop(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=(("slot-01", "feat/x"),))
    fakes.git._worktrees.append(
        WorktreeInfo(path=fakes.repo_root, branch="feat/main", is_bare=False),
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "--branch", "feat/main"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "main worktree" in result.output
    assert "feat/main" in result.output
    assert fakes.git._detach_head_calls == []
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/x"}


def test_slot_free_branch_noop_is_in_json_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["free", "--branch", "feat/missing", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"]["freed"] == []
    assert payload["data"]["skipped"] == [
        "Branch feat/missing is not checked out in a managed slot; nothing to free."
    ]


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
    assert _assigned_worktrees(fakes) == {}


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

    assert result.exit_code == 2
    assert "not a slot directory" in result.output


# -- batch / multi-target happy paths --------------------------------------


def test_slot_free_multi_num_frees_all_in_order(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    paths = _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/a"), ("slot-02", "feat/b"), ("slot-03", "feat/c")),
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "-n", "3", "-n", "1", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    freed = payload["data"]["freed"]
    assert [f["slot_name"] for f in freed] == ["slot-03", "slot-01"]
    assert [f["branch_name"] for f in freed] == ["feat/c", "feat/a"]
    # Detach order matches resolved order.
    assert fakes.git._detach_head_calls == [
        (paths["slot-03"], "main"),
        (paths["slot-01"], "main"),
    ]
    assert _assigned_worktrees(fakes) == {"slot-02": "feat/b"}


def test_slot_free_current_combined_with_num(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    paths = _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/x"), ("slot-02", "feat/y")),
    )
    fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = paths["slot-01"]

    result = CliRunner().invoke(
        cli_group,
        ["free", "--num", "2", "--current", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    # Order: --num before --current.
    assert [f["slot_name"] for f in payload["data"]["freed"]] == ["slot-02", "slot-01"]
    assert _assigned_worktrees(fakes) == {}


def test_slot_free_current_combined_with_wt(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    paths = _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/x"), ("slot-02", "feat/y")),
    )
    fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = paths["slot-02"]

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01", "--current", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert [f["slot_name"] for f in payload["data"]["freed"]] == ["slot-01", "slot-02"]


def test_slot_free_dedupes_repeated_targets(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    paths = _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/x"), ("slot-02", "feat/y")),
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "-n", "1", "-n", "1", "-w", "slot-01", "-w", "slot-02", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert [f["slot_name"] for f in payload["data"]["freed"]] == ["slot-01", "slot-02"]
    # Detach was called once per resolved target, not per flag occurrence.
    assert fakes.git._detach_head_calls == [
        (paths["slot-01"], "main"),
        (paths["slot-02"], "main"),
    ]


def test_slot_free_combined_flags_were_legal_now_succeeds(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """Previously `--num` + `--wt` was a hard error; now it's a multi-target batch."""
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/a"), ("slot-02", "feat/b")),
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "--num", "2", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "slot-02" in result.output


# -- machine mode -----------------------------------------------------------


def test_slot_free_format_json_returns_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    freed = payload["data"]["freed"]
    assert len(freed) == 1
    assert freed[0]["slot_name"] == "slot-01"
    assert freed[0]["branch_name"] == "feat/x"
    assert "placeholder_branch" not in freed[0]


def test_slot_free_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["free", "--schema"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema"}


# -- error paths ------------------------------------------------------------


def test_slot_free_unknown_slot_is_failure(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-02"],
        obj=_make_obj(fakes, slots_root),
    )

    # Pre-flight catches "not assigned" → exit 2 (input error), not exit 1.
    assert result.exit_code == 2
    assert result.stdout == ""
    assert "slot-02 is not currently assigned" in result.stderr


def test_slot_free_current_unassigned_is_failure(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=(("slot-01", "feat/x"),))
    slot_02_path = _slot_path(slots_root, "slot-02")
    fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = slot_02_path

    result = CliRunner().invoke(
        cli_group,
        ["free", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert result.stdout == ""
    assert "slot-02 is not currently assigned" in result.stderr


def test_slot_free_invalid_slot_num_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["free", "--num", "99"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "must be in 1..4" in result.output


def test_slot_free_invalid_slot_wt_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "bogus"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "not a valid slot name" in result.output


def test_slot_free_missing_flag_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["free"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    # Message advertises every selector form, including the new short flags.
    assert "-n/--num" in result.output
    assert "-w/--wt" in result.output
    assert "-b/--branch" in result.output
    assert "-c/--current" in result.output


def test_slot_free_combined_errors_are_collected(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/x"),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "--num", "99", "--wt", "slot-02", "--wt", "bogus"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    # Each problem surfaces in the same message — no fail-fast on first error.
    assert "must be in 1..4" in result.output
    assert "slot-02 is not currently assigned" in result.output
    assert "not a valid slot name" in result.output
    # Nothing was freed.
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/x"}
    assert fakes.git._detach_head_calls == []


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

    assert result.exit_code == 2
    assert "uncommitted changes" in result.output
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/x"}


def test_slot_free_dirty_in_batch_blocks_clean_targets(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """Pre-flight fails fast as a unit: even clean targets aren't freed."""
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/a"), ("slot-02", "feat/b")),
        file_status_by_slot={"slot-02": FileStatus(staged=False, modified=True, untracked=False)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["free", "-n", "1", "-n", "2"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "uncommitted changes" in result.output
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/a", "slot-02": "feat/b"}
    assert fakes.git._detach_head_calls == []


def test_slot_free_surfaces_detach_head_failure_as_slot_allocation_error(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

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

    assert result.exit_code == 2
    assert "Failed to detach" in result.output
    assert "reference is not a tree" in result.output
    # Detach raised before mutating; assignment is intact.
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/x"}


def test_slot_free_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # No managed slot worktrees seeded — inventory.pool_size == 0.

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "No managed slots configured" in result.output
    assert "slot init" in result.output


def test_slot_free_not_in_repo_errors(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=build_clinkr_context_object(lambda: sentinel),
    )

    assert result.exit_code == 2
    assert "Not inside a git repository" in result.output


# -- --format json + --schema -----------------------------------------------


def test_slot_free_format_json_ok_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert payload["exit_code"] == 0
    freed = payload["data"]["freed"]
    assert len(freed) == 1
    assert freed[0]["slot_name"] == "slot-01"
    assert freed[0]["branch_name"] == "feat/x"


def test_slot_free_format_json_failure_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-02", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )
    payload = json.loads(result.stdout)

    # `not assigned` is now a pre-flight failure (exit 2) for uniform batch semantics.
    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "invalid_slot_args"
    assert "not currently assigned" in payload["message"]


def test_slot_free_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["free", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema"}
