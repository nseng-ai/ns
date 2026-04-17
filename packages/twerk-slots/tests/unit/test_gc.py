"""Unit tests for twerk_slots.gc.run_gc."""

from __future__ import annotations

from pathlib import Path

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.gc import execute_gc_plan, plan_gc, run_gc
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext

ROOT = Path("/tmp/t")
NOW = "2026-04-12T00:00:00+00:00"


def _make_repo() -> RepoContext:
    repo_root = ROOT / "repo"
    repo_dir = ROOT / "slots" / "repos" / "repo"
    worktrees_dir = repo_dir / "worktrees"
    return RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=repo_dir,
        worktrees_dir=worktrees_dir,
        pool_json_path=repo_dir / "pool.json",
    )


def _make_pr(number: int, state: PRState, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/twerk/pull/{number}",
        head_ref_name=branch,
        base_ref_name="master",
        state=state,
    )


def _seeded_storage(*, existing_paths: set[Path] | None = None) -> FakeSlotsStorageGateway:
    repo = _make_repo()
    base = {repo.root, repo.repo_dir, repo.worktrees_dir}
    if existing_paths:
        base |= existing_paths
    return FakeSlotsStorageGateway(existing_paths=base)


def _build_ctx(
    *,
    assignments: tuple[SlotAssignment, ...] = (),
    branches: set[str] | None = None,
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
    prs_by_branch: dict[str, PRSummary] | None = None,
    pr_gateway: FakePRGateway | None = None,
) -> tuple[SlotsCliContext, FakePoolStateGateway, FakeGitGateway]:
    repo = _make_repo()
    slot_paths = {a.worktree_path for a in assignments}
    git = FakeGitGateway(
        repo_root=repo.root,
        branches=(branches or set()) | {a.branch_name for a in assignments},
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path or {},
        file_status_by_path=file_status_by_path or {},
    )
    storage = _seeded_storage(existing_paths=slot_paths)
    pool_state_gw = FakePoolStateGateway(
        repo.pool_json_path,
        initial_state=PoolState(pool_size=4, assignments=assignments),
    )
    pr = pr_gateway or FakePRGateway(prs_by_branch=prs_by_branch or {})
    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=pr,
        slots_root=ROOT / "slots",
    )
    return ctx, pool_state_gw, git


def _assignment(slot: str, branch: str) -> SlotAssignment:
    repo = _make_repo()
    return SlotAssignment(
        slot_name=slot,
        branch_name=branch,
        assigned_at=NOW,
        worktree_path=repo.worktrees_dir / slot,
    )


# -- empty pool --------------------------------------------------------------


def test_run_gc_empty_pool_returns_no_entries() -> None:
    ctx, _pool_state_gw, _git = _build_ctx()

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries == ()
    assert outcome.freed_count == 0
    assert outcome.kept_count == 0
    assert outcome.skipped_count == 0
    assert outcome.error_count == 0
    assert outcome.dry_run is False


# -- single-slot classification rules ---------------------------------------


