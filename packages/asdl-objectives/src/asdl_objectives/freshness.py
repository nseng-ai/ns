"""Snapshot-freshness classifier shared by objective commands.

Objective freshness is deterministic and patch-id based for live branch
snapshots. A branch snapshot is fresh when every content patch in
``trunk..branch`` is present in the effective absorbed set:

``snapshot_absorbed_patch_ids``.

The absorbed set comes from ``<slug>/.absorbed.jsonl``, a machine-owned JSONL
marker written by ``objective-update`` after its evidence triage confirms
that the branch snapshot covers the current branch work. The marker is
cumulative for ``trunk..branch`` and is copied with branch snapshots, so it is
the single source of truth for freshness.

Only non-null ``git patch-id`` values participate in classification. Commits
without content patch IDs are ignored for freshness and retained only as
diagnostic marker records. If patch-id facts or marker parsing are
unavailable for a live branch with content patches, the branch is stale. The
only timestamp classifier left here is for the canonical trunk row, which has
no meaningful ``trunk..trunk`` patch range.
"""

from __future__ import annotations

from typing import Literal

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.absorbed_marker import load_absorbed_marker
from asdl_objectives.discovery import body_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from brmem.gateway import BranchMemoryGateway
from brmem.ref_layout import snapshot_ref_name

ObjectiveSnapshotState = Literal["fresh", "stale"]


def classify_obj_state(
    *,
    alive: bool,
    branch_commit_pids: tuple[str | None, ...] | None,
    absorbed_pids: frozenset[str] | None,
) -> ObjectiveSnapshotState:
    """Classify a snapshot as ``"fresh"`` or ``"stale"``.

    A deleted branch is fresh by definition: its history is frozen, so the
    snapshot can no longer drift. For live branches, freshness is purely
    patch-id based. The branch is fresh iff every content patch-id in
    ``trunk..branch`` is present in the effective absorbed set. ``None``
    patch-ids represent merge, empty, or otherwise non-content-changing
    commits; they are ignored for freshness and recorded only as diagnostics
    in ``.absorbed.jsonl``.
    """
    if not alive:
        return "fresh"
    if branch_commit_pids is not None:
        content_pids = tuple(pid for pid in branch_commit_pids if pid is not None)
        if not content_pids:
            return "fresh"
        if absorbed_pids is None:
            return "stale"
        if all(pid in absorbed_pids for pid in content_pids):
            return "fresh"
        return "stale"
    return "stale"


def classify_timestamp_state(
    *,
    alive: bool,
    snapshot_iso: str | None,
    branch_head_iso: str | None,
) -> ObjectiveSnapshotState:
    """Classify timestamp-only canonical rows that have no branch patch range."""
    if not alive:
        return "fresh"
    if snapshot_iso is None or branch_head_iso is None:
        return "fresh"
    if branch_head_iso > snapshot_iso:
        return "stale"
    return "fresh"


def classify_branch_snapshot(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    branch: str,
    slug: str,
    *,
    trunk: str,
    alive: bool,
) -> ObjectiveSnapshotState:
    """Classify the snapshot freshness for ``branch``'s attach of ``slug``.

    Gathers branch commit patch-ids plus the snapshot marker, then defers to
    :func:`classify_obj_state`. Always returns ``"fresh"`` or ``"stale"``;
    callers map ``alive=False`` to a UI ``"deleted"`` label themselves.
    """
    branch_commit_pids, absorbed_pids = _patch_id_inputs(
        gateway, git, branch, slug=slug, trunk=trunk, alive=alive
    )
    return classify_obj_state(
        alive=alive,
        branch_commit_pids=branch_commit_pids,
        absorbed_pids=absorbed_pids,
    )


def snapshot_last_touched_iso(git: GitGateway, branch: str, slug: str) -> str | None:
    """Return the last-touched timestamp for ``slug``'s ``body.md``."""
    snapshot_ref = snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)
    return git.file_last_touched_iso(snapshot_ref, body_key(slug))


def classify_canonical_freshness(
    git: GitGateway, *, trunk: str, slug: str
) -> ObjectiveSnapshotState:
    """Classify the canonical objective row on ``trunk`` for ``slug``.

    The canonical (master-vs-master) row has no ``trunk..trunk`` patch range,
    so freshness reduces to a timestamp comparison: when the canonical
    ``<slug>/body.md`` was last touched on ``trunk`` versus the trunk HEAD
    timestamp. This answers "should I reconcile?" — the canonical record
    has fallen behind trunk's tip when newer work has landed on trunk
    without rewriting the objective.
    """
    snapshot_iso = snapshot_last_touched_iso(git, trunk, slug)
    branch_head_iso = git.branch_head_iso(trunk)
    return classify_timestamp_state(
        alive=True,
        snapshot_iso=snapshot_iso,
        branch_head_iso=branch_head_iso,
    )


def _patch_id_inputs(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    branch: str,
    *,
    slug: str,
    trunk: str,
    alive: bool,
) -> tuple[tuple[str | None, ...] | None, frozenset[str] | None]:
    """Return ``(branch_commit_pids, effective_absorbed_pids)`` for ``branch``."""
    if not alive:
        return None, None
    pid_result = git.patch_ids_for_range(f"{trunk}..{branch}")
    if isinstance(pid_result, GitCommandFailure):
        return None, None
    marker = load_absorbed_marker(gateway, slug=slug, branch=branch)
    if not marker.ok:
        return tuple(pid for _sha, pid in pid_result), None
    return tuple(pid for _sha, pid in pid_result), marker.patch_ids
