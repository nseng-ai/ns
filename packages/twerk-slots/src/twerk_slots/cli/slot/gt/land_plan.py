from __future__ import annotations

from dataclasses import dataclass

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.gh.types import PRDetails, PRLookupError
from twerk_core.git.types import DetachedHead
from twerk_core.git.types import GitCommandFailure as GitFailure
from twerk_core.gt.types import GtCommandFailure, NoParent, UntrackedBranch
from twerk_slots.cli.slot.gt.context import SlotGtContext


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


def build_land_plan(gt_ctx: SlotGtContext) -> LandPlan:
    slots_ctx = gt_ctx.slots
    match slots_ctx.git.get_current_branch(slots_ctx.repo.root):
        case GitFailure(message=message):
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=f"failed to determine current branch: {message}\nmerge not attempted",
            )
        case DetachedHead():
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=f"HEAD at {slots_ctx.repo.root} is detached\nmerge not attempted",
            )
        case str() as current:
            pass

    match gt_ctx.gt.trunk(slots_ctx.repo.root):
        case GtCommandFailure(message=message):
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=f"failed to determine Graphite trunk: {message}\nmerge not attempted",
            )
        case str() as trunk:
            pass
    Ensure.true(
        current != trunk,
        error_type="guardrail_failed",
        message=f"current branch '{current}' is trunk\nmerge not attempted",
    )

    match gt_ctx.gt.parent_of(slots_ctx.repo.root):
        case UntrackedBranch():
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=(
                    f"current branch '{current}' is not tracked by Graphite\nmerge not attempted"
                ),
            )
        case GtCommandFailure(message=message):
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=f"failed to determine Graphite parent: {message}\nmerge not attempted",
            )
        case NoParent():
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=f"current branch '{current}' has no Graphite parent\nmerge not attempted",
            )
        case str() as parent:
            pass
    Ensure.true(
        parent == trunk,
        error_type="guardrail_failed",
        message=(
            f"current branch '{current}' is not bottom-of-stack; parent is '{parent}'"
            "\nmerge not attempted"
        ),
    )

    match slots_ctx.pr.get_pr_details_for_branch(current):
        case PRLookupError(stderr=stderr):
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=(
                    f"{stderr or f'no pull request found for branch {current!r}'}"
                    "\nmerge not attempted"
                ),
            )
        case PRDetails() as details:
            pass
    pr_failure = _validate_pr_identity(
        details,
        current_branch=current,
        trunk_branch=trunk,
    )
    Ensure.true(
        pr_failure is None,
        error_type="guardrail_failed",
        message=f"{pr_failure}\nmerge not attempted",
    )

    match slots_ctx.git.branch_head_oid(current):
        case GitFailure(message=message):
            Ensure.true(
                False,
                error_type="guardrail_failed",
                message=(
                    f"failed to determine local HEAD for '{current}': {message}"
                    "\nmerge not attempted"
                ),
            )
        case str() as local_head:
            pass
    Ensure.true(
        local_head == details.head_ref_oid,
        error_type="guardrail_failed",
        message=(
            f"local HEAD {local_head} does not match PR head {details.head_ref_oid}"
            "\nmerge not attempted"
        ),
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
