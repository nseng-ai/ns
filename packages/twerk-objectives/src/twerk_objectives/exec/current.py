"""``objective exec current`` — branch + stack orientation digest.

Read-only ``where am I?`` snapshot for the ``objective-current`` skill: the
current branch (claimed objective + freshness, PR, brmem entries), the
graphite downstack walk to trunk (parents only), and the immediate upstack
children. Pure facts; the skill owns rendering and any judgment.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from brmem.gateway import BranchMemoryGateway, snapshot_ref_name
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.gt.gateway import GtGateway
from twerk_core.gt.types import GtCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import MASTER_BRANCH, body_key, slug_for_key
from twerk_objectives.freshness import ObjectiveSnapshotState, classify_obj_state
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE

_PREVIEW_CHAR_LIMIT = 80


@dataclass(frozen=True)
class ObjectiveCurrentRequest:
    pass


@dataclass(frozen=True)
class ObjectiveSummary(JsonSerializable):
    slug: str
    obj_state: ObjectiveSnapshotState
    body_last_touched: str | None
    branch_head_iso: str | None
    branch_max_author_iso: str | None


@dataclass(frozen=True)
class PRBlock(JsonSerializable):
    number: int
    state: str
    title: str
    url: str


@dataclass(frozen=True)
class BrmemEntryBlock(JsonSerializable):
    namespace: str | None
    key: str
    size: int
    preview: str


@dataclass(frozen=True)
class CurrentBranchBlock(JsonSerializable):
    branch: str
    objective: ObjectiveSummary | None
    objectives_extra: tuple[str, ...]
    pr: PRBlock | None
    pr_error: str | None
    brmem: tuple[BrmemEntryBlock, ...]


@dataclass(frozen=True)
class StackEntry(JsonSerializable):
    branch: str
    objective: ObjectiveSummary | None
    objectives_extra: tuple[str, ...]
    pr: PRBlock | None
    pr_error: str | None
    deleted: bool


@dataclass(frozen=True)
class ObjectiveCurrentResult(JsonSerializable):
    current_branch: str | None
    detached_head: bool
    trunk: str
    is_trunk: bool
    current: CurrentBranchBlock | None
    downstack: tuple[StackEntry, ...]
    upstack: tuple[StackEntry, ...]
    warnings: tuple[str, ...]


@clinkr_operation(
    name="current",
    help=(
        "Emit a JSON ``where am I?`` digest for the ``objective-current`` "
        "skill. Reports the current branch's claimed objective + freshness, "
        "PR, brmem entries, the trunk-first downstack walk to trunk, and "
        "immediate upstack children. Pure facts; the skill owns rendering."
    ),
)
def run_current_objective(
    ctx: click.Context,
    request: ObjectiveCurrentRequest,
) -> ClinkrExit[ObjectiveCurrentResult]:
    del request
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    cwd = Path.cwd()
    warnings: list[str] = []

    branch_or_failure = mctx.git_gateway.get_current_branch(cwd)
    if isinstance(branch_or_failure, GitCommandFailure):
        return ClinkrExit.failure(
            error_type="git_failed",
            message=branch_or_failure.message,
        )

    if isinstance(branch_or_failure, DetachedHead):
        trunk = _resolve_trunk(mctx.gt_gateway, cwd, warnings)
        return ClinkrExit.ok(
            ObjectiveCurrentResult(
                current_branch=None,
                detached_head=True,
                trunk=trunk,
                is_trunk=False,
                current=None,
                downstack=(),
                upstack=(),
                warnings=tuple(warnings),
            )
        )

    current_branch = branch_or_failure
    stack_result = mctx.gt_gateway.stack(cwd)
    if isinstance(stack_result, GtCommandFailure):
        warnings.append(f"gt_failed: {stack_result.message}")
        trunk = _resolve_trunk(mctx.gt_gateway, cwd, warnings)
        ancestors: tuple[str, ...] = ()
        children: tuple[str, ...] = ()
    else:
        trunk = stack_result.trunk
        ancestors = stack_result.ancestors
        children = stack_result.children
        for warning in stack_result.warnings:
            warnings.append(f"gt_log: {warning}")

    current_block = _build_current_block(
        mctx.brmem_gateway,
        mctx.git_gateway,
        mctx.pr_gateway,
        current_branch,
    )
    downstack = tuple(
        _build_stack_entry(mctx.brmem_gateway, mctx.git_gateway, mctx.pr_gateway, branch)
        for branch in ancestors
    )
    upstack = tuple(
        _build_stack_entry(mctx.brmem_gateway, mctx.git_gateway, mctx.pr_gateway, branch)
        for branch in children
    )

    return ClinkrExit.ok(
        ObjectiveCurrentResult(
            current_branch=current_branch,
            detached_head=False,
            trunk=trunk,
            is_trunk=current_branch == trunk,
            current=current_block,
            downstack=downstack,
            upstack=upstack,
            warnings=tuple(warnings),
        )
    )


def _resolve_trunk(gt: GtGateway, cwd: Path, warnings: list[str]) -> str:
    """Return graphite's trunk; fall back to ``MASTER_BRANCH`` on failure."""
    result = gt.trunk(cwd)
    if isinstance(result, GtCommandFailure):
        warnings.append(f"gt_trunk_failed: {result.message}")
        return MASTER_BRANCH
    return result


