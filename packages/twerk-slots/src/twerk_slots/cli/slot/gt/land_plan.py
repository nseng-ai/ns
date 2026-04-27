from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.gh.types import PRCheck, PRCommandError, PRDetails, PRLookupError
from twerk_core.git.types import DetachedHead
from twerk_core.git.types import GitCommandFailure as GitFailure
from twerk_slots.allocation import (
    find_assignment_by_slot,
    sync_pool_assignments,
)
from twerk_slots.cli.slot.gt.context import SlotGtContext
from twerk_slots.cli.slot.gt.navigation import (
    WorktreeTarget,
    find_worktree_for_branch,
)
from twerk_slots.cli.slot.gt.types import GtCommandFailure, NoParent, UntrackedBranch
from twerk_slots.context import SlotsCliContext
from twerk_slots.pool_state import PoolState

if TYPE_CHECKING:
    from twerk_slots.cli.slot.gt.land import SlotGtLandResult

# Cap on parent-walk depth when classifying descendants of the current branch.
# A real Graphite stack should never come close; 32 catches metadata loops.
MAX_PARENT_HOPS = 32


@dataclass(frozen=True)
class LandDescendant(JsonSerializable):
    slot_name: str | None
    branch_name: str
    worktree_path: str


@dataclass(frozen=True)
class LandNavigation(JsonSerializable):
    slot_name: str | None
    branch_name: str
    worktree_path: str
    cd_command: str


@dataclass(frozen=True)
class LandPlan(JsonSerializable):
    repo_root: str
    current_worktree: str
    current_branch: str
    current_slot_name: str | None
    trunk_branch: str
    parent_branch: str
    pr_number: int
    pr_head_oid: str
    pr_head_ref_name: str
    pr_base_ref_name: str
    immediate_children: tuple[str, ...]
    affected_descendants: tuple[LandDescendant, ...]
    trunk_worktree: str | None
    final_navigation: LandNavigation | None


def guardrail_failure(message: str) -> ClinkrExit[SlotGtLandResult]:
    return ClinkrExit.failure(
        error_type="guardrail_failed",
        message=f"{message}\nmerge not attempted",
    )


def _state_for_slots(slots_ctx: SlotsCliContext) -> PoolState | None:
    if not slots_ctx.pool_state.exists():
        return None
    state = slots_ctx.pool_state.load()
    return sync_pool_assignments(state, slots_ctx.git, slots_ctx.storage, slots_ctx.pool_state)


def _current_slot_name(state: PoolState | None, current_branch: str) -> str | None:
    if state is None:
        return None
    for assignment in state.assignments:
        if assignment.branch_name == current_branch:
            return assignment.slot_name
    return None


def _branch_targets(
    slots_ctx: SlotsCliContext,
    state: PoolState | None,
) -> dict[str, WorktreeTarget]:
    targets: dict[str, WorktreeTarget] = {}
    if state is not None:
        for assignment in state.assignments:
            if slots_ctx.storage.path_exists(assignment.worktree_path):
                targets[assignment.branch_name] = WorktreeTarget(
                    slot_name=assignment.slot_name,
                    branch_name=assignment.branch_name,
                    worktree_path=assignment.worktree_path,
                )

    for worktree in slots_ctx.git.list_worktrees():
        if worktree.branch is None:
            continue
        targets.setdefault(
            worktree.branch,
            WorktreeTarget(
                slot_name=None,
                branch_name=worktree.branch,
                worktree_path=worktree.path,
            ),
        )
    return targets


def _descendants_or_failure(
    gt_ctx: SlotGtContext,
    *,
    current_branch: str,
    trunk_branch: str,
    branch_targets: dict[str, WorktreeTarget],
) -> tuple[LandDescendant, ...] | GtCommandFailure:
    descendants: list[LandDescendant] = []
    for candidate, target in branch_targets.items():
        if candidate in {current_branch, trunk_branch}:
            continue
        cursor = candidate
        cursor_target = target
        for _ in range(MAX_PARENT_HOPS):
            match gt_ctx.gt.parent_of(cursor_target.worktree_path):
                case GtCommandFailure() as failure:
                    return failure
                case UntrackedBranch(message=message):
                    return GtCommandFailure(message=message, returncode=None)
                case NoParent():
                    break
                case str() as parent:
                    pass
            if parent == current_branch:
                descendants.append(
                    LandDescendant(
                        slot_name=target.slot_name,
                        branch_name=candidate,
                        worktree_path=str(target.worktree_path),
                    )
                )
                break
            if parent == trunk_branch:
                break
            if parent not in branch_targets:
                return GtCommandFailure(
                    message=(
                        f"Cannot classify branch '{candidate}': parent '{parent}' is not "
                        "checked out in any known worktree."
                    ),
                    returncode=None,
                )
            cursor = parent
            cursor_target = branch_targets[cursor]
        else:
            return GtCommandFailure(
                message=(
                    f"Cannot classify branch '{candidate}': "
                    f"parent chain exceeded {MAX_PARENT_HOPS} hops."
                ),
                returncode=None,
            )
    return tuple(descendants)


def _checks_guardrail(
    checks: tuple[PRCheck, ...],
    *,
    auto: bool,
) -> str | None:
    bad = tuple(check for check in checks if check.bucket != "pass")
    if not bad:
        return None
    if auto and all(check.bucket == "pending" for check in bad):
        return None
    details = ", ".join(f"{check.name}={check.bucket}" for check in bad)
    if all(check.bucket == "pending" for check in bad):
        return f"checks pending ({details}); use --auto if you want GitHub to merge when ready"
    return f"required checks are not passing ({details})"


