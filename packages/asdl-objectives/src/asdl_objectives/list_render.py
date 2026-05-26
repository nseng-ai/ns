"""Human and Markdown rendering for ``objective list``."""

from __future__ import annotations

import click

from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_objectives.list_models import ObjectiveListResult
from asdl_objectives.list_status import ObjectiveStatus, ObjectiveStatusFilter


def render_objective_list_human(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    console = get_console()
    console.print("[bold]Objective records in this checkout[/bold]")
    _render_metadata_human(result)
    if not result.records:
        console.print(f"[dim]{_empty_message(result.status_filter)}[/dim]")
        return

    table = make_table()
    table.add_column(
        "Objective",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        ratio=1,
    )
    table.add_column("Status", no_wrap=True, width=9)
    table.add_column("Latest update", no_wrap=True)
    for record in result.records:
        table.add_row(
            record.slug,
            _status_label(record.status),
            _format_age(record.latest_update_iso),
        )
    console.print(table)


def render_objective_list_markdown(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    click.echo("# Objective records in this checkout")
    click.echo()
    _render_metadata_markdown(result)
    if not result.records:
        click.echo()
        click.echo(_empty_message(result.status_filter))
        return

    click.echo()
    click.echo("| objective | status | latest update |")
    click.echo("| --- | --- | --- |")
    for record in result.records:
        click.echo(
            "| "
            f"{record.slug} | "
            f"{_status_label(record.status)} | "
            f"{_format_age(record.latest_update_iso)} |"
        )


def _render_slugs(result: ObjectiveListResult) -> None:
    for record in result.records:
        click.echo(record.slug)


def _render_metadata_human(result: ObjectiveListResult) -> None:
    console = get_console()
    console.print(f"Root: {result.root_path}")
    console.print(f"Status filter: {result.status_filter}")
    console.print()


def _render_metadata_markdown(result: ObjectiveListResult) -> None:
    click.echo(f"Root: `{result.root_path}`")
    click.echo(f"Status filter: `{result.status_filter}`")


def _status_label(status: ObjectiveStatus) -> str:
    if status == "closed":
        return "✓ closed"
    return "○ open"


def _empty_message(status_filter: ObjectiveStatusFilter) -> str:
    if status_filter in {"active", "open"}:
        return "No open Objective records found."
    if status_filter == "closed":
        return "No closed Objective records found."
    return "No Objective records found."


def _format_age(iso_timestamp: str | None) -> str:
    formatted = format_relative_time(iso_timestamp)
    if formatted == "":
        return "—"
    return formatted
