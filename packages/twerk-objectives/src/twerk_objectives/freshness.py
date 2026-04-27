"""Snapshot-freshness classifier shared by ``objective exec`` digest emitters."""

from __future__ import annotations

from typing import Literal

ObjectiveSnapshotState = Literal["fresh", "stale"]


def classify_obj_state(
    *,
    alive: bool,
    snapshot_iso: str | None,
    branch_max_author_iso: str | None,
) -> ObjectiveSnapshotState:
    """Classify a snapshot as ``"fresh"`` or ``"stale"``.

    A deleted branch (post-merge) is fresh by definition: its history is
    frozen, so the snapshot can no longer drift. For live branches,
    compare the latest author timestamp on ``master..branch`` against the
    snapshot's last-write timestamp lexically — stale only when both are
    known and the newest author time is strictly newer than the snapshot.

    Author time (``%aI``) is preserved by ``gt restack`` while committer
    time (``%cI``) is rewritten, so this signal does not flap on restacks
    that produce no net-new commits and stays aligned with
    ``objective exec update-precheck``.
    """
    if not alive:
        return "fresh"
    if snapshot_iso is None or branch_max_author_iso is None:
        return "fresh"
    if branch_max_author_iso > snapshot_iso:
        return "stale"
    return "fresh"
