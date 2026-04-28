"""``objective exec current`` — render the orientation brief for ``objective-current``.

Tightly coupled to the ``objective-current`` skill: emits a single
self-contained Markdown brief covering the current branch's claimed
objective + freshness, PR, brmem entries, the trunk-first downstack
walk, and immediate upstack children. The skill simply runs this
command and prints the output verbatim — no JSON parsing, no Markdown
structure inference.
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
class CurrentPrompt(JsonSerializable):
    prompt: str


@dataclass(frozen=True)
class _ObjectiveSummary:
    slug: str
    obj_state: ObjectiveSnapshotState


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


def render_current_prompt(result: CurrentPrompt) -> None:
    click.echo(result.prompt, nl=False)


@clinkr_operation(
    name="current",
    help=(
        "Render the orientation brief for `objective-current`. The CLI "
        "pre-computes every fact about the current branch (objective + "
        "freshness, PR, brmem entries, downstack ancestry, and immediate "
        "upstack children) and emits the final Markdown directly. The "
        "skill prints the output verbatim."
    ),
    human_renderer=render_current_prompt,
)
def run_current_objective(
    ctx: click.Context,
    request: ObjectiveCurrentRequest,
) -> ClinkrExit[CurrentPrompt]:
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
        prompt = _build_current_prompt(
            detached_head=True,
            trunk=trunk,
            current=None,
            downstack=(),
            upstack=(),
            warnings=tuple(warnings),
        )
        return ClinkrExit.ok(CurrentPrompt(prompt=prompt))

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

    prompt = _build_current_prompt(
        detached_head=False,
        trunk=trunk,
        current=current_block,
        downstack=downstack,
        upstack=upstack,
        warnings=tuple(warnings),
    )
    return ClinkrExit.ok(CurrentPrompt(prompt=prompt))


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
    snapshot_ref = snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, body_key(primary))
    branch_max_author_iso = _max_author_iso(git, branch) if alive else None
    obj_state = classify_obj_state(
        alive=alive,
        snapshot_iso=body_last_touched,
        branch_max_author_iso=branch_max_author_iso,
    )
    summary = _ObjectiveSummary(slug=primary, obj_state=obj_state)
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
) -> _CurrentBranchBlock:
    objective, extras = _build_objective_summary(gateway, git, branch, alive=True)
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
) -> _StackEntry:
    alive = git.branch_exists(branch)
    objective, _extras = _build_objective_summary(gateway, git, branch, alive=alive)
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
    downstack: tuple[_StackEntry, ...],
    upstack: tuple[_StackEntry, ...],
    warnings: tuple[str, ...],
) -> str:
    if detached_head:
        return _render_detached_head(trunk, warnings)

    assert current is not None  # guaranteed by caller when not detached

    sections: list[str] = [_render_header(current)]
    brmem_section = _render_brmem_section(current.brmem)
    if brmem_section:
        sections.append(brmem_section)
    sections.append(
        _render_stack_map(trunk=trunk, downstack=downstack, current=current, upstack=upstack)
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
        lines.append("**Objective:** _none claimed_")
    else:
        lines.append(f"**Objective:** `{objective.slug}`")
        if objective.obj_state == "fresh":
            lines.append("**Snapshot:** fresh")
        else:
            lines.append(
                f"**Snapshot:** stale - run `objective-update {objective.slug}` to refresh"
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
        lines.append(f"_also claimed: {', '.join(current.objectives_extra)}_")

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
    downstack: tuple[_StackEntry, ...],
    current: _CurrentBranchBlock,
    upstack: tuple[_StackEntry, ...],
) -> str:
    rows: list[str] = []
    on_trunk = current.branch == trunk

    if on_trunk:
        rows.append(_format_current_row(current, depth=0, is_trunk=True))
        for entry in upstack:
            rows.append(_format_stack_row(entry, depth=1, is_trunk=False))
    else:
        for depth, entry in enumerate(downstack):
            rows.append(_format_stack_row(entry, depth=depth, is_trunk=(depth == 0)))
        current_depth = len(downstack)
        rows.append(_format_current_row(current, depth=current_depth, is_trunk=False))
        for entry in upstack:
            rows.append(_format_stack_row(entry, depth=current_depth + 1, is_trunk=False))

    body = "\n".join(rows)
    return f"## Stack Map\n\n```text\n{body}\n```"


def _format_stack_row(entry: _StackEntry, *, depth: int, is_trunk: bool) -> str:
    prefix = _row_prefix(depth)
    if _is_bare_trunk(
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


def _format_current_row(current: _CurrentBranchBlock, *, depth: int, is_trunk: bool) -> str:
    prefix = _row_prefix(depth)
    if _is_bare_trunk(
        is_trunk,
        objective=current.objective,
        pr=current.pr,
        pr_error=current.pr_error,
        deleted=False,
    ):
        return f"{prefix}{current.branch}  <- current"
    label = _stack_branch_label(
        branch=current.branch,
        pr=current.pr,
        pr_error=current.pr_error,
        objective=current.objective,
        deleted=False,
    )
    return f"{prefix}{label}  <- current"


def _is_bare_trunk(
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
    freshness = "deleted" if deleted else objective.obj_state
    return f"{objective.slug} {freshness}"


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
    gt_prefixes = ("gt_failed:", "gt_trunk_failed:")
    gt_warnings = [w for w in warnings if w.startswith(gt_prefixes)]
    other_warnings = [w for w in warnings if w not in gt_warnings]

    blocks: list[str] = []
    for w in gt_warnings:
        _, _, rest = w.partition(": ")
        blocks.append(f"> Warning: gt unavailable - stack walk skipped: `{rest}`")

    if other_warnings:
        body_lines = ["> Warnings:", ">"]
        for w in other_warnings:
            body_lines.append(f"> - {w}")
        blocks.append("\n".join(body_lines))

    return "\n\n".join(blocks)
