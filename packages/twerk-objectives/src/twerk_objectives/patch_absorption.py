"""Patch-id absorption helpers for objective freshness.

Given a branch and the gt stack snapshot around it, compute the set of
``git patch-id``s contained on any strict downstack ancestor (excluding
trunk and the branch itself). The freshness comparator uses this to decide
whether the branch's own commits are absorbed by ancestor stacks, which is
common in Graphite workflows where ``gt restack`` rolls downstack work into
upstack branches without adding net-new content.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import GitCommandFailure
from twerk_core.gt.gateway import GtGateway
from twerk_core.gt.types import GtCommandFailure
from twerk_objectives.absorbed_marker import AbsorbedMarker


@dataclass(frozen=True)
class AbsorbedSetUnavailable:
    """The absorbed patch-id set could not be computed."""

    reason: str


def absorbed_patch_ids_for_branch(
    git: GitGateway,
    gt: GtGateway,
    cwd: Path,
    branch: str,
    *,
    trunk: str,
) -> frozenset[str] | AbsorbedSetUnavailable:
    """Return the union of ``trunk..ancestor`` patch-ids across downstack ancestors.

    ``trunk`` is taken from the caller so the patch-id range stays aligned
    with the Graphite stack being evaluated. Ancestors equal to ``trunk`` or
    ``branch`` are filtered out. Any ``gt`` or ``git`` failure along the way
    collapses to :class:`AbsorbedSetUnavailable`; callers decide whether that
    means stale, degraded diagnostics, or a hard command failure.
    """
    stack_result = gt.stack(cwd)
    if isinstance(stack_result, GtCommandFailure):
        return AbsorbedSetUnavailable(reason=f"gt_failed: {stack_result.message}")

    ancestors = tuple(a for a in stack_result.ancestors if a not in (trunk, branch))
    pids: set[str] = set()
    for ancestor in ancestors:
        result = git.patch_ids_for_range(f"{trunk}..{ancestor}")
        if isinstance(result, GitCommandFailure):
            return AbsorbedSetUnavailable(
                reason=f"git_failed: {result.message}",
            )
        for _sha, pid in result:
            if pid is not None:
                pids.add(pid)
    return frozenset(pids)


def effective_absorbed_patch_ids(
    *,
    marker: AbsorbedMarker,
    downstack_pids: frozenset[str] | None,
) -> frozenset[str] | None:
    """Combine marker and downstack absorption, or return ``None`` if unsafe."""
    if not marker.ok:
        return None
    return marker.patch_ids | (downstack_pids or frozenset())
