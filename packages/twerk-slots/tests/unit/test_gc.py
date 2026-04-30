"""Unit tests for twerk_slots.gc.run_gc."""

from __future__ import annotations

from pathlib import Path

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import FileStatus, WorktreeInfo
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing.clipboard import FakeClipboardGateway
from twerk_slots.gateway.testing.pool_state import FakePoolStateGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway
from twerk_slots.gc import execute_gc_plan, plan_gc, run_gc
from twerk_slots.repo_context import RepoContext

ROOT = Path("/tmp/t")


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


def _slot_path(slot_name: str) -> Path:
    return _make_repo().worktrees_dir / slot_name


def _build_ctx(
    *,
    slots: tuple[tuple[str, str | None], ...] = (),
    file_status_by_path: dict[Path, FileStatus] | None = None,
    prs_by_branch: dict[str, PRSummary] | None = None,
    pr_gateway: FakePRGateway | None = None,
) -> tuple[SlotsCliContext, FakeGitGateway]:
    """Build a SlotsCliContext seeded with managed slot worktrees.

    ``slots`` is a tuple of ``(slot_name, branch_or_none)`` pairs. A
    ``None`` branch represents a managed-but-detached slot (available).
    """
    repo = _make_repo()
    worktrees = tuple(
        WorktreeInfo(path=_slot_path(slot), branch=branch, is_bare=False) for slot, branch in slots
    )
    branches = {branch for _, branch in slots if branch is not None}
    git = FakeGitGateway(
        repo_root=repo.root,
        branches=branches,
        worktrees=worktrees,
        file_status_by_path=file_status_by_path or {},
    )
    existing_paths = {
        repo.root,
        repo.repo_dir,
        repo.worktrees_dir,
        *(_slot_path(s) for s, _ in slots),
    }
    storage = FakeSlotsStorageGateway(existing_paths=existing_paths)
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)
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
    return ctx, git


# -- empty pool --------------------------------------------------------------


def test_run_gc_empty_pool_returns_no_entries() -> None:
    ctx, _git = _build_ctx()

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries == ()
    assert outcome.freed_count == 0
    assert outcome.kept_count == 0
    assert outcome.skipped_count == 0
    assert outcome.error_count == 0
    assert outcome.dry_run is False


def test_run_gc_detached_slots_are_ignored() -> None:
    # A managed slot with no branch (detached) is "available" — gc skips it.
    ctx, git = _build_ctx(slots=(("slot-01", None),))

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries == ()
    assert git._detach_head_calls == []


# -- single-slot classification rules ---------------------------------------


def test_run_gc_open_pr_is_kept() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/x"),),
        prs_by_branch={"feat/x": _make_pr(42, "OPEN", "feat/x")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert len(outcome.entries) == 1
    entry = outcome.entries[0]
    assert entry.action == "kept_open_pr"
    assert entry.pr_state == "OPEN"
    assert entry.pr_number == 42
    assert outcome.kept_count == 1
    assert git._detach_head_calls == []


def test_run_gc_merged_pr_is_freed() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/done"),),
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["freed"]
    assert outcome.entries[0].pr_state == "MERGED"
    assert outcome.freed_count == 1
    assert git._detach_head_calls == [(_slot_path("slot-01"), "main")]
    assert git._create_branch_calls == []
    assert git._checkout_calls == []


def test_run_gc_closed_pr_is_freed() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/rejected"),),
        prs_by_branch={"feat/rejected": _make_pr(9, "CLOSED", "feat/rejected")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["freed"]
    assert outcome.entries[0].pr_state == "CLOSED"
    assert git._detach_head_calls == [(_slot_path("slot-01"), "main")]


def test_run_gc_no_pr_is_kept() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "local-only"),),
        prs_by_branch={},  # no PR for branch → returncode 1 from fake
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["kept_no_pr"]
    assert outcome.entries[0].pr_number is None
    assert outcome.kept_count == 1
    assert git._detach_head_calls == []


