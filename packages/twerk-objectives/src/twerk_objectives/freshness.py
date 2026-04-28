"""Snapshot-freshness classifier shared by ``objective exec`` digest emitters."""

from __future__ import annotations

from typing import Literal

ObjectiveSnapshotState = Literal["fresh", "stale"]


def classify_obj_state(
    *,
    alive: bool,
    snapshot_iso: str | None,
    branch_commit_pids: tuple[str | None, ...] | None,
    absorbed_pids: frozenset[str] | None,
    branch_max_author_iso: str | None,
) -> ObjectiveSnapshotState:
    """Classify a snapshot as ``"fresh"`` or ``"stale"``.

    A deleted branch (post-merge) is fresh by definition: its history is
    frozen, so the snapshot can no longer drift. For live branches, prefer
    a patch-id absorption check: when both ``branch_commit_pids`` and
    ``absorbed_pids`` are available, the branch is fresh iff every
    ``master..branch`` commit's patch-id is present in ``absorbed_pids``.
    A ``None`` patch-id (merge or empty/whitespace-only commit) cannot be
    proven absorbed, so it forces stale.

    When the patch-id inputs are unavailable (``gt`` failure, untracked
    branch, ``git patch-id`` failure), fall back to the date-based
    comparator: stale only when both ``snapshot_iso`` and
    ``branch_max_author_iso`` are known and the latter is strictly newer.
    Author time (``%aI``) is preserved by ``gt restack`` while committer
    time (``%cI``) is rewritten, so this signal does not flap on restacks
    that produce no net-new commits.
    """
    if not alive:
        return "fresh"
    if branch_commit_pids is not None and absorbed_pids is not None:
        if not branch_commit_pids:
            return "fresh"
        for pid in branch_commit_pids:
            if pid is None or pid not in absorbed_pids:
                return "stale"
        return "fresh"
    if snapshot_iso is None or branch_max_author_iso is None:
        return "fresh"
    if branch_max_author_iso > snapshot_iso:
        return "stale"
    return "fresh"
