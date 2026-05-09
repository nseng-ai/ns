"""``objective exec current`` — render the orientation brief for ``objective-current``.

Tightly coupled to the ``objective-current`` skill: emits a single
self-contained Markdown brief covering the current branch's attached
objective + snapshot state, PR, brmem entries, and trunk relation. The skill
simply runs this command and prints the output verbatim. The machine JSON
contract also exposes structured branch/objective fields so extensions do
not need to infer status from rendered Markdown.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRLookupError, PRSummary
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.snapshot_state import (
    ObjectiveSnapshotState,
    classify_branch_snapshot_state,
    classify_canonical_snapshot_state,
)
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway

_PREVIEW_CHAR_LIMIT = 80

TrunkRowState = Literal["up-to-date", "stale", "missing_on_master"]


class ObjectiveCurrentRequest(ClinkrModel):
    pass


ObjectiveKind = Literal["attached", "none"]
StatusBadgeKind = Literal["objective", "none"]


class CurrentObjectiveStatus(ClinkrModel):
    kind: ObjectiveKind
    slug: str | None = None
    state: ObjectiveSnapshotState | None = None


class CurrentStatusBadge(ClinkrModel):
    kind: StatusBadgeKind
    slug: str | None = None


class CurrentPrompt(ClinkrModel):
    prompt: str
    current_branch: str | None
    trunk_branch: str
    objective: CurrentObjectiveStatus
    status_badge: CurrentStatusBadge


@dataclass(frozen=True)
class _ObjectiveSummary:
    slug: str
    obj_state: ObjectiveSnapshotState


@dataclass(frozen=True)
class _TrunkObjectiveSummary:
    """Trunk-row label for the current branch's in-scope slug.

    Distinct from :class:`_ObjectiveSummary` because the trunk row carries a
    third state — ``missing_on_master`` — that does not exist for live branch
    snapshots, and its ``up-to-date``/``stale`` labels reflect master-vs-master
    canonical snapshot state rather than ``trunk..branch`` patch coverage.
    """

    slug: str
    state: TrunkRowState


@dataclass(frozen=True)
class _PRBlock:
    number: int
    state: str
    title: str
    url: str


@dataclass(frozen=True)
class _BrmemEntryBlock:
    namespace: str | None
    key: str
    size: int
    preview: str


@dataclass(frozen=True)
class _CurrentBranchBlock:
    branch: str
    objective: _ObjectiveSummary | None
    objectives_extra: tuple[str, ...]
    pr: _PRBlock | None
    pr_error: str | None
    brmem: tuple[_BrmemEntryBlock, ...]


@dataclass(frozen=True)
class _StackEntry:
    branch: str
    objective: _ObjectiveSummary | None
    pr: _PRBlock | None
    pr_error: str | None
    deleted: bool


@dataclass(frozen=True)
class _TrunkRow:
    """Trunk row in the stack map (always at depth 0).

    Rendered with the current branch's in-scope slug rather than master's
    full canonical registry, so an agent reading the stack map is not
    walked toward maintenance work on slugs it is not engaged with. When
    the current branch attaches no slug (or is itself the trunk), the trunk
    row is bare. When the current branch attaches slug ``X``, the trunk row
    is labeled with ``X`` and either master-vs-master canonical snapshot state
    or ``missing on master``.
    """

    branch: str
    pr: _PRBlock | None
    pr_error: str | None
    in_scope: _TrunkObjectiveSummary | None


def render_current_prompt(result: CurrentPrompt) -> None:
    click.echo(result.prompt, nl=False)


@clinkr_operation(
    name="current",
    help=(
        "Render the orientation brief for `objective-current`. The CLI "
        "pre-computes every fact about the current branch (objective + "
        "snapshot state, PR, brmem entries, and trunk relation) and emits the "
        "final Markdown directly. The skill prints the output verbatim."
    ),
    human_renderer=render_current_prompt,
)
def run_current_objective(
    ctx: click.Context,
    request: ObjectiveCurrentRequest,
) -> ClinkrExit[CurrentPrompt]:
    del request
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    warnings: list[str] = []
    cwd = Path.cwd()

    branch_or_failure = mctx.git_gateway.get_current_branch(cwd)
    if isinstance(branch_or_failure, GitCommandFailure):
        Ensure.fail(
            error_type="git_failed",
            message=branch_or_failure.message,
        )

    if isinstance(branch_or_failure, DetachedHead):
        trunk = resolve_trunk(mctx.git_gateway).trunk
        prompt = _build_current_prompt(
            detached_head=True,
            trunk=trunk,
            current=None,
            trunk_row=None,
            downstack=(),
            upstack=(),
            warnings=tuple(warnings),
        )
        return ClinkrExit.ok(
            CurrentPrompt(
                prompt=prompt,
                current_branch=None,
                trunk_branch=trunk,
                objective=CurrentObjectiveStatus(kind="none"),
                status_badge=CurrentStatusBadge(kind="none"),
            )
        )

    current_branch = branch_or_failure
    trunk = resolve_trunk(mctx.git_gateway).trunk
    # A3 / objective-current scope: current-branch orientation only. The
    # downstack ancestor / upstack children walk is not implemented; leave
    # these tuples empty until a true stack walker is reintroduced.
    ancestors: tuple[str, ...] = ()
    children: tuple[str, ...] = ()

    current_block = _build_current_block(
        mctx.brmem_gateway,
        mctx.git_gateway,
        mctx.pr_gateway,
        current_branch,
        trunk,
    )
    in_scope_slug = _resolve_in_scope_slug(current_block, trunk=trunk)
    trunk_row = _build_trunk_row(
        mctx.brmem_gateway,
        mctx.git_gateway,
        mctx.pr_gateway,
        trunk=trunk,
        in_scope_slug=in_scope_slug,
        current_block=current_block,
    )
    downstack = tuple(
        _build_stack_entry(
            mctx.brmem_gateway,
            mctx.git_gateway,
            mctx.pr_gateway,
            branch,
            trunk,
        )
        for branch in ancestors
    )
    upstack = tuple(
        _build_stack_entry(
            mctx.brmem_gateway,
            mctx.git_gateway,
            mctx.pr_gateway,
            branch,
            trunk,
        )
        for branch in children
    )

    prompt = _build_current_prompt(
        detached_head=False,
        trunk=trunk,
        current=current_block,
        trunk_row=trunk_row,
        downstack=downstack,
        upstack=upstack,
        warnings=tuple(warnings),
    )
    return ClinkrExit.ok(
        CurrentPrompt(
            prompt=prompt,
            current_branch=current_branch,
            trunk_branch=trunk,
            objective=_build_current_objective_status(current_block, trunk=trunk),
            status_badge=_build_current_status_badge(current_block, trunk=trunk),
        )
    )


def _build_objective_summary(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    branch: str,
    trunk: str,
    *,
    alive: bool,
) -> tuple[_ObjectiveSummary | None, tuple[str, ...]]:
    slugs = sorted(
        {
            slug_for_key(entry.key)
            for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
        }
    )
    if not slugs:
        return None, ()
    primary, *extras = slugs
    obj_state = classify_branch_snapshot_state(
        gateway,
        git,
        branch,
        primary,
        trunk=trunk,
        alive=alive,
    )
    summary = _ObjectiveSummary(slug=primary, obj_state=obj_state)
    return summary, tuple(extras)


def _resolve_in_scope_slug(
    current_block: _CurrentBranchBlock,
    *,
    trunk: str,
) -> str | None:
    """Return the current branch's single attached slug, or ``None``.

    A "attach" means the current branch carries exactly one slug. Multiple
    slugs on the current branch are registry-shaped (master's full
    canonical set, or a rare multi-attachment feature branch) and yield
    ``None`` so the trunk row stays bare instead of being labeled with an
    arbitrary alphabetical-first slug. ``trunk`` is unused today — it is
    accepted so future stack-walking changes can refine the rule without
    a signature churn.
    """
    del trunk  # reserved for future stack-walking refinements
    if current_block.objective is None:
        return None
    if current_block.objectives_extra:
        return None
    return current_block.objective.slug


def _build_current_objective_status(
    current_block: _CurrentBranchBlock,
    *,
    trunk: str,
) -> CurrentObjectiveStatus:
    slug = _resolve_in_scope_slug(current_block, trunk=trunk)
    if slug is None or current_block.objective is None:
        return CurrentObjectiveStatus(kind="none")
    return CurrentObjectiveStatus(
        kind="attached",
        slug=slug,
        state=current_block.objective.obj_state,
    )


def _build_current_status_badge(
    current_block: _CurrentBranchBlock,
    *,
    trunk: str,
) -> CurrentStatusBadge:
    slug = _resolve_in_scope_slug(current_block, trunk=trunk)
    if slug is None:
        return CurrentStatusBadge(kind="none")
    return CurrentStatusBadge(kind="objective", slug=slug)


def _build_trunk_row(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    pr_gateway: PRGateway,
    *,
    trunk: str,
    in_scope_slug: str | None,
    current_block: _CurrentBranchBlock | None,
) -> _TrunkRow:
    """Build the trunk row using ``in_scope_slug`` for its label.

    The trunk row label reflects the current branch's attach — not master's
    full registry — so an agent reading the stack map is not walked toward
    maintenance work on slugs it is not working on. When the current
    branch is itself the trunk we reuse ``current_block``'s PR lookup to
    avoid a redundant gateway round-trip.
    """
    if current_block is not None and current_block.branch == trunk:
        pr_block = current_block.pr
        pr_error = current_block.pr_error
    else:
        pr_block, pr_error = _build_pr_block(pr_gateway.get_pr_for_branch(trunk))

    if in_scope_slug is None:
        return _TrunkRow(branch=trunk, pr=pr_block, pr_error=pr_error, in_scope=None)

    canonical_body = gateway.get(OBJECTIVE_NAMESPACE, body_key(in_scope_slug), trunk)
    if canonical_body is None:
        in_scope = _TrunkObjectiveSummary(slug=in_scope_slug, state="missing_on_master")
    else:
        canonical_state = classify_canonical_snapshot_state(git, trunk=trunk, slug=in_scope_slug)
        in_scope = _TrunkObjectiveSummary(slug=in_scope_slug, state=canonical_state)
    return _TrunkRow(branch=trunk, pr=pr_block, pr_error=pr_error, in_scope=in_scope)


def _build_pr_block(
    pr_result: PRSummary | PRLookupError,
) -> tuple[_PRBlock | None, str | None]:
    if isinstance(pr_result, PRSummary):
        block = _PRBlock(
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


def _build_brmem_listing(gateway: BranchMemoryGateway, branch: str) -> tuple[_BrmemEntryBlock, ...]:
    entries = gateway.list_entries(branch=branch)
    blocks: list[_BrmemEntryBlock] = []
    for entry in entries:
        content = gateway.get(entry.namespace, entry.key, branch) or ""
        blocks.append(
            _BrmemEntryBlock(
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
    trunk: str,
) -> _CurrentBranchBlock:
    objective, extras = _build_objective_summary(gateway, git, branch, trunk, alive=True)
    pr_block, pr_error = _build_pr_block(pr_gateway.get_pr_for_branch(branch))
    brmem_listing = _build_brmem_listing(gateway, branch)
    return _CurrentBranchBlock(
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
    trunk: str,
) -> _StackEntry:
    alive = git.branch_exists(branch)
    objective, _extras = _build_objective_summary(gateway, git, branch, trunk, alive=alive)
    pr_block, pr_error = _build_pr_block(pr_gateway.get_pr_for_branch(branch))
    return _StackEntry(
        branch=branch,
        objective=objective,
        pr=pr_block,
        pr_error=pr_error,
        deleted=not alive,
    )


# ---------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------


def _build_current_prompt(
    *,
    detached_head: bool,
    trunk: str,
    current: _CurrentBranchBlock | None,
    trunk_row: _TrunkRow | None,
    downstack: tuple[_StackEntry, ...],
    upstack: tuple[_StackEntry, ...],
    warnings: tuple[str, ...],
) -> str:
    if detached_head:
        return _render_detached_head(trunk, warnings)

    assert current is not None  # guaranteed by caller when not detached
    assert trunk_row is not None  # built alongside current when not detached

    sections: list[str] = [_render_header(current)]
    brmem_section = _render_brmem_section(current.brmem)
    if brmem_section:
        sections.append(brmem_section)
    sections.append(
        _render_stack_map(
            trunk=trunk,
            trunk_row=trunk_row,
            downstack=downstack,
            current=current,
            upstack=upstack,
        )
    )
    next_step = _render_next_orientation_step(current)
    if next_step:
        sections.append(next_step)
    warnings_block = _render_warnings(warnings)
    if warnings_block:
        sections.append(warnings_block)
    return "\n\n".join(sections) + "\n"


def _render_detached_head(trunk: str, warnings: tuple[str, ...]) -> str:
    body = (
        "# Detached HEAD\n"
        "\n"
        f"Trunk is `{trunk}`. Check out a feature branch to see objective context."
    )
    warnings_block = _render_warnings(warnings)
    if warnings_block:
        body += "\n\n" + warnings_block
    return body + "\n"


def _render_header(current: _CurrentBranchBlock) -> str:
    lines = [f"# On `{current.branch}`", ""]
    objective = current.objective
    if objective is None:
        lines.append("**Objective:** _none attached_")
    else:
        lines.append(f"**Objective:** `{objective.slug}`")
        if objective.obj_state == "up-to-date":
            lines.append("**Snapshot:** up-to-date")
        else:
            lines.append(
                f"**Snapshot:** stale - run `objective-update {objective.slug}` to update it"
            )

    lines.append(_render_pr_line(current.pr, current.pr_error))

    if current.brmem:
        count = len(current.brmem)
        suffix = "entry" if count == 1 else "entries"
        lines.append(f"**brmem:** {count} {suffix}")
    else:
        lines.append("**brmem:** _none_")

    if current.objectives_extra:
        lines.append("")
        lines.append(f"_also attached: {', '.join(current.objectives_extra)}_")

    return "\n".join(lines)


def _render_pr_line(pr: _PRBlock | None, pr_error: str | None) -> str:
    if pr is not None:
        return f"**PR:** [#{pr.number}]({pr.url}) {pr.state} - {pr.title}"
    if pr_error is not None:
        return f"**PR:** _lookup failed: {pr_error}_"
    return "**PR:** _no PR_"


def _render_brmem_section(entries: tuple[_BrmemEntryBlock, ...]) -> str:
    if not entries:
        return ""
    lines = ["## Current Branch Context", ""]
    for entry in entries:
        ns = entry.namespace or "base"
        preview = f" - {entry.preview}" if entry.preview else ""
        lines.append(f"- `{ns}` `{entry.key}` ({entry.size} bytes){preview}")
    return "\n".join(lines)


def _render_stack_map(
    *,
    trunk: str,
    trunk_row: _TrunkRow,
    downstack: tuple[_StackEntry, ...],
    current: _CurrentBranchBlock,
    upstack: tuple[_StackEntry, ...],
) -> str:
    rows: list[str] = []
    on_trunk = current.branch == trunk

    if on_trunk:
        rows.append(_format_trunk_row(trunk_row, depth=0, is_current=True))
        for entry in upstack:
            rows.append(_format_stack_row(entry, depth=1, is_trunk=False))
    else:
        # When stack walking returns, ``downstack`` carries non-trunk
        # ancestors (trunk → ... → current's parent). The trunk row is
        # rendered separately at depth 0 so it can use the current
        # branch's in-scope slug instead of master's alphabetical-first
        # registry slug. With ``downstack`` empty (today's contract,
        # documented in `objective-current/SKILL.md`), neither the trunk
        # row nor any ancestor row appears in the stack map.
        if downstack:
            rows.append(_format_trunk_row(trunk_row, depth=0, is_current=False))
            for offset, entry in enumerate(downstack, start=1):
                rows.append(_format_stack_row(entry, depth=offset, is_trunk=False))
            current_depth = 1 + len(downstack)
        else:
            current_depth = 0
        rows.append(_format_current_row(current, depth=current_depth))
        for entry in upstack:
            rows.append(_format_stack_row(entry, depth=current_depth + 1, is_trunk=False))

    body = "\n".join(rows)
    return f"## Stack Map\n\n```text\n{body}\n```"


def _format_trunk_row(trunk_row: _TrunkRow, *, depth: int, is_current: bool) -> str:
    """Render the trunk row, in-scope-slug aware.

    The trunk row uses the current branch's in-scope slug rather than
    master's alphabetical-first registry slug, so an agent reading the
    stack map is not walked toward maintenance work on slugs it is not
    engaged with.
    """
    prefix = _row_prefix(depth)
    suffix = "  <- current" if is_current else ""
    if _is_bare_trunk_row(trunk_row):
        return f"{prefix}{trunk_row.branch}{suffix}"
    pr_part = _pr_label_part(trunk_row.pr, trunk_row.pr_error)
    obj_part = _trunk_objective_label_part(trunk_row.in_scope)
    return f"{prefix}{trunk_row.branch}  {pr_part}  {obj_part}{suffix}"


def _format_stack_row(entry: _StackEntry, *, depth: int, is_trunk: bool) -> str:
    prefix = _row_prefix(depth)
    if _is_bare_branch(
        is_trunk,
        objective=entry.objective,
        pr=entry.pr,
        pr_error=entry.pr_error,
        deleted=entry.deleted,
    ):
        return f"{prefix}{entry.branch}"
    label = _stack_branch_label(
        branch=entry.branch,
        pr=entry.pr,
        pr_error=entry.pr_error,
        objective=entry.objective,
        deleted=entry.deleted,
    )
    return f"{prefix}{label}"


def _format_current_row(current: _CurrentBranchBlock, *, depth: int) -> str:
    prefix = _row_prefix(depth)
    label = _stack_branch_label(
        branch=current.branch,
        pr=current.pr,
        pr_error=current.pr_error,
        objective=current.objective,
        deleted=False,
    )
    return f"{prefix}{label}  <- current"


def _is_bare_trunk_row(trunk_row: _TrunkRow) -> bool:
    """A trunk row is bare when neither PR, PR error, nor in-scope label apply."""
    return trunk_row.in_scope is None and trunk_row.pr is None and trunk_row.pr_error is None


def _is_bare_branch(
    is_trunk: bool,
    *,
    objective: _ObjectiveSummary | None,
    pr: _PRBlock | None,
    pr_error: str | None,
    deleted: bool,
) -> bool:
    return is_trunk and objective is None and pr is None and pr_error is None and not deleted


def _row_prefix(depth: int) -> str:
    if depth == 0:
        return ""
    return "   " * (depth - 1) + "+- "


def _stack_branch_label(
    *,
    branch: str,
    pr: _PRBlock | None,
    pr_error: str | None,
    objective: _ObjectiveSummary | None,
    deleted: bool,
) -> str:
    pr_part = _pr_label_part(pr, pr_error)
    obj_part = _objective_label_part(objective, deleted=deleted)
    return f"{branch}  {pr_part}  {obj_part}"


def _pr_label_part(pr: _PRBlock | None, pr_error: str | None) -> str:
    if pr is not None:
        return f"#{pr.number} {pr.state}"
    if pr_error is not None:
        return "lookup failed"
    return "no PR"


def _objective_label_part(objective: _ObjectiveSummary | None, *, deleted: bool) -> str:
    if objective is None:
        return "no objective (deleted)" if deleted else "no objective"
    snapshot_state = "deleted" if deleted else objective.obj_state
    return f"{objective.slug} {snapshot_state}"


def _trunk_objective_label_part(in_scope: _TrunkObjectiveSummary | None) -> str:
    if in_scope is None:
        return "no objective"
    if in_scope.state == "missing_on_master":
        return f"{in_scope.slug} missing on master"
    return f"{in_scope.slug} {in_scope.state}"


def _render_next_orientation_step(current: _CurrentBranchBlock) -> str:
    if current.objective is None:
        return ""
    return (
        "## Next Orientation Step\n"
        "\n"
        f"For objective thesis, slices, and findings, run "
        f"`objective-digest {current.objective.slug}`."
    )


def _render_warnings(warnings: tuple[str, ...]) -> str:
    if not warnings:
        return ""
    body_lines = ["> Warnings:", ">"]
    for warning in warnings:
        body_lines.append(f"> - {warning}")
    return "\n".join(body_lines)
