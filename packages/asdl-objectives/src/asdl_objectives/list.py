"""``objective list`` read-only inventory across local branch tips."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    load_objective_context,
)

OBJECTIVE_ROOT = ".asdl/objectives"
ObjectiveListView = Literal["list", "detail"]
ObjectiveStatus = Literal["open", "closed"]
ObjectiveStatusFilter = Literal["all", "open", "closed"]


class ObjectiveListRequest(ClinkrModel):
    current: Annotated[
        bool,
        click.Option(
            ["--current"],
            is_flag=True,
            default=False,
            help="Filter to Objectives associated with the current branch.",
        ),
    ] = False
    names: Annotated[
        bool,
        click.Option(
            ["--names"],
            is_flag=True,
            default=False,
            help="Output Objective slugs only, one per line.",
        ),
    ] = False
    status: Annotated[
        ObjectiveStatusFilter,
        click.Option(
            ["--status"],
            type=click.Choice(["all", "open", "closed"]),
            default="open",
            show_default=True,
            help="Filter Objectives by open/closed status.",
        ),
    ] = "open"
    view: Annotated[
        ObjectiveListView,
        click.Option(
            ["--view"],
            type=click.Choice(["list", "detail"]),
            default="list",
            show_default=True,
            help="Select objective-level list or per-branch detail view.",
        ),
    ] = "list"


class ObjectiveBranchEntry(ClinkrModel):
    branch: str
    status: ObjectiveStatus
    tip_head_iso: str | None
    ahead_trunk: int


class ObjectiveListGroup(ClinkrModel):
    slug: str
    status: ObjectiveStatus
    branches: tuple[ObjectiveBranchEntry, ...]


class ObjectiveListResult(ClinkrModel):
    trunk_branch: str
    view: ObjectiveListView
    status_filter: ObjectiveStatusFilter
    current_branch: str | None
    filtered_to_current: bool
    names_only: bool
    groups: tuple[ObjectiveListGroup, ...]


def render_objective_list_human(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    console = get_console()
    if not result.groups:
        console.print(f"[dim]{_empty_message(result)}[/dim]")
        return

    if result.view == "detail":
        _render_objective_list_detail_human(result)
        return

    console.print(f"[bold]{_list_heading(result)}[/bold]")
    table = make_table()
    table.add_column(
        "Objective",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        ratio=1,
    )
    table.add_column("Status", no_wrap=True, width=8)
    table.add_column(
        "Latest branch",
        style="bold",
        no_wrap=True,
        overflow="ellipsis",
        ratio=2,
    )
    table.add_column("Latest tip", no_wrap=True)
    table.add_column("Local branches", justify="right", no_wrap=True)
    table.add_column("Max ahead trunk", justify="right", no_wrap=True)
    for group in result.groups:
        table.add_row(
            group.slug,
            _status_label(group.status),
            _latest_tip_branch(group),
            format_relative_time(_latest_tip_head_iso(group)),
            str(len(group.branches)),
            f"+{_max_ahead_trunk(group)}",
        )
    console.print(table)


def _render_objective_list_detail_human(result: ObjectiveListResult) -> None:
    console = get_console()
    console.print(f"[bold]{_detail_heading(result)}[/bold]")
    for group in result.groups:
        console.print()
        console.print(f"[bold cyan]{group.slug}[/bold cyan]")
        table = make_table()
        table.add_column(
            "Branch",
            style="bold",
            no_wrap=True,
            overflow="ellipsis",
            ratio=1,
        )
        table.add_column("Status", no_wrap=True, width=8)
        table.add_column("Tip age", no_wrap=True)
        table.add_column("Ahead trunk", justify="right", no_wrap=True)
        for entry in group.branches:
            table.add_row(
                entry.branch,
                _status_label(entry.status),
                format_relative_time(entry.tip_head_iso),
                f"+{entry.ahead_trunk}",
            )
        console.print(table)


def render_objective_list_markdown(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    if result.view == "detail":
        _render_objective_list_detail_markdown(result)
        return

    click.echo(f"# {_list_heading(result)}")
    if not result.groups:
        click.echo()
        click.echo(_empty_message(result))
        return

    click.echo()
    click.echo(
        "| objective | status | latest branch | latest tip | local branches | max ahead trunk |"
    )
    click.echo("| --- | --- | --- | --- | ---: | ---: |")
    for group in result.groups:
        latest_branch = _latest_tip_branch(group)
        if latest_branch != "":
            latest_branch = f"`{latest_branch}`"
        click.echo(
            "| "
            f"{group.slug} | "
            f"{_status_label(group.status)} | "
            f"{latest_branch} | "
            f"{format_relative_time(_latest_tip_head_iso(group))} | "
            f"{len(group.branches)} | "
            f"+{_max_ahead_trunk(group)} |"
        )


def _render_objective_list_detail_markdown(result: ObjectiveListResult) -> None:
    click.echo(f"# {_detail_heading(result)}")
    if not result.groups:
        click.echo()
        click.echo(_empty_message(result))
        return

    for group in result.groups:
        click.echo()
        click.echo(f"## {group.slug}")
        click.echo()
        click.echo("| branch | status | tip age | ahead trunk |")
        click.echo("| --- | --- | --- | ---: |")
        for entry in group.branches:
            click.echo(
                f"| `{entry.branch}` | "
                f"{_status_label(entry.status)} | "
                f"{format_relative_time(entry.tip_head_iso)} | "
                f"+{entry.ahead_trunk} |"
            )


def _render_slugs(result: ObjectiveListResult) -> None:
    for group in result.groups:
        click.echo(group.slug)


def _status_label(status: ObjectiveStatus) -> str:
    if status == "closed":
        return "✓ closed"
    return "○ open"


def _list_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Objective status for current branch `{result.current_branch}`"
    return "Objective status in this local repository"


def _detail_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Objective branch details for current branch `{result.current_branch}`"
    return "Objective branch details in this local repository"


def _empty_message(result: ObjectiveListResult) -> str:
    if result.filtered_to_current:
        if result.current_branch is None:
            return "No current branch (detached HEAD); nothing to list."
        return (
            f"No {_status_filter_objectives_phrase(result.status_filter)} associated with "
            f"current branch `{result.current_branch}`."
        )
    if result.status_filter == "all":
        return "No Objective status found."
    return f"No {result.status_filter} Objective status found."


def _status_filter_objectives_phrase(status_filter: ObjectiveStatusFilter) -> str:
    if status_filter == "all":
        return "Objectives"
    return f"{status_filter} Objectives"


@clinkr_operation(
    name="list",
    help="List Objective status across local branch tips in this repository.",
    human_renderer=render_objective_list_human,
    markdown_renderer=render_objective_list_markdown,
)
def run_list_objectives(
    ctx: click.Context,
    request: ObjectiveListRequest,
) -> ClinkrExit[ObjectiveListResult]:
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)
    return ClinkrExit.ok(
        build_objective_list_result(
            objective_ctx,
            view=request.view,
            status_filter=request.status,
            filter_current=request.current,
            names_only=request.names,
        )
    )


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    view: ObjectiveListView = "list",
    status_filter: ObjectiveStatusFilter = "open",
    filter_current: bool = False,
    names_only: bool = False,
) -> ObjectiveListResult:
    rows_by_slug: dict[str, list[ObjectiveBranchEntry]] = {}
    trunk = ctx.trunk_branch

    current_branch: str | None = None
    if filter_current:
        current_result = ctx.git.get_current_branch(ctx.repo_root)
        if isinstance(current_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_current_branch_failed",
                message=current_result.message,
            )
        if isinstance(current_result, str):
            current_branch = current_result

    for branch_tip in ctx.git.list_local_branch_tips():
        branch = branch_tip.name
        if branch == trunk and (not filter_current or current_branch != trunk):
            continue

        ref = f"refs/heads/{branch}"
        paths_result = ctx.git.list_tracked_paths_at_ref(ref, OBJECTIVE_ROOT)
        if isinstance(paths_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_list_objective_paths_failed",
                message=paths_result.message,
            )

        objective_statuses = _objective_statuses_from_paths(paths_result)
        filtered_statuses = tuple(
            (slug, status)
            for slug, status in objective_statuses
            if status_filter == "all" or status == status_filter
        )
        if not filtered_statuses:
            continue

        ahead_result = ctx.git.count_commits_in_range(f"{trunk}..{branch}")
        if isinstance(ahead_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_ahead_count_failed",
                message=ahead_result.message,
            )

        for slug, status in filtered_statuses:
            rows_by_slug.setdefault(slug, []).append(
                ObjectiveBranchEntry(
                    branch=branch,
                    status=status,
                    tip_head_iso=branch_tip.head_iso,
                    ahead_trunk=ahead_result,
                )
            )

    if filter_current:
        rows_by_slug = {
            slug: entries
            for slug, entries in rows_by_slug.items()
            if current_branch is not None
            and any(entry.branch == current_branch for entry in entries)
        }

    groups: list[ObjectiveListGroup] = []
    for slug, entries in sorted(rows_by_slug.items()):
        branches = tuple(sorted(entries, key=lambda entry: entry.branch))
        groups.append(
            ObjectiveListGroup(
                slug=slug,
                status=_group_status_from_branches(branches),
                branches=branches,
            )
        )

    return ObjectiveListResult(
        trunk_branch=trunk,
        view=view,
        status_filter=status_filter,
        current_branch=current_branch,
        filtered_to_current=filter_current,
        names_only=names_only,
        groups=tuple(groups),
    )


def _objective_statuses_from_paths(
    paths: tuple[str, ...],
) -> tuple[tuple[str, ObjectiveStatus], ...]:
    slugs: set[str] = set()
    closed_slugs: set[str] = set()
    prefix = f"{OBJECTIVE_ROOT}/"

    for path in paths:
        if not path.startswith(prefix):
            continue
        rest = path.removeprefix(prefix)
        slug, separator, child_path = rest.partition("/")
        if slug == "" or separator == "":
            continue
        slugs.add(slug)
        if child_path == "closed.md":
            closed_slugs.add(slug)

    return tuple((slug, "closed" if slug in closed_slugs else "open") for slug in sorted(slugs))


def _latest_tip_branch(group: ObjectiveListGroup) -> str:
    entry = _latest_tip_entry(group)
    if entry is None:
        return ""
    return entry.branch


def _latest_tip_head_iso(group: ObjectiveListGroup) -> str | None:
    entry = _latest_tip_entry(group)
    if entry is None:
        return None
    return entry.tip_head_iso


def _group_status_from_branches(branches: tuple[ObjectiveBranchEntry, ...]) -> ObjectiveStatus:
    latest_entry = _latest_tip_entry_from_entries(branches)
    if latest_entry is not None:
        return latest_entry.status
    if branches:
        return branches[0].status
    return "open"


def _latest_tip_entry(group: ObjectiveListGroup) -> ObjectiveBranchEntry | None:
    return _latest_tip_entry_from_entries(group.branches)


def _latest_tip_entry_from_entries(
    entries: tuple[ObjectiveBranchEntry, ...],
) -> ObjectiveBranchEntry | None:
    parsed_tips: list[tuple[datetime, ObjectiveBranchEntry]] = []
    for entry in entries:
        tip_head_iso = entry.tip_head_iso
        if tip_head_iso is None:
            continue
        parsed_dt = _parse_iso_datetime(tip_head_iso)
        if parsed_dt is not None:
            parsed_tips.append((parsed_dt, entry))

    if not parsed_tips:
        return None

    latest_dt = max(parsed_dt for parsed_dt, _entry in parsed_tips)
    latest_entries = [entry for parsed_dt, entry in parsed_tips if parsed_dt == latest_dt]
    return min(latest_entries, key=lambda entry: entry.branch)


def _parse_iso_datetime(iso_timestamp: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _max_ahead_trunk(group: ObjectiveListGroup) -> int:
    return max((entry.ahead_trunk for entry in group.branches), default=0)
