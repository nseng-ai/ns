from __future__ import annotations

from pathlib import Path

import pytest

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_slots.context import SlotsCliContext
from twerk_slots.context_testing import build_test_slots_context
from twerk_slots.gateway.git import FileStatus, WorktreeInfo
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.gc import run_gc
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext

ROOT = Path("/tmp/t")
SLOTS_ROOT = ROOT / "slots"


def _make_repo() -> RepoContext:
    repo_root = ROOT / "repo"
    repo_dir = SLOTS_ROOT / "repos" / "repo"
    worktrees_dir = repo_dir / "worktrees"
    return RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=repo_dir,
        worktrees_dir=worktrees_dir,
        pool_json_path=repo_dir / "pool.json",
    )


def _assignment(slot_name: str, branch_name: str) -> SlotAssignment:
    return SlotAssignment(
        slot_name=slot_name,
        branch_name=branch_name,
        assigned_at="2026-04-12T00:00:00+00:00",
        worktree_path=_make_repo().worktrees_dir / slot_name,
    )


def _pr(
    *,
    number: int,
    branch_name: str,
    head_ref_oid: str,
    state: PRState,
) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/twerk/pull/{number}",
        head_ref_name=branch_name,
        head_ref_oid=head_ref_oid,
        base_ref_name="main",
        state=state,
    )


def _build_ctx(
    state: PoolState,
    *,
    pr: FakePRGateway | None = None,
    existing_paths: set[Path] | None = None,
    branch_head_by_name: dict[str, str] | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
) -> tuple[FakeGitGateway, FakePoolStateGateway, SlotsCliContext]:
    repo = _make_repo()
    seeded_paths = {repo.root, repo.repo_dir, repo.worktrees_dir}
    current_branch_by_path: dict[Path, str | None] = {}
    worktrees: list[WorktreeInfo] = []
    branches: set[str] = set()
    seeded_heads = {
        assignment.branch_name: f"{assignment.slot_name}-sha" for assignment in state.assignments
    }
    if branch_head_by_name is not None:
        seeded_heads.update(branch_head_by_name)
    for assignment in state.assignments:
        current_branch_by_path[assignment.worktree_path] = assignment.branch_name
        worktrees.append(
            WorktreeInfo(
                path=assignment.worktree_path,
                branch=assignment.branch_name,
                is_bare=False,
            )
        )
        branches.add(assignment.branch_name)
    if existing_paths is not None:
        seeded_paths.update(existing_paths)
    else:
        seeded_paths.update(assignment.worktree_path for assignment in state.assignments)

    storage = FakeSlotsStorageGateway(existing_paths=seeded_paths)
    git = FakeGitGateway(
        repo_root=repo.root,
        branches=branches,
        worktrees=tuple(worktrees),
        current_branch_by_path=current_branch_by_path,
        branch_head_by_name=seeded_heads,
        file_status_by_path=file_status_by_path,
        existing_paths=seeded_paths,
        storage=storage,
    )
    pool_state = FakePoolStateGateway(repo.pool_json_path, initial_state=state)
    ctx = build_test_slots_context(
        repo=repo,
        git=git,
        pr=FakePRGateway() if pr is None else pr,
        storage=storage,
        pool_state=pool_state,
        clipboard=FakeClipboardGateway(),
        slots_root=SLOTS_ROOT,
    )
    return git, pool_state, ctx


def test_run_gc_empty_pool_returns_zero_counts() -> None:
    state = PoolState(pool_size=4, assignments=())
    _, _, ctx = _build_ctx(state)

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries == ()
    assert outcome.freed_count == 0
    assert outcome.kept_count == 0
    assert outcome.skipped_count == 0
    assert outcome.error_count == 0


def test_run_gc_keeps_open_pr_with_matching_sha() -> None:
    assignment = _assignment("slot-01", "feat/open")
    sha = "slot-01-sha"
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/open", "all"): (
                _pr(
                    number=11,
                    branch_name="feat/open",
                    head_ref_oid=sha,
                    state="OPEN",
                ),
            )
        }
    )
    _, pool_state, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)), pr=pr)

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "kept_open_pr"
    assert outcome.entries[0].pr_number == 11
    assert outcome.kept_count == 1
    assert pool_state.load() == PoolState(pool_size=4, assignments=(assignment,))


@pytest.mark.parametrize("pr_state", ["MERGED", "CLOSED"])
def test_run_gc_frees_closed_or_merged_pr_with_matching_sha(pr_state: PRState) -> None:
    assignment = _assignment("slot-01", "feat/done")
    sha = "slot-01-sha"
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/done", "all"): (
                _pr(number=22, branch_name="feat/done", head_ref_oid=sha, state=pr_state),
            )
        }
    )
    git, pool_state, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)), pr=pr)

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "freed"
    assert outcome.entries[0].pr_state == pr_state
    assert outcome.freed_count == 1
    saved = pool_state.load()
    assert saved is not None
    assert saved.assignments == ()
    assert git._checkout_calls == [(assignment.worktree_path, "__slot-01-br-stub__")]


def test_run_gc_dry_run_would_free_without_mutating_state() -> None:
    assignment = _assignment("slot-01", "feat/dry-run")
    sha = "slot-01-sha"
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/dry-run", "all"): (
                _pr(number=33, branch_name="feat/dry-run", head_ref_oid=sha, state="MERGED"),
            )
        }
    )
    _, pool_state, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)), pr=pr)

    outcome = run_gc(ctx, dry_run=True)

    assert outcome.entries[0].action == "would_free"
    assert outcome.freed_count == 1
    saved = pool_state.load()
    assert saved is not None
    assert saved.assignments == (assignment,)