class _BrokenPRGateway(FakePRGateway):
    """PR gateway that returns a non-1 error — simulates gh CLI broken."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="gh: command not found", returncode=4)


def test_run_gc_broken_gh_yields_error_entry() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/x"),),
        pr_gateway=_BrokenPRGateway(),
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["error"]
    assert outcome.error_count == 1
    assert "gh: command not found" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []


def test_run_gc_dirty_worktree_is_skipped() -> None:
    slot_path = _slot_path("slot-01")
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/dirty"),),
        file_status_by_path={
            slot_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")},
    )

    outcome = run_gc(ctx, dry_run=False)

    assert [e.action for e in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    assert git._detach_head_calls == []


# -- dry-run ------------------------------------------------------------------


def test_run_gc_dry_run_reports_without_mutating() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/done"),),
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    outcome = run_gc(ctx, dry_run=True)

    assert [e.action for e in outcome.entries] == ["would_free"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is True
    assert git._checkout_calls == []
    assert git._create_branch_calls == []
    assert git._detach_head_calls == []


# -- mixed pool ---------------------------------------------------------------


def test_run_gc_mixed_pool_classifies_per_slot() -> None:
    ctx, git = _build_ctx(
        slots=(
            ("slot-01", "feat/done"),
            ("slot-02", "feat/wip"),
            ("slot-03", "local"),
            ("slot-04", "feat/dirty"),
            ("slot-05", None),  # available — should be skipped
        ),
        file_status_by_path={
            _slot_path("slot-04"): FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={
            "feat/done": _make_pr(1, "MERGED", "feat/done"),
            "feat/wip": _make_pr(2, "OPEN", "feat/wip"),
            "feat/dirty": _make_pr(3, "MERGED", "feat/dirty"),
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
    assert git._detach_head_calls == [(_slot_path("slot-01"), "main")]


# -- plan_gc / execute_gc_plan split -----------------------------------------


def test_plan_gc_classifies_without_mutating_state() -> None:
    ctx, git = _build_ctx(
        slots=(
            ("slot-01", "feat/done"),
            ("slot-02", "feat/wip"),
            ("slot-03", "local"),
        ),
        prs_by_branch={
            "feat/done": _make_pr(1, "MERGED", "feat/done"),
            "feat/wip": _make_pr(2, "OPEN", "feat/wip"),
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
    assert git._detach_head_calls == []


def test_plan_gc_dirty_worktree_still_classified_as_would_free() -> None:
    # Dirtiness is only detected during execute; plan_gc doesn't peek at
    # worktree status.
    slot_path = _slot_path("slot-01")
    ctx, _git = _build_ctx(
        slots=(("slot-01", "feat/dirty"),),
        file_status_by_path={
            slot_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")},
    )

    plan = plan_gc(ctx)

    assert [e.action for e in plan.entries] == ["would_free"]
    assert plan.would_free_count == 1


def test_execute_gc_plan_frees_would_free_entries() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/done"),),
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    plan = plan_gc(ctx)
    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["freed"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is False
    assert git._detach_head_calls == [(_slot_path("slot-01"), "main")]


def test_execute_gc_plan_passthrough_non_would_free() -> None:
    ctx, git = _build_ctx(
        slots=(("slot-02", "feat/wip"),),
        prs_by_branch={"feat/wip": _make_pr(2, "OPEN", "feat/wip")},
    )

    plan = plan_gc(ctx)
    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["kept_open_pr"]
    assert outcome.kept_count == 1
    assert outcome.freed_count == 0
    assert git._detach_head_calls == []


def test_execute_gc_plan_translates_dirty_to_skipped() -> None:
    slot_path = _slot_path("slot-01")
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/dirty"),),
        file_status_by_path={
            slot_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")},
    )

    plan = plan_gc(ctx)
    assert [e.action for e in plan.entries] == ["would_free"]

    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    assert git._detach_head_calls == []


def test_execute_gc_plan_record_disappears_yields_error() -> None:
    # Plan a free, then mutate the inventory to drop the slot before execute
    # — simulates a concurrent manual `slot free` between plan and execute.
    ctx, git = _build_ctx(
        slots=(("slot-01", "feat/done"),),
        prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")},
    )

    plan = plan_gc(ctx)

    # Drop the worktree from the fake git gateway between phases.
    git._worktrees.clear()

    outcome = execute_gc_plan(ctx, plan)

    assert [e.action for e in outcome.entries] == ["error"]
    assert outcome.error_count == 1
    assert "state changed between plan and execute" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []
