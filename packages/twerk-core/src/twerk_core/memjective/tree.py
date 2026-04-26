"""Display the tree of branches carrying a memjective snapshot + their PRs.

Given a slug (explicit or inferred from the current branch), list every
branch that carries a memjective snapshot alongside the PR attached to that
branch — number, title, URL, and lifecycle state. The "tree" is typically a
Graphite stack rooted off the memjective's base branch; the listing is flat
but the underlying shape is a tree. The master-branch snapshot is reported
separately via ``seed_present`` because it is a seed, not a PR-bearing
workstream.

The primary consumer is ``dev-memjective-update``, an LLM scanning stdout
after a slice lands: rows are grouped by state (merged → open → closed →
no_pr → error) so recently-landed work surfaces first, and ``gh`` errors on
one branch become ``error`` rows instead of aborting the whole command.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.console import get_console, make_table
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRState
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.discovery import MASTER_BRANCH
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE
from twerk_core.memjective.slug_resolution import (
    AmbiguousMemjective,
    NoMemjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)

BranchPrAction = Literal["open", "merged", "closed", "no_pr", "error"]

_STATE_GROUP_ORDER: tuple[BranchPrAction, ...] = ("merged", "open", "closed", "no_pr", "error")
_STATE_TO_ACTION: dict[PRState, BranchPrAction] = {
    "OPEN": "open",
    "MERGED": "merged",
    "CLOSED": "closed",
}


@dataclass(frozen=True)
class BranchPrEntry:
    branch: str
    stale: bool
    action: BranchPrAction
    pr_number: int | None
    pr_state: PRState | None
    pr_title: str | None
    pr_url: str | None
    pr_error_stderr: str | None


@dataclass(frozen=True)
class MemjectiveTreeRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class MemjectiveTreeResult(JsonSerializable):
    slug: str
    seed_present: bool
    entries: tuple[BranchPrEntry, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "seed_present": self.seed_present,
            "entries": [
                {
                    "branch": e.branch,
                    "stale": e.stale,
                    "action": e.action,
                    "pr_number": e.pr_number,
                    "pr_state": e.pr_state,
                    "pr_title": e.pr_title,
                    "pr_url": e.pr_url,
                    "pr_error_stderr": e.pr_error_stderr,
                }
                for e in self.entries
            ],
        }


_STATE_BADGES: dict[BranchPrAction, str] = {
    "merged": "[magenta]● merged[/magenta]",
    "open": "[bold green]● open[/bold green]",
    "closed": "[red]● closed[/red]",
    "no_pr": "[dim]○ no-pr[/dim]",
    "error": "[yellow]⚠ error[/yellow]",
}


def render_memjective_tree(result: MemjectiveTreeResult) -> None:
    click.echo(f"slug: {result.slug}")
    click.echo(f"seed: {'present (master)' if result.seed_present else 'absent'}")

    if not result.entries:
        click.echo("(no branches)")
        return

    table = make_table()
    table.add_column("BRANCH", style="cyan", no_wrap=True)
    table.add_column("STATE", no_wrap=True, min_width=8)
    table.add_column("PR", no_wrap=True, justify="right", min_width=5)
    table.add_column("TITLE", no_wrap=True, overflow="ellipsis", ratio=1)

    for entry in result.entries:
        table.add_row(
            entry.branch,
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


def _classify_branch(branch: str, git: GitGateway, pr: PRGateway) -> BranchPrEntry:
    stale = not git.branch_exists(branch)
    result = pr.get_pr_for_branch(branch)
    if isinstance(result, PRLookupError):
        if result.returncode == 1:
            return BranchPrEntry(
                branch=branch,
                stale=stale,
                action="no_pr",
                pr_number=None,
                pr_state=None,
                pr_title=None,
                pr_url=None,
                pr_error_stderr=None,
            )
        return BranchPrEntry(
            branch=branch,
            stale=stale,
            action="error",
            pr_number=None,
            pr_state=None,
            pr_title=None,
            pr_url=None,
            pr_error_stderr=result.stderr or None,
        )
    return BranchPrEntry(
        branch=branch,
        stale=stale,
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
        "Display the tree of branches carrying a memjective snapshot with "
        "their associated PRs (number, URL, state). The tree is typically "
        "a Graphite stack. If SLUG is omitted and exactly one memjective "
        "is attached to the current branch, it is selected automatically. "
        "The master-branch seed is reported via `seed_present`, not as a "
        "row."
    ),
    human_renderer=render_memjective_tree,
)
def run_tree_memjective(
    ctx: click.Context,
    request: MemjectiveTreeRequest,
) -> ClinkrExit[MemjectiveTreeResult]:
    mctx = load_typed_context(ctx, MemjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway
    pr = mctx.pr_gateway

    match resolve_slug(mctx, request.slug):
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case NoMemjectiveOnBranch(branch=branch):
            return ClinkrExit.failure(
                error_type="no_memjective_on_branch",
                message=f"No memjective on branch {branch!r}.",
            )
        case AmbiguousMemjective(branch=branch, slugs=slugs):
            names = ", ".join(slugs)
            return ClinkrExit.failure(
                error_type="ambiguous_memjective",
                message=f"Multiple memjectives on branch {branch!r}: {names}. Specify a SLUG.",
            )
        case SlugResolution(slug=slug):
            pass

    all_entries = gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE)
    slug_entries = [e for e in all_entries if e.key.startswith(f"{slug}/")]
    if not slug_entries:
        empty = MemjectiveTreeResult(slug=slug, seed_present=False, entries=())
        return ClinkrExit.negative(
            empty,
            message=f"No memjective found for slug {slug!r}.",
        )

    seed_present = any(e.branch == MASTER_BRANCH for e in slug_entries)
    branch_names = sorted({e.branch for e in slug_entries if e.branch != MASTER_BRANCH})
    rows = tuple(_classify_branch(b, git, pr) for b in branch_names)
    rows = _sort_by_state_group(rows)
    return ClinkrExit.ok(
        MemjectiveTreeResult(slug=slug, seed_present=seed_present, entries=rows),
    )
