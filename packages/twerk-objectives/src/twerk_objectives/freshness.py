"""Snapshot-freshness classifier shared by ``objective exec`` digest emitters."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from brmem.gateway import BranchMemoryGateway, snapshot_ref_name
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import GitCommandFailure
from twerk_core.gt.gateway import GtGateway
from twerk_objectives.discovery import body_key
from twerk_objectives.exec.absorbed import (
    AbsorbedSetUnavailable,
    absorbed_patch_ids_for_branch,
)
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE

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


def classify_branch_snapshot(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    gt: GtGateway,
    branch: str,
    slug: str,
    *,
    cwd: Path,
    trunk: str,
    alive: bool,
) -> ObjectiveSnapshotState:
    """Classify the snapshot freshness for ``branch``'s claim of ``slug``.

    Gathers the snapshot timestamp, branch tip's max author iso, branch
    commit patch-ids, and absorbed patch-ids, then defers to
    :func:`classify_obj_state`. Always returns ``"fresh"`` or ``"stale"``;
    callers map ``alive=False`` to a UI ``"deleted"`` label themselves.
    """
    del gateway  # snapshot timestamp comes from git via the snapshot ref
    snapshot_ref = snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, body_key(slug))
    branch_max_author_iso = _max_author_iso(git, branch, trunk) if alive else None
    branch_commit_pids, absorbed_pids = _patch_id_inputs(
        git, gt, cwd, branch, trunk=trunk, alive=alive
    )
    return classify_obj_state(
        alive=alive,
        snapshot_iso=body_last_touched,
        branch_commit_pids=branch_commit_pids,
        absorbed_pids=absorbed_pids,
        branch_max_author_iso=branch_max_author_iso,
    )


def _max_author_iso(git: GitGateway, branch: str, trunk: str) -> str | None:
    """Return the latest author timestamp on ``trunk..branch``, or ``None``.

    Author time (``%aI``) is preserved by ``gt restack``; committer time
    (``%cI``) is rewritten. Using author time keeps the freshness signal
    aligned with digest and resilient to no-op restacks.
    """
    result = git.log_range(f"{trunk}..{branch}")
    if isinstance(result, GitCommandFailure):
        return None
    return max((c.author_iso for c in result), default=None)


def _patch_id_inputs(
    git: GitGateway,
    gt: GtGateway,
    cwd: Path,
    branch: str,
    *,
    trunk: str,
    alive: bool,
) -> tuple[tuple[str | None, ...] | None, frozenset[str] | None]:
    """Return ``(branch_commit_pids, absorbed_pids)`` for ``branch``.

    ``(None, None)`` means the patch-id signal is unavailable and the caller
    should fall back to the date comparator. Both inputs collapse together
    so the freshness classifier never sees a partial signal.
    """
    if not alive:
        return None, None
    pid_result = git.patch_ids_for_range(f"{trunk}..{branch}")
    if isinstance(pid_result, GitCommandFailure):
        return None, None
    absorbed = absorbed_patch_ids_for_branch(git, gt, cwd, branch, trunk=trunk)
    if isinstance(absorbed, AbsorbedSetUnavailable):
        return None, None
    return tuple(pid for _sha, pid in pid_result), absorbed