def test_run_gc_open_pr_is_kept() -> None:
    assignment = _assignment("slot-01", "feat/x")
    ctx, pool_state_gw, git = _build_ctx(
        assignments=(assignment,),
        worktrees=(WorktreeInfo(path=assignment.worktree_path, branch="feat/x", is_bare=False),),
        current_branch_by_path={assignment.worktree_path: "feat/x"},
        prs_by_branch={"feat/x": _make_pr(42, "OPEN", "feat/x")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert len(outcome.entries) == 1
    entry = outcome.entries[0]
    assert entry.action == "kept_open_pr"
    assert entry.pr_state == "OPEN"
    assert entry.pr_number == 42
    assert outcome.kept_count == 1
    # Pool unchanged.
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (assignment,)
    assert git._checkout_calls == []


def test_run_gc_merged_pr_is_freed() -> None:
    assignment = _assignment("slot-01", "feat/done")
    ctx, pool_state_gw, git = _build_ctx(
        assignments=(assignment,),
        worktrees=(WorktreeInfo(path=assignment.worktree_path, branch="feat/done", is_bare=False),),
        current_branch_by_path={assignment.worktree_path: "feat/done"},
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["freed"]
    assert outcome.entries[0].pr_state == "MERGED"
    assert outcome.freed_count == 1
    # Placeholder created + checked out.
    assert git._create_branch_calls == [("__slot-01-br-stub__", "main", False)]
    assert git._checkout_calls == [(assignment.worktree_path, "__slot-01-br-stub__")]
    # Pool state drained.
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == ()


def test_run_gc_closed_pr_is_freed() -> None:
    assignment = _assignment("slot-01", "feat/rejected")
    ctx, pool_state_gw, _git = _build_ctx(
        assignments=(assignment,),
        worktrees=(
            WorktreeInfo(path=assignment.worktree_path, branch="feat/rejected", is_bare=False),
        ),
        current_branch_by_path={assignment.worktree_path: "feat/rejected"},
        prs_by_branch={"feat/rejected": _make_pr(9, "CLOSED", "feat/rejected")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["freed"]
    assert outcome.entries[0].pr_state == "CLOSED"
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == ()


def test_run_gc_no_pr_is_kept() -> None:
    assignment = _assignment("slot-01", "local-only")
    ctx, pool_state_gw, _git = _build_ctx(
        assignments=(assignment,),
        worktrees=(
            WorktreeInfo(path=assignment.worktree_path, branch="local-only", is_bare=False),
        ),
        current_branch_by_path={assignment.worktree_path: "local-only"},
        prs_by_branch={},  # no PR for branch → returncode 1 from fake
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["kept_no_pr"]
    assert outcome.entries[0].pr_number is None
    assert outcome.kept_count == 1
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (assignment,)


class _BrokenPRGateway(FakePRGateway):
    """PR gateway that returns a non-1 error — simulates gh CLI broken."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="gh: command not found", returncode=4)


def test_run_gc_broken_gh_yields_error_entry() -> None:
    assignment = _assignment("slot-01", "feat/x")
    ctx, pool_state_gw, _git = _build_ctx(
        assignments=(assignment,),
        worktrees=(WorktreeInfo(path=assignment.worktree_path, branch="feat/x", is_bare=False),),
        current_branch_by_path={assignment.worktree_path: "feat/x"},
        pr_gateway=_BrokenPRGateway(),
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["error"]
    assert outcome.error_count == 1
    assert "gh: command not found" in (outcome.entries[0].message or "")
    # Pool unchanged.
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (assignment,)


def test_run_gc_dirty_worktree_is_skipped() -> None:
    assignment = _assignment("slot-01", "feat/dirty")
    ctx, pool_state_gw, _git = _build_ctx(
        assignments=(assignment,),
        worktrees=(
            WorktreeInfo(path=assignment.worktree_path, branch="feat/dirty", is_bare=False),
        ),
        current_branch_by_path={assignment.worktree_path: "feat/dirty"},
        file_status_by_path={
            assignment.worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    # Pool unchanged because free_slot_assignment refused.
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (assignment,)


# -- dry-run ------------------------------------------------------------------


def test_run_gc_dry_run_reports_without_mutating() -> None:
    assignment = _assignment("slot-01", "feat/done")
    ctx, pool_state_gw, git = _build_ctx(
        assignments=(assignment,),
        worktrees=(WorktreeInfo(path=assignment.worktree_path, branch="feat/done", is_bare=False),),
        current_branch_by_path={assignment.worktree_path: "feat/done"},
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    outcome = run_gc(ctx, dry_run=True)

    assert [e.action for e in outcome.entries] == ["would_free"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is True
    # No side-effects.
    assert git._checkout_calls == []
    assert git._create_branch_calls == []
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (assignment,)


# -- mixed pool ---------------------------------------------------------------


def test_run_gc_mixed_pool_classifies_per_slot() -> None:
    repo = _make_repo()
    merged = SlotAssignment("slot-01", "feat/done", NOW, repo.worktrees_dir / "slot-01")
    open_pr = SlotAssignment("slot-02", "feat/wip", NOW, repo.worktrees_dir / "slot-02")
    no_pr = SlotAssignment("slot-03", "local", NOW, repo.worktrees_dir / "slot-03")
    dirty = SlotAssignment("slot-04", "feat/dirty", NOW, repo.worktrees_dir / "slot-04")

    ctx, pool_state_gw, _git = _build_ctx(
        assignments=(merged, open_pr, no_pr, dirty),
        worktrees=(
            WorktreeInfo(path=merged.worktree_path, branch=merged.branch_name, is_bare=False),
            WorktreeInfo(path=open_pr.worktree_path, branch=open_pr.branch_name, is_bare=False),
            WorktreeInfo(path=no_pr.worktree_path, branch=no_pr.branch_name, is_bare=False),
            WorktreeInfo(path=dirty.worktree_path, branch=dirty.branch_name, is_bare=False),
        ),
        current_branch_by_path={
            merged.worktree_path: merged.branch_name,
            open_pr.worktree_path: open_pr.branch_name,
            no_pr.worktree_path: no_pr.branch_name,
            dirty.worktree_path: dirty.branch_name,
        },
        file_status_by_path={
            dirty.worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={
            merged.branch_name: _make_pr(1, "MERGED", merged.branch_name),
            open_pr.branch_name: _make_pr(2, "OPEN", open_pr.branch_name),
            dirty.branch_name: _make_pr(3, "MERGED", dirty.branch_name),
        },
    )

    outcome = run_gc(ctx, dry_run=False)

    actions_by_slot = {e.slot_name: e.action for e in outcome.entries}
    assert actions_by_slot == {
        "slot-01": "freed",
        "slot-02": "kept_open_pr",
        "slot-03": "kept_no_pr",
        "slot-04": "skipped_dirty",
    }
    assert outcome.freed_count == 1
    assert outcome.kept_count == 2
    assert outcome.skipped_count == 1
    assert outcome.error_count == 0

    saved = pool_state_gw.load()
    assert saved is not None
    remaining_slots = {a.slot_name for a in saved.assignments}
    assert remaining_slots == {"slot-02", "slot-03", "slot-04"}


# -- plan_gc / execute_gc_plan split -----------------------------------------


def test_plan_gc_classifies_without_mutating_state() -> None:
    repo = _make_repo()
    merged = SlotAssignment("slot-01", "feat/done", NOW, repo.worktrees_dir / "slot-01")
    open_pr = SlotAssignment("slot-02", "feat/wip", NOW, repo.worktrees_dir / "slot-02")
    no_pr = SlotAssignment("slot-03", "local", NOW, repo.worktrees_dir / "slot-03")

    ctx, pool_state_gw, git = _build_ctx(
        assignments=(merged, open_pr, no_pr),
        worktrees=(
            WorktreeInfo(path=merged.worktree_path, branch=merged.branch_name, is_bare=False),
            WorktreeInfo(path=open_pr.worktree_path, branch=open_pr.branch_name, is_bare=False),
            WorktreeInfo(path=no_pr.worktree_path, branch=no_pr.branch_name, is_bare=False),
        ),
        current_branch_by_path={
            merged.worktree_path: merged.branch_name,
            open_pr.worktree_path: open_pr.branch_name,
            no_pr.worktree_path: no_pr.branch_name,
        },
        prs_by_branch={
            merged.branch_name: _make_pr(1, "MERGED", merged.branch_name),
            open_pr.branch_name: _make_pr(2, "OPEN", open_pr.branch_name),
        },
    )

    plan = plan_gc(ctx)

    actions_by_slot = {e.slot_name: e.action for e in plan.entries}
    assert actions_by_slot == {
        "slot-01": "would_free",
        "slot-02": "kept_open_pr",
        "slot-03": "kept_no_pr",
    }
    assert plan.would_free_count == 1
    # No mutations: no free_slot_assignment was called, so no placeholder
    # branch creation or checkout happened.
    assert git._checkout_calls == []
    assert git._create_branch_calls == []
    saved = pool_state_gw.load()
    assert saved is not None
    assert {a.slot_name for a in saved.assignments} == {"slot-01", "slot-02", "slot-03"}


def test_plan_gc_dirty_worktree_still_classified_as_would_free() -> None:
    # Dirtiness is only detected during free; plan_gc doesn't peek at worktree
    # status. Caller can inspect via execute_gc_plan if they proceed.
    assignment = _assignment("slot-01", "feat/dirty")
    ctx, _pool_state_gw, _git = _build_ctx(
        assignments=(assignment,),
        worktrees=(
            WorktreeInfo(path=assignment.worktree_path, branch="feat/dirty", is_bare=False),
        ),
        current_branch_by_path={assignment.worktree_path: "feat/dirty"},
        file_status_by_path={
            assignment.worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")},
    )

    plan = plan_gc(ctx)

    assert [e.action for e in plan.entries] == ["would_free"]
    assert plan.would_free_count == 1


def test_execute_gc_plan_frees_would_free_entries() -> None:
    assignment = _assignment("slot-01", "feat/done")
    ctx, pool_state_gw, git = _build_ctx(
        assignments=(assignment,),
        worktrees=(WorktreeInfo(path=assignment.worktree_path, branch="feat/done", is_bare=False),),
        current_branch_by_path={assignment.worktree_path: "feat/done"},
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    plan = plan_gc(ctx)
    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["freed"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is False
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == ()
    assert git._checkout_calls == [(assignment.worktree_path, "__slot-01-br-stub__")]


def test_execute_gc_plan_passthrough_non_would_free() -> None:
    open_pr = _assignment("slot-02", "feat/wip")
    ctx, pool_state_gw, git = _build_ctx(
        assignments=(open_pr,),
        worktrees=(WorktreeInfo(path=open_pr.worktree_path, branch="feat/wip", is_bare=False),),
        current_branch_by_path={open_pr.worktree_path: "feat/wip"},
        prs_by_branch={"feat/wip": _make_pr(2, "OPEN", "feat/wip")},
    )

    plan = plan_gc(ctx)
    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["kept_open_pr"]
    assert outcome.kept_count == 1
    assert outcome.freed_count == 0
    # No mutation on passthrough.
    assert git._checkout_calls == []
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (open_pr,)


def test_execute_gc_plan_translates_dirty_to_skipped() -> None:
    assignment = _assignment("slot-01", "feat/dirty")
    ctx, pool_state_gw, _git = _build_ctx(
        assignments=(assignment,),
        worktrees=(
            WorktreeInfo(path=assignment.worktree_path, branch="feat/dirty", is_bare=False),
        ),
        current_branch_by_path={assignment.worktree_path: "feat/dirty"},
        file_status_by_path={
            assignment.worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")},
    )

    plan = plan_gc(ctx)
    # Plan optimistically says would_free.
    assert [e.action for e in plan.entries] == ["would_free"]

    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    # Pool unchanged because free_slot_assignment refused.
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == (assignment,)
