from __future__ import annotations

import json
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
    WorktreeOccupancy,
)
from asdl_slots.cli.main import build_cli
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel
from asdl_slots.shell_integration import SLOT_CD_DIRECTIVE_FILE


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
    operations_by_path: dict[Path, WorktreeOccupancy] | None = None,
    extra_existing: Iterable[Path] = (),
    clipboard_should_succeed: bool = True,
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
        operations_by_path=operations_by_path,
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        clipboard=FakeClipboardGateway(should_succeed=clipboard_should_succeed),
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
) -> dict[str, Path]:
    """Seed a managed slot pool of size ``pool_size`` into the FakeGitGateway.

    Each entry in ``assignments`` becomes an assigned slot worktree (branch
    set). Remaining slots up to ``pool_size`` are seeded as detached
    worktrees (branch ``None``) so ``inventory.pool_size`` matches.
    """
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
) -> Path:
    """Seed pool worktrees so ``slot_name`` holds ``branch``. Returns worktree path."""
    return _seed_pool(
        fakes,
        slots_root,
        assignments=((slot_name, branch),),
        pool_size=pool_size,
    )[slot_name]


# -- help / shape -----------------------------------------------------------


def test_slot_goto_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["goto", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot goto" in result.output
    assert "cd command" in result.output
    assert "-n" in result.output
    assert "--num" in result.output
    assert "-w" in result.output
    assert "--wt" in result.output
    assert "--no-clipboard" in result.output
    assert "--format" in result.output
    assert "--json-schema" in result.output


def test_slot_goto_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "goto" in result.output


# -- happy paths ------------------------------------------------------------


def test_slot_goto_by_slot_name(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "feat/x" in result.output
    assert f"cd {worktree_path}" in result.output
    assert "Copied cd command to clipboard." in result.output
    assert fakes.clipboard.last_copied == f"cd {worktree_path}"
    assert directive_path.read_text(encoding="utf-8") == str(worktree_path)


def test_slot_goto_by_slot_number_short_flag(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, slot_name="slot-03", branch="feat/three")

    result = CliRunner().invoke(
        cli_group,
        ["goto", "-n", "3"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-03" in result.output
    assert "feat/three" in result.output
    assert f"cd {worktree_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {worktree_path}"


def test_slot_goto_by_slot_name_short_flag(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "-w", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert f"cd {worktree_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {worktree_path}"


def test_slot_goto_no_clipboard_flag_skips_copy(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01", "--no-clipboard"],
        obj=_make_obj(fakes, slots_root),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.exit_code == 0, result.output
    assert f"cd {worktree_path}" in result.output
    assert "Copied cd command" not in result.output
    assert "Clipboard unavailable" not in result.output
    assert fakes.clipboard.copy_calls == 0
    assert directive_path.read_text(encoding="utf-8") == str(worktree_path)


def test_slot_goto_detached_slot_with_rebase_occupancy_is_navigable(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    slots_root = tmp_path / "slots"
    slot_path = _slot_path(slots_root, "slot-07")
    branch_name = "mirror-asdl-dev-submit-into-pi"
    fakes = _fake_for_repo(
        tmp_path,
        operations_by_path={
            slot_path: WorktreeOccupancy(
                path=slot_path,
                branch=branch_name,
                operation="rebase",
            ),
        },
    )
    _seed_pool(fakes, slots_root, assignments=(), pool_size=7)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "-n", "7"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "slot-07" in result.output
    assert branch_name in result.output
    assert "rebase in progress" in result.output
    assert f"cd {slot_path}" in result.output
    assert fakes.clipboard.last_copied == f"cd {slot_path}"


def test_slot_goto_clipboard_failure_warns_but_succeeds(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path, clipboard_should_succeed=False)
    worktree_path = _seed_assigned(fakes, slots_root)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert f"cd {worktree_path}" in result.output
    assert "Clipboard unavailable" in result.output
    assert fakes.clipboard.copy_calls == 1
    assert fakes.clipboard.last_copied is None


# -- machine mode -----------------------------------------------------------


def test_slot_goto_format_json_returns_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slot_name"] == "slot-01"
    assert data["branch_name"] == "feat/x"
    assert data["operation"] is None
    assert data["worktree_path"] == str(worktree_path)
    assert data["cd_command"] == f"cd {worktree_path}"
    assert data["clipboard_copied"] is True
    assert data["clipboard_skipped"] is False
    assert data["clipboard_failure_reason"] is None
    assert data["clipboard_failure_detail"] is None
    assert not directive_path.exists()


def test_slot_goto_format_json_reports_rebase_occupancy(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    slots_root = tmp_path / "slots"
    slot_path = _slot_path(slots_root, "slot-07")
    branch_name = "mirror-asdl-dev-submit-into-pi"
    fakes = _fake_for_repo(
        tmp_path,
        operations_by_path={
            slot_path: WorktreeOccupancy(
                path=slot_path,
                branch=branch_name,
                operation="rebase",
            ),
        },
    )
    _seed_pool(fakes, slots_root, assignments=(), pool_size=7)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-07", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["slot_name"] == "slot-07"
    assert data["branch_name"] == branch_name
    assert data["operation"] == "rebase"
    assert data["worktree_path"] == str(slot_path)
    assert data["cd_command"] == f"cd {slot_path}"


def test_slot_goto_schema(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--json-schema"],
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_json_schema", "output_json_schema"}
    assert not directive_path.exists()


# -- error paths ------------------------------------------------------------


def test_slot_goto_slot_not_assigned_is_negative(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # Pool exists (4 detached slots) but slot-02 is unassigned.
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-02"],
        obj=_make_obj(fakes, slots_root),
    )

    # Unassigned slot is a "ran fine, answered no" outcome → exit 1.
    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.startswith("slot-02 is not currently assigned")


def test_slot_goto_invalid_slot_num_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--num", "99"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "must be in 1..4" in result.output


def test_slot_goto_invalid_slot_wt_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "bogus"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "not a valid slot name" in result.output


def test_slot_goto_missing_flag_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["goto"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "-n/--num or -w/--wt" in result.output


def test_slot_goto_conflicting_flags_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--num", "1", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "not both" in result.output


def test_slot_goto_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    # No managed slot worktrees seeded — inventory.pool_size == 0.

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "No managed slots configured" in result.output
    assert "slot init" in result.output


def test_slot_goto_worktree_missing_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    # Inventory still reports the assignment (worktree present in git's view) but
    # the directory is gone from disk.
    fakes.storage._existing_paths.discard(worktree_path)

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "missing" in result.output
    assert "slot-01" in result.output


def test_slot_goto_not_in_repo_errors(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01"],
        obj=build_clinkr_context_object(lambda: sentinel),
    )

    assert result.exit_code == 2
    assert "Not inside a git repository" in result.output


# -- --format json + --json-schema -----------------------------------------------


def test_slot_goto_format_json_ok_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root)
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-01", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slot_name"] == "slot-01"
    assert data["branch_name"] == "feat/x"
    assert data["operation"] is None
    assert data["worktree_path"] == str(worktree_path)
    assert data["cd_command"] == f"cd {worktree_path}"
    assert data["clipboard_copied"] is True
    assert data["clipboard_skipped"] is False
    assert data["clipboard_failure_reason"] is None
    assert data["clipboard_failure_detail"] is None
    assert not directive_path.exists()


def test_slot_goto_format_json_negative_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, slots_root, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--wt", "slot-02", "--format", "json"],
        obj=_make_obj(fakes, slots_root),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 1
    assert payload["exit_code"] == 1
    assert "not currently assigned" in payload["message"]


def test_slot_goto_json_schema_flag_is_eager(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    directive_path = tmp_path / "cd-directive"

    result = CliRunner().invoke(
        cli_group,
        ["goto", "--json-schema"],
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert set(payload) == {"input_json_schema", "output_json_schema"}
    assert not directive_path.exists()
