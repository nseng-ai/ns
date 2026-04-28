from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.gh.types import PRDetails, PRLookupError
from twerk_core.git.types import DetachedHead
from twerk_core.git.types import GitCommandFailure as GitFailure
from twerk_core.gt.types import GtCommandFailure, NoParent, UntrackedBranch
from twerk_slots.cli.slot.gt.context import SlotGtContext

if TYPE_CHECKING:
    from twerk_slots.cli.slot.gt.land import SlotGtLandResult


@dataclass(frozen=True)
class LandPlan(JsonSerializable):
    repo_root: str
    current_worktree: str
    current_branch: str
    trunk_branch: str
    parent_branch: str
    pr_number: int
    pr_head_oid: str
    pr_head_ref_name: str
    pr_base_ref_name: str


def guardrail_failure(message: str) -> ClinkrExit[SlotGtLandResult]:
    return ClinkrExit.failure(
        error_type="guardrail_failed",
        message=f"{message}\nmerge not attempted",
    )


def _validate_pr_identity(
    details: PRDetails,
    *,
    current_branch: str,
    trunk_branch: str,
) -> str | None:
    if details.head_ref_name != current_branch:
        return (
            f"PR #{details.number} head ref is '{details.head_ref_name}', "
            f"not current branch '{current_branch}'"
        )
    if details.base_ref_name != trunk_branch:
        return (
            f"PR #{details.number} base ref is '{details.base_ref_name}', "
            f"not trunk '{trunk_branch}'"
        )
    return None


def build_land_plan(gt_ctx: SlotGtContext) -> LandPlan | ClinkrExit[SlotGtLandResult]:
    slots_ctx = gt_ctx.slots
    match slots_ctx.git.get_current_branch(slots_ctx.repo.root):
        case GitFailure(message=message):
            return guardrail_failure(f"failed to determine current branch: {message}")
        case DetachedHead():
            return guardrail_failure(f"HEAD at {slots_ctx.repo.root} is detached")
        case str() as current:
            pass

    match gt_ctx.gt.trunk(slots_ctx.repo.root):
        case GtCommandFailure(message=message):
            return guardrail_failure(f"failed to determine Graphite trunk: {message}")
        case str() as trunk:
            pass
    if current == trunk:
        return guardrail_failure(f"current branch '{current}' is trunk")

    match gt_ctx.gt.parent_of(slots_ctx.repo.root):
        case UntrackedBranch():
            return guardrail_failure(f"current branch '{current}' is not tracked by Graphite")
        case GtCommandFailure(message=message):
            return guardrail_failure(f"failed to determine Graphite parent: {message}")
        case NoParent():
            return guardrail_failure(f"current branch '{current}' has no Graphite parent")
        case str() as parent:
            pass
    if parent != trunk:
        return guardrail_failure(
            f"current branch '{current}' is not bottom-of-stack; parent is '{parent}'"
        )

    match slots_ctx.pr.get_pr_details_for_branch(current):
        case PRLookupError(stderr=stderr):
            return guardrail_failure(stderr or f"no pull request found for branch '{current}'")
        case PRDetails() as details:
            pass
    pr_failure = _validate_pr_identity(
        details,
        current_branch=current,
        trunk_branch=trunk,
    )
    if pr_failure is not None:
        return guardrail_failure(pr_failure)

    match slots_ctx.git.branch_head_oid(current):
        case GitFailure(message=message):
            return guardrail_failure(f"failed to determine local HEAD for '{current}': {message}")
        case str() as local_head:
            pass
    if local_head != details.head_ref_oid:
        return guardrail_failure(
            f"local HEAD {local_head} does not match PR head {details.head_ref_oid}"
        )

    return LandPlan(
        repo_root=str(slots_ctx.repo.main_repo_root),
        current_worktree=str(slots_ctx.repo.root),
        current_branch=current,
        trunk_branch=trunk,
        parent_branch=parent,
        pr_number=details.number,
        pr_head_oid=details.head_ref_oid,
        pr_head_ref_name=details.head_ref_name,
        pr_base_ref_name=details.base_ref_name,
    )