def _build_objective_summary(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    branch: str,
    *,
    alive: bool,
) -> tuple[ObjectiveSummary | None, tuple[str, ...]]:
    slugs = sorted(
        {
            slug_for_key(entry.key)
            for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
        }
    )
    if not slugs:
        return None, ()
    primary, *extras = slugs
    snapshot_ref = snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, body_key(primary))
    branch_head_iso = git.branch_head_iso(branch) if alive else None
    branch_max_author_iso = _max_author_iso(git, branch) if alive else None
    obj_state = classify_obj_state(
        alive=alive,
        snapshot_iso=body_last_touched,
        branch_max_author_iso=branch_max_author_iso,
    )
    summary = ObjectiveSummary(
        slug=primary,
        obj_state=obj_state,
        body_last_touched=body_last_touched,
        branch_head_iso=branch_head_iso,
        branch_max_author_iso=branch_max_author_iso,
    )
    return summary, tuple(extras)


def _max_author_iso(git: GitGateway, branch: str) -> str | None:
    """Return the latest author timestamp on ``master..branch``, or ``None``.

    Author time (``%aI``) is preserved by ``gt restack``; committer time
    (``%cI``) is rewritten. Using author time keeps current's freshness
    signal aligned with digest and resilient to no-op restacks.
    """
    result = git.log_range(f"{MASTER_BRANCH}..{branch}")
    if isinstance(result, GitCommandFailure):
        return None
    return max((c.author_iso for c in result), default=None)


def _build_pr_block(
    pr_result: PRSummary | PRLookupError,
) -> tuple[PRBlock | None, str | None]:
    if isinstance(pr_result, PRSummary):
        block = PRBlock(
            number=pr_result.number,
            state=pr_result.state,
            title=pr_result.title,
            url=pr_result.url,
        )
        return block, None
    # returncode == 1 is "no PR found" — expected for branches without one;
    # other codes are real failures worth surfacing.
    error = pr_result.stderr if pr_result.returncode != 1 else None
    return None, error


def _preview(content: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped[:_PREVIEW_CHAR_LIMIT]
    return ""


def _build_brmem_listing(gateway: BranchMemoryGateway, branch: str) -> tuple[BrmemEntryBlock, ...]:
    entries = gateway.list_entries(branch=branch)
    blocks: list[BrmemEntryBlock] = []
    for entry in entries:
        content = gateway.get(entry.namespace, entry.key, branch) or ""
        blocks.append(
            BrmemEntryBlock(
                namespace=entry.namespace,
                key=entry.key,
                size=len(content),
                preview=_preview(content),
            )
        )
    blocks.sort(key=lambda b: (b.namespace or "", b.key))
    return tuple(blocks)


def _build_current_block(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    pr_gateway: PRGateway,
    branch: str,
) -> CurrentBranchBlock:
    objective, extras = _build_objective_summary(gateway, git, branch, alive=True)
    pr_block, pr_error = _build_pr_block(pr_gateway.get_pr_for_branch(branch))
    brmem_listing = _build_brmem_listing(gateway, branch)
    return CurrentBranchBlock(
        branch=branch,
        objective=objective,
        objectives_extra=extras,
        pr=pr_block,
        pr_error=pr_error,
        brmem=brmem_listing,
    )


def _build_stack_entry(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    pr_gateway: PRGateway,
    branch: str,
) -> StackEntry:
    alive = git.branch_exists(branch)
    objective, extras = _build_objective_summary(gateway, git, branch, alive=alive)
    pr_block, pr_error = _build_pr_block(pr_gateway.get_pr_for_branch(branch))
    return StackEntry(
        branch=branch,
        objective=objective,
        objectives_extra=extras,
        pr=pr_block,
        pr_error=pr_error,
        deleted=not alive,
    )
