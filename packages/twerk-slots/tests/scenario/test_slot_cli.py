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
    previous_branch_by_path: dict[Path, str | None] | None = None,
    trunk_branch: str | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
    repository_root_by_cwd: dict[Path, Path] | None = None,
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = tmp_path / "slots" / "repos" / "repo" / "pool.json"
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *extra_existing},
    )
    root_map = (
        dict(repository_root_by_cwd)
        if repository_root_by_cwd is not None
        else {Path.cwd().resolve(): repo_root}
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        previous_branch_by_path=previous_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd=root_map,
        storage=storage,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        repo_root=repo_root,
    )


def _json_output(text: str) -> dict[str, object]:
    return json.loads(text)


# -- help / shape -----------------------------------------------------------


def test_slot_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: slot" in result.output
    assert "Manage worktree pool slots." in result.output
    assert "--version" in result.output
    assert "list" in result.output
    assert "assign" in result.output
    assert "free" in result.output
    assert "json" in result.output


def test_slot_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot list" in result.output
    assert "List worktree pool slots." in result.output


def test_slot_assign_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["assign", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot assign" in result.output
    assert "BRANCH_NAME" in result.output
    assert "--force" in result.output
    assert "--current" in result.output


def test_slot_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


# -- list -------------------------------------------------------------------


def test_slot_list_empty_pool(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "slot-16" in result.output
    assert "unallocated" in result.output


def test_slot_list_with_assignment(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    # First assign to seed pool state, then list.
    CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(fakes, slots_root),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "feat/x" in result.output
    assert "assigned" in result.output


def test_slot_list_available_after_free(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    assign_res = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )
    assert assign_res.exit_code == 0, assign_res.output

    free_res = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )
    assert free_res.exit_code == 0, free_res.output

    json_res = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=_make_obj(fakes, slots_root),
    )
    payload = _json_output(json_res.output)

    assert json_res.exit_code == 0
    slot_01 = next(r for r in payload["rows"] if r["slot_name"] == "slot-01")
    assert slot_01["status"] == "available"
    assert slot_01["branch"] is None
    assert slot_01["worktree_path"] is not None
    assert "slot-01" in slot_01["worktree_path"]
    # Other slots remain unallocated (no worktree on disk).
    unallocated = [r for r in payload["rows"] if r["status"] == "unallocated"]
    assert len(unallocated) == 15


def test_slot_ls_alias(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)

    list_res = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )
    alias_res = CliRunner().invoke(
        cli_group,
        ["ls"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert list_res.exit_code == 0
    assert alias_res.exit_code == 0
    assert alias_res.output == list_res.output


def test_slot_json_list_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "list", "--schema"])
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


def test_slot_json_list_returns_rows(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    CliRunner().invoke(cli_group, ["assign", "feat/x"], obj=_make_obj(fakes, slots_root))

    result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=_make_obj(fakes, slots_root),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert payload["success"] is True
    assert payload["pool_size"] == 16
    assert payload["repo_name"] == "repo"
    assigned_rows = [r for r in payload["rows"] if r["status"] == "assigned"]
    assert len(assigned_rows) == 1
    assert assigned_rows[0]["branch"] == "feat/x"
    unallocated_rows = [r for r in payload["rows"] if r["status"] == "unallocated"]
    assert len(unallocated_rows) == 15


def test_slot_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)


# -- assign -----------------------------------------------------------------


def test_slot_assign_new_branch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    assert str(slots_root / "repos" / "repo" / "worktrees" / "slot-01") in result.output
    assert len(fakes.git._add_worktree_calls) == 1


def test_slot_assign_branch_missing(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)  # no branches seeded

    result = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 1
    assert "does not exist" in result.output


