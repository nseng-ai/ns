from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead, FileStatus, WorktreeInfo
from twerk_core.gt.testing import FakeGtGateway
from twerk_core.gt.types import GtCommandFailure, StackInfo
from twerk_slots.cli.main import build_cli
from twerk_slots.cli.slot.gt.context import SlotGtContext
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing.clipboard import FakeClipboardGateway
from twerk_slots.gateway.testing.pool_state import FakePoolStateGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _StackFakes:
    ctx: SlotGtContext
    git: FakeGitGateway
    gt: FakeGtGateway
    pool_state: FakePoolStateGateway
    repo_root: Path
    slots_root: Path
    paths_by_slot: dict[str, Path]


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _assigned_worktrees(fakes: _StackFakes) -> dict[str, str]:
    """Return slot_name -> branch for every still-assigned managed worktree."""
    return {
        wt.path.name: wt.branch
        for wt in fakes.git.list_worktrees()
        if wt.path.name.startswith("slot-") and wt.branch is not None
    }


def _build_stack_fakes(
    tmp_path: Path,
    *,
    current_branch: str,
    ancestors: tuple[str, ...],
    descendants: tuple[str, ...],
    assignments: tuple[tuple[str, str], ...],
    trunk: str = "main",
    file_status_by_slot: dict[str, FileStatus] | None = None,
    stack_override: StackInfo | GtCommandFailure | None = None,
) -> _StackFakes:
    """Build a SlotGtContext seeded with a stack and slot assignments.

    ``current_branch`` is the cwd's branch. ``ancestors`` and ``descendants``
    are the gt stack chains (top-to-bottom for descendants; trunk-first for
    ancestors). ``assignments`` is a tuple of ``(slot_name, branch_name)``
    pairs; each becomes a worktree under ``slots/repos/repo/worktrees/<slot>``.
    """
    repo_root = tmp_path / "repo"
    repo_root.mkdir(exist_ok=True)
    repo_root = repo_root.resolve()
    slots_root = tmp_path / "slots"
    pool_json_path = slots_root / "repos" / "repo" / "pool.json"

    file_status_by_slot = file_status_by_slot or {}

    paths_by_slot: dict[str, Path] = {}
    pool_assignments: list[SlotAssignment] = []
    worktrees: list[WorktreeInfo] = [
        WorktreeInfo(path=repo_root, branch=current_branch, is_bare=False)
    ]
    branch_by_path: dict[Path, str | DetachedHead] = {repo_root: current_branch}
    file_status_by_path: dict[Path, FileStatus] = {}
    existing_paths: set[Path] = {repo_root}
    branches: set[str] = {trunk, current_branch, *ancestors, *descendants}
    for slot_name, branch in assignments:
        wt_path = slots_root / "repos" / "repo" / "worktrees" / slot_name
        paths_by_slot[slot_name] = wt_path
        existing_paths.add(wt_path)
        branches.add(branch)
        worktrees.append(WorktreeInfo(path=wt_path, branch=branch, is_bare=False))
        branch_by_path[wt_path] = branch
        if slot_name in file_status_by_slot:
            file_status_by_path[wt_path] = file_status_by_slot[slot_name]
        pool_assignments.append(
            SlotAssignment(
                slot_name=slot_name,
                branch_name=branch,
                assigned_at="2026-04-01T00:00:00+00:00",
                worktree_path=wt_path,
            )
        )

    repo = RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=slots_root / "repos" / "repo",
        worktrees_dir=slots_root / "repos" / "repo" / "worktrees",
        pool_json_path=pool_json_path,
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        branches=tuple(branches),
        worktrees=tuple(worktrees),
        current_branch_by_path=branch_by_path,
        branch_head_oid_by_branch={branch: f"{branch}-oid" for branch in branches},
        file_status_by_path=file_status_by_path,
        existing_paths=existing_paths,
        repository_root_by_cwd={repo_root: repo_root},
        trunk_branch=trunk,
    )
    storage = FakeSlotsStorageGateway(existing_paths=existing_paths)
    initial_state = (
        PoolState(pool_size=4, assignments=tuple(pool_assignments)) if pool_assignments else None
    )
    pool_state = FakePoolStateGateway(pool_json_path, initial_state=initial_state)
    slots_ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )

    stack_value: StackInfo | GtCommandFailure
    if stack_override is not None:
        stack_value = stack_override
    else:
        stack_value = StackInfo(
            trunk=trunk,
            current=current_branch,
            ancestors=ancestors,
            children=descendants[:1],
            warnings=(),
            descendants=descendants,
        )
    gt = FakeGtGateway(
        branch_by_cwd={repo_root: current_branch},
        trunk=trunk,
        stack_by_branch={current_branch: stack_value},
    )
    return _StackFakes(
        ctx=SlotGtContext(slots=slots_ctx, gt=gt),
        git=git,
        gt=gt,
        pool_state=pool_state,
        repo_root=repo_root,
        slots_root=slots_root,
        paths_by_slot=paths_by_slot,
    )