def _land_navigation_for_target(target: WorktreeTarget) -> LandNavigation:
    return LandNavigation(
        slot_name=target.slot_name,
        branch_name=target.branch_name,
        worktree_path=str(target.worktree_path),
        cd_command=f"cd {target.worktree_path}",
    )


def _planned_navigation(
    slots_ctx: SlotsCliContext,
    *,
    up: bool,
    down: bool,
    parent_branch: str,
    immediate_children: tuple[str, ...],
) -> LandNavigation | None:
    if up:
        if len(immediate_children) != 1:
            return None
        target = find_worktree_for_branch(slots_ctx, immediate_children[0])
        if target is None:
            return None
        return _land_navigation_for_target(target)
    if down:
        target = find_worktree_for_branch(slots_ctx, parent_branch)
        if target is None:
            return None
        return _land_navigation_for_target(target)
    return None


def _validate_pr_details(
    details: PRDetails,
    *,
    current_branch: str,
    trunk_branch: str,
    auto: bool,
) -> str | None:
    if details.state != "OPEN":
        return f"PR #{details.number} is {details.state}, not OPEN"
    if details.is_draft:
        return f"PR #{details.number} is a draft"
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
    if details.mergeable == "CONFLICTING":
        return f"PR #{details.number} has merge conflicts (mergeable=CONFLICTING)"
    if details.mergeable == "UNKNOWN":
        return f"PR #{details.number} mergeability is still being computed; retry shortly"

    bad_states = {"DIRTY", "BLOCKED", "DRAFT", "UNKNOWN"}
    status = details.merge_state_status
    if status in bad_states:
        return f"PR #{details.number} merge state is {status}"
    if status == "BEHIND" and not auto:
        return f"PR #{details.number} is BEHIND trunk; rebase or pass --auto"
    return None


def build_land_plan(
    gt_ctx: SlotGtContext,
    *,
    up: bool,
    down: bool,
    no_free_slot: bool,
    no_checks: bool,
    auto: bool,
) -> LandPlan | ClinkrExit[SlotGtLandResult]:
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

    if slots_ctx.git.has_uncommitted_changes(slots_ctx.repo.root):
        return guardrail_failure(
            f"current worktree at {slots_ctx.repo.root} has uncommitted changes"
        )

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
    pr_failure = _validate_pr_details(
        details,
        current_branch=current,
        trunk_branch=trunk,
        auto=auto,
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

    if not no_checks:
        match slots_ctx.pr.get_required_checks(details.number):
            case PRCommandError(stderr=stderr, returncode=returncode):
                return guardrail_failure(stderr or f"gh pr checks exited {returncode}")
            case tuple() as checks:
                pass
        checks_failure = _checks_guardrail(checks, auto=auto)
        if checks_failure is not None:
            return guardrail_failure(checks_failure)

    match gt_ctx.gt.children_of(slots_ctx.repo.root):
        case UntrackedBranch():
            return guardrail_failure(f"current branch '{current}' is not tracked by Graphite")
        case GtCommandFailure(message=message):
            return guardrail_failure(f"failed to determine Graphite children: {message}")
        case tuple() as children:
            pass

    state = _state_for_slots(slots_ctx)
    branch_targets = _branch_targets(slots_ctx, state)
    match _descendants_or_failure(
        gt_ctx,
        current_branch=current,
        trunk_branch=trunk,
        branch_targets=branch_targets,
    ):
        case GtCommandFailure(message=message):
            return guardrail_failure(message)
        case tuple() as descendants:
            pass

    for descendant in descendants:
        path = Path(descendant.worktree_path)
        if slots_ctx.git.has_uncommitted_changes(path):
            return guardrail_failure(
                f"affected descendant '{descendant.branch_name}' at {path} has uncommitted changes"
            )

    current_slot_name = _current_slot_name(state, current)
    if not no_free_slot and current_slot_name is not None:
        assert state is not None
        assignment = find_assignment_by_slot(state, current_slot_name)
        if assignment is None:
            return guardrail_failure(f"{current_slot_name} is no longer assigned")
        if slots_ctx.git.has_uncommitted_changes(assignment.worktree_path):
            return guardrail_failure(
                f"{current_slot_name} has uncommitted changes at {assignment.worktree_path}"
            )

    trunk_target = find_worktree_for_branch(slots_ctx, trunk)
    planned_navigation = _planned_navigation(
        slots_ctx,
        up=up,
        down=down,
        parent_branch=parent,
        immediate_children=children,
    )
    return LandPlan(
        repo_root=str(slots_ctx.repo.main_repo_root),
        current_worktree=str(slots_ctx.repo.root),
        current_branch=current,
        current_slot_name=current_slot_name,
        trunk_branch=trunk,
        parent_branch=parent,
        pr_number=details.number,
        pr_head_oid=details.head_ref_oid,
        pr_head_ref_name=details.head_ref_name,
        pr_base_ref_name=details.base_ref_name,
        immediate_children=children,
        affected_descendants=descendants,
        trunk_worktree=str(trunk_target.worktree_path) if trunk_target is not None else None,
        final_navigation=planned_navigation,
    )
