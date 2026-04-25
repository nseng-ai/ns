"""Build the non-Click data model for ``memjective tree``."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRState
from twerk_core.git.git_gateway import GitGateway
from twerk_core.memjective.discovery import MASTER_BRANCH
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE

BranchPrAction = Literal["open", "merged", "closed", "no_pr", "error"]

_STATE_TO_ACTION: dict[PRState, BranchPrAction] = {
    "OPEN": "open",
    "MERGED": "merged",
    "CLOSED": "closed",
}


@dataclass(frozen=True)
class MemjectiveTreePr:
    """Normalized PR observation for a memjective tree branch."""

    action: BranchPrAction
    number: int | None
    state: PRState | None
    title: str | None
    url: str | None
    head_ref_name: str | None
    base_ref_name: str | None
    error_stderr: str | None


@dataclass(frozen=True)
class MemjectiveTreeBranch:
    """A non-root branch carrying a memjective snapshot."""

    branch: str
    stale: bool
    pr: MemjectiveTreePr


@dataclass(frozen=True)
class MemjectiveTreeModel:
    """Branch/PR data for one ``memjective tree`` slug."""

    slug: str
    seed_present: bool
    branches: tuple[MemjectiveTreeBranch, ...]


def build_memjective_tree_model(
    *,
    slug: str,
    brmem_gateway: BranchMemoryGateway,
    git_gateway: GitGateway,
    pr_gateway: PRGateway,
) -> MemjectiveTreeModel:
    """Build deterministic tree data from brmem snapshots and PR observations."""
    all_entries = brmem_gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE)
    slug_entries = [entry for entry in all_entries if entry.key.startswith(f"{slug}/")]

    seed_present = any(entry.branch == MASTER_BRANCH for entry in slug_entries)
    branch_names = sorted({entry.branch for entry in slug_entries if entry.branch != MASTER_BRANCH})
    branches = tuple(
        _build_branch(branch, git_gateway=git_gateway, pr_gateway=pr_gateway)
        for branch in branch_names
    )
    return MemjectiveTreeModel(
        slug=slug,
        seed_present=seed_present,
        branches=branches,
    )


def _build_branch(
    branch: str,
    *,
    git_gateway: GitGateway,
    pr_gateway: PRGateway,
) -> MemjectiveTreeBranch:
    stale = not git_gateway.branch_exists(branch)
    return MemjectiveTreeBranch(
        branch=branch,
        stale=stale,
        pr=_lookup_pr(branch, pr_gateway),
    )


def _lookup_pr(branch: str, pr_gateway: PRGateway) -> MemjectiveTreePr:
    result = pr_gateway.get_pr_for_branch(branch)
    if isinstance(result, PRLookupError):
        if result.returncode == 1:
            return MemjectiveTreePr(
                action="no_pr",
                number=None,
                state=None,
                title=None,
                url=None,
                head_ref_name=None,
                base_ref_name=None,
                error_stderr=None,
            )
        return MemjectiveTreePr(
            action="error",
            number=None,
            state=None,
            title=None,
            url=None,
            head_ref_name=None,
            base_ref_name=None,
            error_stderr=result.stderr or None,
        )
    return MemjectiveTreePr(
        action=_STATE_TO_ACTION[result.state],
        number=result.number,
        state=result.state,
        title=result.title,
        url=result.url,
        head_ref_name=result.head_ref_name,
        base_ref_name=result.base_ref_name,
        error_stderr=None,
    )
