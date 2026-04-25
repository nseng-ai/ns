"""Joiner that turns brmem snapshots, git, PR facts, and stored state into evidence.

Both ``memjective check`` and ``memjective exec compute-pending-entries`` need
the same join: the master-branch root snapshot's tree SHA, every branch
snapshot's tree SHA, the PR observation for that branch (with merge
provenance), and the set of stored ``state.json`` entries that already
reference the same identity. Computing it once here keeps the two commands
projecting from the same bundle and prevents drift over time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRState
from twerk_core.git.git_gateway import GitGateway
from twerk_core.memjective.discovery import MASTER_BRANCH
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE
from twerk_core.memjective.state import (
    MemjectiveState,
    StateAbsent,
    StateInvalid,
    load_state,
)
from twerk_core.memjective.tree_model import (
    BranchPrAction,
    MemjectiveTreeBranch,
    MemjectiveTreeModel,
    build_memjective_tree_model,
)

_ACTION_TO_LOOKUP_STATUS: dict[BranchPrAction, Literal["found", "missing", "error"]] = {
    "open": "found",
    "merged": "found",
    "closed": "found",
    "no_pr": "missing",
    "error": "error",
}


@dataclass(frozen=True)
class RootEvidence:
    """The master-branch root snapshot for ``slug``."""

    namespace: str
    branch: str
    path: str
    exists: bool
    tree_sha: str | None


@dataclass(frozen=True)
class SourceEvidence:
    """The brmem snapshot of ``slug`` on a non-master branch."""

    namespace: str
    branch: str
    path: str
    stale: bool
    tree_sha: str | None


@dataclass(frozen=True)
class PrEvidence:
    """The PR observation for a branch, including merge provenance."""

    lookup_status: Literal["found", "missing", "error"]
    number: int | None
    state: PRState | None
    title: str | None
    url: str | None
    head_ref_name: str | None
    base_ref_name: str | None
    merged_at: str | None
    merge_commit_oid: str | None
    error_stderr: str | None


@dataclass(frozen=True)
class BranchEvidence:
    """A non-root branch's snapshot + PR + stored-state matches."""

    source: SourceEvidence
    pr: PrEvidence
    matching_stored_entry_ids: tuple[str, ...]


@dataclass(frozen=True)
class EvidenceBundle:
    """All evidence needed to render ``check`` or compute pending entries."""

    slug: str
    root: RootEvidence
    state: MemjectiveState | StateAbsent | StateInvalid
    branches: tuple[BranchEvidence, ...]


def compute_evidence(
    *,
    slug: str,
    brmem_gateway: BranchMemoryGateway,
    git_gateway: GitGateway,
    pr_gateway: PRGateway,
) -> EvidenceBundle:
    """Join brmem snapshots, git, PR facts, and stored state into an ``EvidenceBundle``."""
    tree_model = build_memjective_tree_model(
        slug=slug,
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway,
    )
    state = load_state(slug=slug, brmem_gateway=brmem_gateway)

    return EvidenceBundle(
        slug=slug,
        root=_build_root(slug=slug, tree_model=tree_model, brmem_gateway=brmem_gateway),
        state=state,
        branches=tuple(
            _build_branch(
                tree_branch,
                slug=slug,
                state=state,
                brmem_gateway=brmem_gateway,
            )
            for tree_branch in tree_model.branches
        ),
    )


def _build_root(
    *,
    slug: str,
    tree_model: MemjectiveTreeModel,
    brmem_gateway: BranchMemoryGateway,
) -> RootEvidence:
    tree_sha = (
        brmem_gateway.get_tree_sha(MEMJECTIVE_NAMESPACE, MASTER_BRANCH, slug)
        if tree_model.seed_present
        else None
    )
    return RootEvidence(
        namespace=MEMJECTIVE_NAMESPACE,
        branch=MASTER_BRANCH,
        path=slug,
        exists=tree_model.seed_present,
        tree_sha=tree_sha,
    )


def _build_branch(
    tree_branch: MemjectiveTreeBranch,
    *,
    slug: str,
    state: MemjectiveState | StateAbsent | StateInvalid,
    brmem_gateway: BranchMemoryGateway,
) -> BranchEvidence:
    lookup_status = _ACTION_TO_LOOKUP_STATUS[tree_branch.pr.action]
    source = SourceEvidence(
        namespace=MEMJECTIVE_NAMESPACE,
        branch=tree_branch.branch,
        path=slug,
        stale=tree_branch.stale,
        tree_sha=brmem_gateway.get_tree_sha(MEMJECTIVE_NAMESPACE, tree_branch.branch, slug),
    )
    pr = PrEvidence(
        lookup_status=lookup_status,
        number=tree_branch.pr.number,
        state=tree_branch.pr.state,
        title=tree_branch.pr.title,
        url=tree_branch.pr.url,
        head_ref_name=tree_branch.pr.head_ref_name,
        base_ref_name=tree_branch.pr.base_ref_name,
        merged_at=tree_branch.pr.merged_at,
        merge_commit_oid=tree_branch.pr.merge_commit_oid,
        error_stderr=tree_branch.pr.error_stderr,
    )
    matching_ids = _matching_stored_entry_ids(
        branch_name=tree_branch.branch,
        pr_number=tree_branch.pr.number if lookup_status == "found" else None,
        state=state,
    )
    return BranchEvidence(
        source=source,
        pr=pr,
        matching_stored_entry_ids=matching_ids,
    )


def _matching_stored_entry_ids(
    *,
    branch_name: str,
    pr_number: int | None,
    state: MemjectiveState | StateAbsent | StateInvalid,
) -> tuple[str, ...]:
    if not isinstance(state, MemjectiveState):
        return ()
    matches: list[str] = []
    branch_id = f"branch-{branch_name}"
    pr_id = f"pr-{pr_number}" if pr_number is not None else None
    for entry in state.entries:
        if pr_id is not None and entry.id == pr_id:
            matches.append(entry.id)
            continue
        if entry.id == branch_id:
            matches.append(entry.id)
    return tuple(matches)