def test_slot_assign_pool_full_no_force(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    from twerk_slots.pool_state import PoolState, SlotAssignment

    slots_root = tmp_path / "slots"
    repo_dir = slots_root / "repos" / "repo"
    worktrees_dir = repo_dir / "worktrees"
    slot_01 = worktrees_dir / "slot-01"
    slot_02 = worktrees_dir / "slot-02"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/a", "feat/b", "feat/c"),
        extra_existing=(slot_01, slot_02),
    )
    fakes.pool_state.save(
        PoolState(
            pool_size=2,
            assignments=(
                SlotAssignment("slot-01", "feat/a", "2026-01-01T00:00:00+00:00", slot_01),
                SlotAssignment("slot-02", "feat/b", "2026-02-01T00:00:00+00:00", slot_02),
            ),
        ),
    )
    # Seed git with the two worktrees holding the recorded branches.
    fakes.git._worktrees = [
        WorktreeInfo(path=slot_01, branch="feat/a", is_bare=False),
        WorktreeInfo(path=slot_02, branch="feat/b", is_bare=False),
    ]
    fakes.git._current_branch_by_path = {slot_01: "feat/a", slot_02: "feat/b"}

    result = CliRunner().invoke(
        cli_group,
        ["assign", "feat/c"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "Pool is full" in result.output
    assert "slot-01" in result.output


def test_slot_assign_pool_full_with_force_evicts_oldest(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    from twerk_slots.pool_state import PoolState, SlotAssignment

    slots_root = tmp_path / "slots"
    repo_dir = slots_root / "repos" / "repo"
    worktrees_dir = repo_dir / "worktrees"
    slot_01 = worktrees_dir / "slot-01"
    slot_02 = worktrees_dir / "slot-02"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/a", "feat/b", "feat/c"),
        extra_existing=(slot_01, slot_02),
    )
    fakes.pool_state.save(
        PoolState(
            pool_size=2,
            assignments=(
                SlotAssignment("slot-01", "feat/a", "2026-01-01T00:00:00+00:00", slot_01),
                SlotAssignment("slot-02", "feat/b", "2026-02-01T00:00:00+00:00", slot_02),
            ),
        ),
    )
    fakes.git._worktrees = [
        WorktreeInfo(path=slot_01, branch="feat/a", is_bare=False),
        WorktreeInfo(path=slot_02, branch="feat/b", is_bare=False),
    ]
    fakes.git._current_branch_by_path = {slot_01: "feat/a", slot_02: "feat/b"}

    result = CliRunner().invoke(
        cli_group,
        ["assign", "feat/c", "--force"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "Evicted slot-01" in result.output
    assert "feat/c" in result.output
    # Reuses slot-01's worktree via checkout, not add_worktree.
    assert fakes.git._checkout_calls == [(slot_01, "feat/c")]


def test_slot_assign_already_assigned_reuses(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    first = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )
    assert first.exit_code == 0, first.output

    second = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )

    assert second.exit_code == 0, second.output
    assert "already assigned" in second.output
    # Only one add_worktree call across both invocations.
    assert len(fakes.git._add_worktree_calls) == 1


# -- assign --current -------------------------------------------------------


def test_slot_assign_current_uses_previous_branch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "some-other-feat"),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/x"},
        previous_branch_by_path={(tmp_path / "repo").resolve(): "some-other-feat"},
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    assert fakes.git._checkout_calls[0] == (fakes.repo_root, "some-other-feat")
    assert len(fakes.git._add_worktree_calls) == 1
    _, wt_path, branch, _create = fakes.git._add_worktree_calls[0]
    assert branch == "feat/x"
    assert wt_path.name == "slot-01"


def test_slot_assign_current_falls_back_to_trunk_when_no_previous(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/x"},
        trunk_branch="main",
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git._checkout_calls[0] == (fakes.repo_root, "main")
    assert fakes.git._detach_head_calls == []
    assert len(fakes.git._add_worktree_calls) == 1


def test_slot_assign_current_falls_back_to_trunk_when_previous_missing(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/x"},
        previous_branch_by_path={(tmp_path / "repo").resolve(): "deleted-branch"},
        trunk_branch="main",
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git._checkout_calls[0] == (fakes.repo_root, "main")


def test_slot_assign_current_detaches_when_trunk_checked_out_elsewhere(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    sibling_wt = tmp_path / "sibling"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        worktrees=(WorktreeInfo(path=sibling_wt, branch="main", is_bare=False),),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/x"},
        trunk_branch="main",
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git._detach_head_calls == [(fakes.repo_root, "feat/x")]
    assert "checked out" in result.output
    assert "detached HEAD" in result.output
    assert len(fakes.git._add_worktree_calls) == 1


def test_slot_assign_current_detaches_when_no_trunk_resolvable(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/x"},
        trunk_branch=None,
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert fakes.git._detach_head_calls == [(fakes.repo_root, "feat/x")]
    assert "No trunk branch" in result.output


def test_slot_assign_current_from_slot_wt_uses_slot_stub(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    slots_root = tmp_path / "slots"
    slot_01_path = slots_root / "repos" / "repo" / "worktrees" / "slot-01"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/child",),
        worktrees=(WorktreeInfo(path=slot_01_path, branch="feat/child", is_bare=False),),
        current_branch_by_path={slot_01_path: "feat/child"},
        extra_existing=(slot_01_path,),
        repository_root_by_cwd={Path.cwd().resolve(): slot_01_path},
    )

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert ("__slot-01-br-stub__", "feat/child", False) in fakes.git._create_branch_calls
    assert fakes.git._checkout_calls[0] == (slot_01_path, "__slot-01-br-stub__")
    assert fakes.git._detach_head_calls == []


def test_slot_assign_current_from_slot_wt_stub_force_when_exists(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    slots_root = tmp_path / "slots"
    slot_01_path = slots_root / "repos" / "repo" / "worktrees" / "slot-01"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/child", "__slot-01-br-stub__"),
        worktrees=(WorktreeInfo(path=slot_01_path, branch="feat/child", is_bare=False),),
        current_branch_by_path={slot_01_path: "feat/child"},
        extra_existing=(slot_01_path,),
        repository_root_by_cwd={Path.cwd().resolve(): slot_01_path},
    )

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert ("__slot-01-br-stub__", "feat/child", True) in fakes.git._create_branch_calls


def test_slot_assign_current_rejects_detached_head(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("main",),
        current_branch_by_path={(tmp_path / "repo").resolve(): None},
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "detached" in result.output.lower()
    assert fakes.git._add_worktree_calls == []


def test_slot_assign_current_rejects_dirty_worktree(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = (tmp_path / "repo").resolve()
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x", "main"),
        current_branch_by_path={repo_root: "feat/x"},
        trunk_branch="main",
        file_status_by_path={
            repo_root: FileStatus(staged=False, modified=True, untracked=False),
        },
    )
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "uncommitted" in result.output
    assert fakes.git._add_worktree_calls == []
    assert fakes.git._checkout_calls == []
    assert fakes.git._detach_head_calls == []


def test_slot_assign_current_branch_already_in_slot_is_reuse(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        current_branch_by_path={(tmp_path / "repo").resolve(): "feat/x"},
    )
    slots_root = tmp_path / "slots"

    first = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )
    assert first.exit_code == 0, first.output
    checkouts_before = list(fakes.git._checkout_calls)
    add_worktrees_before = list(fakes.git._add_worktree_calls)

    second = CliRunner().invoke(
        cli_group,
        ["assign", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert second.exit_code == 0, second.output
    assert "already assigned" in second.output
    assert fakes.git._checkout_calls == checkouts_before
    assert fakes.git._add_worktree_calls == add_worktrees_before
    assert fakes.git._detach_head_calls == []


def test_slot_assign_rejects_both_branch_and_current(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign", "feat/x", "--current"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "not both" in result.output


def test_slot_assign_rejects_neither_branch_nor_current(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path)
    slots_root = tmp_path / "slots"

    result = CliRunner().invoke(
        cli_group,
        ["assign"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 1
    assert "BRANCH_NAME" in result.output or "--current" in result.output


# -- real-gateway fallback --------------------------------------------------


def test_slot_list_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Simulate a CWD that git says is not a repo — we expect a not_in_repo
    # error, which confirms the real gateway is actually invoked when no
    # fake is injected.
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["list"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