def test_run_gc_keeps_slot_when_no_pr_matches_branch() -> None:
    assignment = _assignment("slot-01", "feat/no-pr")
    _, _, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)))

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "kept_no_pr"
    assert outcome.kept_count == 1


def test_run_gc_keeps_slot_when_pr_sha_does_not_match_local_head() -> None:
    assignment = _assignment("slot-01", "feat/reused")
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/reused", "all"): (
                _pr(number=44, branch_name="feat/reused", head_ref_oid="old-sha", state="MERGED"),
            )
        }
    )
    _, _, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)), pr=pr)

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "kept_no_pr"


def test_run_gc_reports_ambiguous_pr_matches() -> None:
    assignment = _assignment("slot-01", "feat/ambiguous")
    sha = "slot-01-sha"
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/ambiguous", "all"): (
                _pr(number=51, branch_name="feat/ambiguous", head_ref_oid=sha, state="MERGED"),
                _pr(number=52, branch_name="feat/ambiguous", head_ref_oid=sha, state="CLOSED"),
            )
        }
    )
    _, _, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)), pr=pr)

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "error"
    assert "Ambiguous PR match" in (outcome.entries[0].message or "")
    assert outcome.error_count == 1


def test_run_gc_reports_missing_worktree_path() -> None:
    assignment = _assignment("slot-01", "feat/missing")
    repo = _make_repo()
    seeded_paths = {repo.root, repo.repo_dir, repo.worktrees_dir}
    _, _, ctx = _build_ctx(
        PoolState(pool_size=4, assignments=(assignment,)),
        existing_paths=seeded_paths,
    )

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "error"
    assert "Missing worktree path" in (outcome.entries[0].message or "")


def test_run_gc_reports_missing_local_branch_ref() -> None:
    assignment = _assignment("slot-01", "feat/missing-ref")
    git, _, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)))
    git._branch_head_by_name.clear()

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "error"
    assert "Local branch ref is missing" in (outcome.entries[0].message or "")


def test_run_gc_reports_gh_lookup_failure() -> None:
    assignment = _assignment("slot-01", "feat/gh-failure")
    pr = FakePRGateway(
        errors_by_branch_state={
            ("feat/gh-failure", "all"): PRLookupError(stderr="gh broke", returncode=2)
        }
    )
    _, _, ctx = _build_ctx(PoolState(pool_size=4, assignments=(assignment,)), pr=pr)

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "error"
    assert "gh broke" in (outcome.entries[0].message or "")


def test_run_gc_skips_dirty_worktree_on_real_free_path() -> None:
    assignment = _assignment("slot-01", "feat/dirty")
    sha = "slot-01-sha"
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/dirty", "all"): (
                _pr(number=61, branch_name="feat/dirty", head_ref_oid=sha, state="MERGED"),
            )
        }
    )
    _, pool_state, ctx = _build_ctx(
        PoolState(pool_size=4, assignments=(assignment,)),
        pr=pr,
        file_status_by_path={
            assignment.worktree_path: FileStatus(staged=False, modified=True, untracked=False)
        },
    )

    outcome = run_gc(ctx, dry_run=False)

    assert outcome.entries[0].action == "skipped_dirty"
    assert outcome.skipped_count == 1
    saved = pool_state.load()
    assert saved is not None
    assert saved.assignments == (assignment,)


def test_run_gc_mixed_pool_reports_counts_and_keeps_going() -> None:
    merged = _assignment("slot-01", "feat/merged")
    open_pr = _assignment("slot-02", "feat/open")
    no_pr = _assignment("slot-03", "feat/no-pr")
    dirty = _assignment("slot-04", "feat/dirty")
    ambiguous = _assignment("slot-05", "feat/ambiguous")
    state = PoolState(pool_size=8, assignments=(merged, open_pr, no_pr, dirty, ambiguous))
    pr = FakePRGateway(
        prs_by_branch_state={
            ("feat/merged", "all"): (
                _pr(
                    number=71,
                    branch_name="feat/merged",
                    head_ref_oid="slot-01-sha",
                    state="MERGED",
                ),
            ),
            ("feat/open", "all"): (
                _pr(number=72, branch_name="feat/open", head_ref_oid="slot-02-sha", state="OPEN"),
            ),
            ("feat/dirty", "all"): (
                _pr(
                    number=73,
                    branch_name="feat/dirty",
                    head_ref_oid="slot-04-sha",
                    state="CLOSED",
                ),
            ),
            ("feat/ambiguous", "all"): (
                _pr(
                    number=74,
                    branch_name="feat/ambiguous",
                    head_ref_oid="slot-05-sha",
                    state="MERGED",
                ),
                _pr(
                    number=75,
                    branch_name="feat/ambiguous",
                    head_ref_oid="slot-05-sha",
                    state="CLOSED",
                ),
            ),
        }
    )
    _, _, ctx = _build_ctx(
        state,
        pr=pr,
        file_status_by_path={
            dirty.worktree_path: FileStatus(staged=True, modified=False, untracked=False)
        },
    )

    outcome = run_gc(ctx, dry_run=False)

    assert tuple(entry.action for entry in outcome.entries) == (
        "freed",
        "kept_open_pr",
        "kept_no_pr",
        "skipped_dirty",
        "error",
    )
    assert outcome.freed_count == 1
    assert outcome.kept_count == 2
    assert outcome.skipped_count == 1
    assert outcome.error_count == 1
