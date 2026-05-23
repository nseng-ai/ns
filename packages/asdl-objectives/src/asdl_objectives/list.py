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
    tip_head_iso: str | None
    ahead_trunk: int


class ObjectiveListGroup(ClinkrModel):
    slug: str
    branches: tuple[ObjectiveBranchEntry, ...]


class ObjectiveListResult(ClinkrModel):
    trunk_branch: str
    view: ObjectiveListView
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
    table.add_column("Objective", style="bold cyan", no_wrap=True)
    table.add_column("Local branches", justify="right", no_wrap=True)
    table.add_column("Latest tip", no_wrap=True)
    table.add_column("Max ahead trunk", justify="right", no_wrap=True)
    for group in result.groups:
        table.add_row(
            group.slug,
            str(len(group.branches)),
            format_relative_time(_latest_tip_head_iso(group)),
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
        table.add_column("Branch", style="bold", no_wrap=True)
        table.add_column("Tip age", no_wrap=True)
        table.add_column("Ahead trunk", justify="right", no_wrap=True)
        for entry in group.branches:
            table.add_row(
                entry.branch,
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
    click.echo("| objective | local branches | latest tip | max ahead trunk |")
    click.echo("| --- | ---: | --- | ---: |")
    for group in result.groups:
        click.echo(
            "| "
            f"{group.slug} | "
            f"{len(group.branches)} | "
            f"{format_relative_time(_latest_tip_head_iso(group))} | "
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
        click.echo("| branch | tip age | ahead trunk |")
        click.echo("| --- | --- | ---: |")
        for entry in group.branches:
            click.echo(
                f"| `{entry.branch}` | "
                f"{format_relative_time(entry.tip_head_iso)} | "
                f"+{entry.ahead_trunk} |"
            )


def _render_slugs(result: ObjectiveListResult) -> None:
    for group in result.groups:
        click.echo(group.slug)


def _list_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Open Objective status for current branch `{result.current_branch}`"
    return "Open Objective status in this local repository"


def _detail_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Open Objective branch details for current branch `{result.current_branch}`"
    return "Open Objective branch details in this local repository"


def _empty_message(result: ObjectiveListResult) -> str:
    if result.filtered_to_current:
        if result.current_branch is None:
            return "No current branch (detached HEAD); nothing to list."
        return f"No open Objectives associated with current branch `{result.current_branch}`."
    return "No open Objective status found."


@clinkr_operation(
    name="list",
    help="List open Objectives across local branch tips in this repository.",
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
            filter_current=request.current,
            names_only=request.names,
        )
    )


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    view: ObjectiveListView = "list",
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
        if branch == trunk:
            continue

        ref = f"refs/heads/{branch}"
        paths_result = ctx.git.list_tracked_paths_at_ref(ref, OBJECTIVE_ROOT)
        if isinstance(paths_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_list_objective_paths_failed",
                message=paths_result.message,
            )

        open_slugs = _open_objective_slugs_from_paths(paths_result)
        if not open_slugs:
            continue

        ahead_result = ctx.git.count_commits_in_range(f"{trunk}..{branch}")
        if isinstance(ahead_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_ahead_count_failed",
                message=ahead_result.message,
            )

        for slug in open_slugs:
            rows_by_slug.setdefault(slug, []).append(
                ObjectiveBranchEntry(
                    branch=branch,
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

    return ObjectiveListResult(
        trunk_branch=trunk,
        view=view,
        current_branch=current_branch,
        filtered_to_current=filter_current,
        names_only=names_only,
        groups=tuple(
            ObjectiveListGroup(
                slug=slug,
                branches=tuple(sorted(entries, key=lambda entry: entry.branch)),
            )
            for slug, entries in sorted(rows_by_slug.items())
        ),
    )


def _open_objective_slugs_from_paths(paths: tuple[str, ...]) -> tuple[str, ...]:
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

    return tuple(sorted(slugs - closed_slugs))


def _latest_tip_head_iso(group: ObjectiveListGroup) -> str | None:
    parsed_tips: list[tuple[datetime, str]] = []
    for entry in group.branches:
        tip_head_iso = entry.tip_head_iso
        if tip_head_iso is None:
            continue
        parsed_dt = _parse_iso_datetime(tip_head_iso)
        if parsed_dt is not None:
            parsed_tips.append((parsed_dt, tip_head_iso))

    if not parsed_tips:
        return None
    return max(parsed_tips, key=lambda item: item[0])[1]


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