# -- help / shape -----------------------------------------------------------


def test_slot_gt_free_stack_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "free-stack", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot gt free-stack" in result.output
    assert "Release every slot in the current Graphite stack" in result.output


def test_slot_gt_help_lists_free_stack(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "-h"])

    assert result.exit_code == 0
    assert "free-stack" in result.output


# -- no-op cases ------------------------------------------------------------


def test_free_stack_on_trunk_is_noop(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="main",
        ancestors=(),
        descendants=(),
        assignments=(("slot-01", "feat/a"),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["data"]["noop_reason"] == "on_trunk"
    assert payload["data"]["freed"] == []
    # Pool unchanged.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert {a.slot_name for a in saved.assignments} == {"slot-01"}
    assert fakes.git._detach_head_calls == []


def test_free_stack_no_matching_slots(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/middle",
        ancestors=("main", "feat/base"),
        descendants=("feat/child",),
        assignments=(("slot-09", "unrelated/branch"),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["data"]["noop_reason"] == "no_slots"
    assert payload["data"]["freed"] == []


# -- happy path -------------------------------------------------------------


def test_free_stack_frees_ancestors_and_descendants(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/B",
        ancestors=("main", "feat/A"),
        descendants=("feat/C", "feat/D"),
        assignments=(
            ("slot-01", "feat/A"),
            ("slot-02", "feat/C"),
            ("slot-03", "feat/D"),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["data"]["noop_reason"] is None
    freed_names = [f["slot_name"] for f in payload["data"]["freed"]]
    assert freed_names == ["slot-01", "slot-02", "slot-03"]
    # All three slots detached; current branch was not assigned to a slot.
    assert _assigned_worktrees(fakes) == {}
    assert fakes.git._detach_head_calls == [
        (fakes.paths_by_slot["slot-01"], "main"),
        (fakes.paths_by_slot["slot-02"], "main"),
        (fakes.paths_by_slot["slot-03"], "main"),
    ]


def test_free_stack_keeps_current_branch_slot_untouched(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """If the current branch happens to be assigned to a slot, that slot is preserved."""
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/B",
        ancestors=("main", "feat/A"),
        descendants=("feat/C",),
        assignments=(
            ("slot-01", "feat/A"),
            ("slot-02", "feat/B"),  # current
            ("slot-03", "feat/C"),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    freed_names = [f["slot_name"] for f in payload["data"]["freed"]]
    assert freed_names == ["slot-01", "slot-03"]
    assert _assigned_worktrees(fakes) == {"slot-02": "feat/B"}


# -- preflight failures -----------------------------------------------------


def test_free_stack_preflight_dirty_blocks_all(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/B",
        ancestors=("main", "feat/A"),
        descendants=("feat/C",),
        assignments=(("slot-01", "feat/A"), ("slot-02", "feat/C")),
        file_status_by_slot={
            "slot-02": FileStatus(staged=False, modified=True, untracked=False),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "uncommitted changes" in result.output
    saved = fakes.pool_state.load()
    assert saved is not None
    # Both still assigned — fail-fast on preflight.
    assert {a.slot_name for a in saved.assignments} == {"slot-01", "slot-02"}
    assert fakes.git._detach_head_calls == []


# -- gateway / state failures -----------------------------------------------


def test_free_stack_gt_stack_failure_surfaces(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/B",
        ancestors=(),
        descendants=(),
        assignments=(("slot-01", "feat/A"),),
        stack_override=GtCommandFailure(message="not a gt repo", returncode=1),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "not a gt repo" in result.output
    saved = fakes.pool_state.load()
    assert saved is not None
    assert {a.slot_name for a in saved.assignments} == {"slot-01"}
    assert fakes.git._detach_head_calls == []


def test_free_stack_detached_head(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/B",
        ancestors=("main",),
        descendants=(),
        assignments=(("slot-01", "feat/A"),),
    )
    fakes.git._current_branch_by_path[fakes.repo_root] = DetachedHead()

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "detached" in result.output
    assert fakes.git._detach_head_calls == []


def test_free_stack_pool_not_initialized(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="feat/B",
        ancestors=("main",),
        descendants=(),
        assignments=(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "free-stack"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 2
    assert "No managed slots configured" in result.output


# -- machine mode -----------------------------------------------------------


def test_free_stack_schema_flag(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "free-stack", "--schema"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}
