"""Display branches carrying an objective snapshot plus their PRs.

Given a slug (explicit or inferred from the current branch), list every
branch that carries a objective snapshot alongside the PR attached to that
branch - number, title, URL, and lifecycle state. The canonical objective is
reported separately via ``canonical_present`` because it is a record on
``master``, not a PR-bearing workstream.

The primary consumer is ``objective-reconcile``, an LLM scanning stdout
while folding branch snapshots into canonical objective state: rows are
grouped by state (merged -> open -> closed -> no_pr -> error) so landed work
surfaces first, and ``gh`` errors on one branch become ``error`` rows instead
of aborting the whole command.
"""

from __future__ import annotations

from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRLookupError, PRState
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import ObjectiveState, closed_key
from asdl_objectives.freshness import classify_branch_snapshot
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway

BranchPrAction = Literal["open", "merged", "closed", "no_pr", "error"]
ObjectiveSnapshotUiState = Literal["fresh", "stale", "deleted"]

_STATE_GROUP_ORDER: tuple[BranchPrAction, ...] = ("merged", "open", "closed", "no_pr", "error")
_STATE_TO_ACTION: dict[PRState, BranchPrAction] = {
    "OPEN": "open",
    "MERGED": "merged",
    "CLOSED": "closed",
}


class BranchPrEntry(ClinkrModel):
    branch: str
    obj_state: ObjectiveSnapshotUiState
    action: BranchPrAction
    pr_number: int | None
    pr_state: PRState | None
    pr_title: str | None
    pr_url: str | None
    pr_error_stderr: str | None


class ObjectiveTreeRequest(ClinkrModel):
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


class ObjectiveTreeResult(ClinkrModel):
    slug: str
    canonical_present: bool
    state: ObjectiveState
    entries: tuple[BranchPrEntry, ...]


_STATE_BADGES: dict[BranchPrAction, str] = {
    "merged": "[magenta]● merged[/magenta]",
    "open": "[bold green]● open[/bold green]",
    "closed": "[red]● closed[/red]",
    "no_pr": "[dim]○ no-pr[/dim]",
    "error": "[yellow]⚠ error[/yellow]",
}

_SNAP_BADGES: dict[ObjectiveSnapshotUiState, str] = {
    "fresh": "[green]● fresh[/green]",
    "stale": "[yellow]● stale[/yellow]",
    "deleted": "[dim]○ deleted[/dim]",
}


def render_objective_tree(result: ObjectiveTreeResult) -> None:
    click.echo(f"slug: {result.slug}")
    click.echo(f"canonical: {'present (master)' if result.canonical_present else 'absent'}")
    click.echo(f"state: {result.state}")

    if not result.entries:
        click.echo("(no branches)")
        return

    table = make_table()
    table.add_column("BRANCH", style="cyan", no_wrap=True)
    table.add_column("SNAP", no_wrap=True, min_width=9)
    table.add_column("PR STATE", no_wrap=True, min_width=8)
    table.add_column("PR", no_wrap=True, justify="right", min_width=5)
    table.add_column("TITLE", no_wrap=True, overflow="ellipsis", ratio=1)

    for entry in result.entries:
        table.add_row(
            entry.branch,
            _SNAP_BADGES[entry.obj_state],
            _STATE_BADGES[entry.action],
            _pr_cell(entry),
            _title_cell(entry),
        )

    get_console().print(table)


def _pr_cell(entry: BranchPrEntry) -> str:
    if entry.pr_number is None:
        return "-"
    label = f"#{entry.pr_number}"
    if entry.pr_url is not None:
        return f"[link={entry.pr_url}]{label}[/link]"
    return label


def _title_cell(entry: BranchPrEntry) -> str:
    if entry.pr_title is not None:
        return entry.pr_title
    if entry.action == "error" and entry.pr_error_stderr is not None:
        return f"[dim]gh error: {entry.pr_error_stderr}[/dim]"
    return "-"


