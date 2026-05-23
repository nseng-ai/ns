"""``objective status`` read-only status across local branch tips."""

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
ObjectiveStatusView = Literal["list", "detail"]


class ObjectiveStatusRequest(ClinkrModel):
    view: Annotated[
        ObjectiveStatusView,
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


class ObjectiveStatusGroup(ClinkrModel):
    slug: str
    branches: tuple[ObjectiveBranchEntry, ...]


class ObjectiveStatusResult(ClinkrModel):
    trunk_branch: str
    view: ObjectiveStatusView
    groups: tuple[ObjectiveStatusGroup, ...]


def render_objective_status_human(result: ObjectiveStatusResult) -> None:
    console = get_console()
    if not result.groups:
        console.print("[dim]No open Objective status found.[/dim]")
        return

    if result.view == "detail":
        _render_objective_status_detail_human(result)
        return

    console.print("[bold]Open Objective status in this local repository[/bold]")
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


def _render_objective_status_detail_human(result: ObjectiveStatusResult) -> None:
    console = get_console()
    console.print("[bold]Open Objective branch details in this local repository[/bold]")
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


def render_objective_status_markdown(result: ObjectiveStatusResult) -> None:
    if result.view == "detail":
        _render_objective_status_detail_markdown(result)
        return

    click.echo("# Open Objective status in this local repository")
    if not result.groups:
        click.echo()
        click.echo("No open Objective status found.")
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


def _render_objective_status_detail_markdown(result: ObjectiveStatusResult) -> None:
    click.echo("# Open Objective branch details in this local repository")
    if not result.groups:
        click.echo()
        click.echo("No open Objective status found.")
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


@clinkr_operation(
    name="status",
    help="Show current Objective status for this local repository.",
    human_renderer=render_objective_status_human,
    markdown_renderer=render_objective_status_markdown,
)
def run_objective_status(
    ctx: click.Context,
    request: ObjectiveStatusRequest,
) -> ClinkrExit[ObjectiveStatusResult]:
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)
    return ClinkrExit.ok(build_objective_status_result(objective_ctx, view=request.view))


def build_objective_status_result(
    ctx: ObjectiveCliContext,
    *,
    view: ObjectiveStatusView = "list",
) -> ObjectiveStatusResult:
    rows_by_slug: dict[str, list[ObjectiveBranchEntry]] = {}
    trunk = ctx.trunk_branch

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

    return ObjectiveStatusResult(
        trunk_branch=trunk,
        view=view,
        groups=tuple(
            ObjectiveStatusGroup(
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


def _latest_tip_head_iso(group: ObjectiveStatusGroup) -> str | None:
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


def _max_ahead_trunk(group: ObjectiveStatusGroup) -> int:
    return max((entry.ahead_trunk for entry in group.branches), default=0)
