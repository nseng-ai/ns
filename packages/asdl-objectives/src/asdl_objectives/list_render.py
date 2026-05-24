"""Human and Markdown rendering for ``objective list``."""

from __future__ import annotations

import click

from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_objectives.list_inventory import ObjectiveRecordStatus
from asdl_objectives.list_models import ObjectiveListGroup, ObjectiveListResult
from asdl_objectives.list_status import ObjectiveStatus, ObjectiveStatusFilter


def render_objective_list_human(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    console = get_console()
    if result.view == "detail":
        _render_objective_list_detail_human(result)
        return

    console.print(f"[bold]{_list_heading(result)}[/bold]")
    _render_metadata_human(result)
    if not result.groups:
        console.print(f"[dim]{_empty_message(result)}[/dim]")
        return

    table = make_table()
    table.add_column(
        "Objective",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        ratio=1,
    )
    table.add_column("Status", no_wrap=True, width=11)
    table.add_column(
        "Latest work",
        style="bold",
        no_wrap=True,
        overflow="ellipsis",
        ratio=2,
    )
    table.add_column("Latest update", no_wrap=True)
    table.add_column("Work branches", justify="right", no_wrap=True)
    table.add_column("Max slice commits", justify="right", no_wrap=True)
    for group in result.groups:
        table.add_row(
            group.slug,
            _status_label(group.status),
            _format_optional_branch(group.latest_work_branch),
            _format_age(group.latest_update_iso),
            str(len(group.branches)),
            f"+{_max_slice_commits(group)}",
        )
    console.print(table)


def _render_objective_list_detail_human(result: ObjectiveListResult) -> None:
    console = get_console()
    console.print(f"[bold]{_detail_heading(result)}[/bold]")
    _render_metadata_human(result)
    if not result.groups:
        console.print(f"[dim]{_empty_message(result)}[/dim]")
        return

    for group in result.groups:
        console.print()
        console.print(f"[bold cyan]{group.slug}[/bold cyan]")
        console.print(_status_source_summary(result, group))
        console.print()
        console.print("[bold]Work branches[/bold]")
        if not group.branches:
            console.print("[dim]No work branches.[/dim]")
            continue
        table = make_table()
        table.add_column(
            "Branch",
            style="bold",
            no_wrap=True,
            overflow="ellipsis",
            ratio=1,
        )
        table.add_column("Parent", no_wrap=True, overflow="ellipsis", ratio=1)
        table.add_column("Branch status", no_wrap=True, width=13)
        table.add_column("Update age", no_wrap=True)
        table.add_column("Slice commits", justify="right", no_wrap=True)
        for entry in group.branches:
            table.add_row(
                entry.branch,
                entry.parent_branch,
                _status_label(entry.status),
                _format_age(entry.updated_iso),
                f"+{entry.slice_commits}",
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
    click.echo()
    _render_metadata_markdown(result)
    if not result.groups:
        click.echo()
        click.echo(_empty_message(result))
        return

    click.echo()
    click.echo(
        "| objective | status | latest work | latest update | work branches | max slice commits |"
    )
    click.echo("| --- | --- | --- | --- | ---: | ---: |")
    for group in result.groups:
        click.echo(
            "| "
            f"{group.slug} | "
            f"{_status_label(group.status)} | "
            f"{_format_optional_branch_md(group.latest_work_branch)} | "
            f"{_format_age(group.latest_update_iso)} | "
            f"{len(group.branches)} | "
            f"+{_max_slice_commits(group)} |"
        )


def _render_objective_list_detail_markdown(result: ObjectiveListResult) -> None:
    click.echo(f"# {_detail_heading(result)}")
    click.echo()
    _render_metadata_markdown(result)
    if not result.groups:
        click.echo()
        click.echo(_empty_message(result))
        return

    for group in result.groups:
        click.echo()
        click.echo(f"## {group.slug}")
        click.echo()
        click.echo(_status_source_summary(result, group))
        click.echo()
        click.echo("### Work branches")
        if not group.branches:
            click.echo()
            click.echo("No work branches.")
            continue
        click.echo()
        click.echo("| branch | parent | branch status | update age | slice commits |")
        click.echo("| --- | --- | --- | --- | ---: |")
        for entry in group.branches:
            click.echo(
                f"| `{entry.branch}` | "
                f"`{entry.parent_branch}` | "
                f"{_status_label(entry.status)} | "
                f"{_format_age(entry.updated_iso)} | "
                f"+{entry.slice_commits} |"
            )


def _render_slugs(result: ObjectiveListResult) -> None:
    for group in result.groups:
        click.echo(group.slug)


def _render_metadata_human(result: ObjectiveListResult) -> None:
    if result.status_source == "current":
        get_console().print("Status source: current branch")
    else:
        get_console().print(f"Base branch: {result.base_branch}")
    get_console().print(f"Status filter: {result.status_filter}")
    get_console().print()


def _render_metadata_markdown(result: ObjectiveListResult) -> None:
    if result.status_source == "current":
        click.echo("Status source: `current branch`")
    else:
        click.echo(f"Base branch: `{result.base_branch}`")
    click.echo(f"Status filter: `{result.status_filter}`")


def _status_label(status: ObjectiveStatus | ObjectiveRecordStatus) -> str:
    if status == "closed":
        return "✓ closed"
    if status == "in-flight":
        return "◇ in-flight"
    return "○ open"


def _list_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Objective status for current branch `{result.current_branch}`"
    return "Objective status in this local repository"


def _detail_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Objective branch details for current branch `{result.current_branch}`"
    return "Objective branch details in this local repository"


def _status_source_summary(result: ObjectiveListResult, group: ObjectiveListGroup) -> str:
    label = "Current branch" if result.status_source == "current" else "Base branch"
    summary = (
        f"{label}: {group.status_source_entry.branch} — "
        f"{_status_label(group.status_source_entry.status)}"
    )
    if group.status_source_entry.updated_iso is None:
        return summary
    return f"{summary} — updated {_format_age(group.status_source_entry.updated_iso)}"


def _empty_message(result: ObjectiveListResult) -> str:
    if result.filtered_to_current:
        if result.current_branch is None:
            return "No current branch (detached HEAD); no active Objectives to list."
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


def _format_optional_branch(branch: str | None) -> str:
    if branch is None:
        return "—"
    return branch


def _format_optional_branch_md(branch: str | None) -> str:
    if branch is None:
        return "—"
    return f"`{branch}`"


def _format_age(iso_timestamp: str | None) -> str:
    formatted = format_relative_time(iso_timestamp)
    if formatted == "":
        return "—"
    return formatted


def _max_slice_commits(group: ObjectiveListGroup) -> int:
    return max((entry.slice_commits for entry in group.branches), default=0)