def _classify_branch(
    branch: str,
    *,
    slug: str,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    pr: PRGateway,
    trunk: str,
) -> BranchPrEntry:
    alive = git.branch_exists(branch)
    if alive:
        obj_state: ObjectiveSnapshotUiState = classify_branch_snapshot(
            gateway, git, branch, slug, trunk=trunk, alive=True
        )
    else:
        obj_state = "deleted"
    result = pr.get_pr_for_branch(branch)
    if isinstance(result, PRLookupError):
        if result.returncode == 1:
            return BranchPrEntry(
                branch=branch,
                obj_state=obj_state,
                action="no_pr",
                pr_number=None,
                pr_state=None,
                pr_title=None,
                pr_url=None,
                pr_error_stderr=None,
            )
        return BranchPrEntry(
            branch=branch,
            obj_state=obj_state,
            action="error",
            pr_number=None,
            pr_state=None,
            pr_title=None,
            pr_url=None,
            pr_error_stderr=result.stderr or None,
        )
    return BranchPrEntry(
        branch=branch,
        obj_state=obj_state,
        action=_STATE_TO_ACTION[result.state],
        pr_number=result.number,
        pr_state=result.state,
        pr_title=result.title,
        pr_url=result.url,
        pr_error_stderr=None,
    )


def _sort_by_state_group(rows: tuple[BranchPrEntry, ...]) -> tuple[BranchPrEntry, ...]:
    order = {action: i for i, action in enumerate(_STATE_GROUP_ORDER)}
    return tuple(sorted(rows, key=lambda r: (order[r.action], r.branch)))


@clinkr_operation(
    name="tree",
    help=(
        "Display the tree of branches carrying a objective snapshot with "
        "their associated PRs (number, URL, state). If SLUG is omitted and "
        "exactly one objective is attached to the current branch, it is "
        "selected automatically. The canonical record is reported via "
        "`canonical_present`, not as a row."
    ),
    human_renderer=render_objective_tree,
)
def run_tree_objective(
    ctx: click.Context,
    request: ObjectiveTreeRequest,
) -> ClinkrExit[ObjectiveTreeResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway
    pr = mctx.pr_gateway

    match resolve_slug(mctx, request.slug):
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case NoObjectiveOnBranch() as missing:
            raise ClinkrFailure(
                error_type="no_objective_on_branch",
                message=f"No objective on branch {missing.branch!r}.",
            )
        case AmbiguousObjective() as ambiguity:
            names = ", ".join(ambiguity.slugs)
            raise ClinkrFailure(
                error_type="ambiguous_objective",
                message=(
                    f"Multiple objectives on branch {ambiguity.branch!r}: {names}. Specify a SLUG."
                ),
            )
        case SlugResolution() as slug_result:
            slug = slug_result.slug

    all_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    slug_entries = [e for e in all_entries if e.key.startswith(f"{slug}/")]
    if not slug_entries:
        empty = ObjectiveTreeResult(slug=slug, canonical_present=False, state="open", entries=())
        raise ClinkrExit.negative(
            empty,
            message=f"No objective found for slug {slug!r}.",
        )

    trunk = resolve_trunk(git).trunk
    canonical_present = any(e.branch == trunk and e.key != closed_key(slug) for e in slug_entries)
    state: ObjectiveState = (
        "closed"
        if any(e.branch == trunk and e.key == closed_key(slug) for e in slug_entries)
        else "open"
    )
    branch_names = sorted({e.branch for e in slug_entries if e.branch != trunk})

    rows = tuple(
        _classify_branch(
            b,
            slug=slug,
            gateway=gateway,
            git=git,
            pr=pr,
            trunk=trunk,
        )
        for b in branch_names
    )
    rows = _sort_by_state_group(rows)
    return ClinkrExit.ok(
        ObjectiveTreeResult(
            slug=slug,
            canonical_present=canonical_present,
            state=state,
            entries=rows,
        ),
    )
