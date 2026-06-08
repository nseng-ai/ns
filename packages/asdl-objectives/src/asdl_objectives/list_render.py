"""Human and Markdown rendering for ``objective list``."""

from __future__ import annotations

import click

from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_objectives.list_models import ObjectiveListRecord, ObjectiveListResult
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

    if result.updated_branches_included:
        _render_updated_branch_records_human(result)
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
            _format_latest_update(record),
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
    columns = _markdown_columns(result)
    click.echo(_markdown_table_row(columns))
    click.echo(_markdown_table_row(tuple("---" for _ in columns)))
    for record in result.records:
        click.echo(_markdown_record_row(record, result.updated_branches_included))


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


def _markdown_columns(result: ObjectiveListResult) -> tuple[str, ...]:
    columns = ("objective", "status", "latest update")
    if result.updated_branches_included:
        return (*columns, "updated branches")
    return columns


def _markdown_record_row(
    record: ObjectiveListRecord,
    include_updated_branches: bool,
) -> str:
    cells = (record.slug, _status_label(record.status), _format_latest_update(record))
    if include_updated_branches:
        cells = (*cells, _format_updated_branches(record))
    return _markdown_table_row(cells)


def _markdown_table_row(cells: tuple[str, ...]) -> str:
    return f"| {' | '.join(cells)} |"


def _render_updated_branch_records_human(result: ObjectiveListResult) -> None:
    console = get_console()
    table = make_table()
    table.add_column(
        "Objective",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        width=_updated_branches_objective_column_width(result, console.width),
    )
    table.add_column(
        "Updated branches",
        no_wrap=True,
        overflow="ellipsis",
        ratio=3,
        min_width=20,
    )
    for record in result.records:
        branches = record.updated_branches or ()
        if not branches:
            table.add_row(record.slug, "—")
            continue

        branch_count = len(branches)
        for index, branch in enumerate(branches, start=1):
            objective = record.slug if index == 1 else ""
            table.add_row(objective, _format_branch_line(index, branch_count, branch))
    console.print(table)


def _updated_branches_objective_column_width(
    result: ObjectiveListResult,
    terminal_width: int,
) -> int:
    widest_objective = max(_branch_objective_width(record) for record in result.records)
    objective_width = max(24, terminal_width // 2)
    return min(max(12, widest_objective), objective_width)


def _branch_objective_width(record: ObjectiveListRecord) -> int:
    return len(record.slug)


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


def _format_latest_update(record: ObjectiveListRecord) -> str:
    formatted = _format_age(record.latest_update_iso)
    if record.has_outstanding_changes:
        return f"(x) {formatted}"
    return formatted


def _format_updated_branches(record: ObjectiveListRecord) -> str:
    if record.updated_branches:
        return ", ".join(record.updated_branches)
    return "—"


def _format_branch_line(index: int, branch_count: int, branch: str) -> str:
    marker = _branch_tree_marker(index, branch_count)
    if branch_count == 1:
        return f"{marker} {branch}"
    return f"{marker} {index}/{branch_count} {branch}"


def _branch_tree_marker(index: int, branch_count: int) -> str:
    if index == branch_count:
        return "└"
    return "├"


def _format_age(iso_timestamp: str | None) -> str:
    formatted = format_relative_time(iso_timestamp)
    if formatted == "":
        return "—"
    return formatted
