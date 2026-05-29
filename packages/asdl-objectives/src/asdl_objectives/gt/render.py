"""Human and Markdown renderers for ``objective gt`` commands."""

from __future__ import annotations

import click

from asdl_core.console import get_console
from asdl_core.format import format_relative_time
from asdl_objectives.gt.models import (
    ObjectiveGtLatestWork,
    ObjectiveGtStackObjective,
    ObjectiveGtStackRow,
    ObjectiveGtStacksResult,
)


def render_objective_gt_stacks_human(result: ObjectiveGtStacksResult) -> None:
    console = get_console()
    console.print("[bold]Objective stacks[/bold]")
    console.print(f"Graphite trunk: {result.trunk_branch}")
    _render_warnings_human(result)
    console.print()

    if not result.objectives:
        console.print("[dim]No Objective stack work found.[/dim]")
        return

    for objective in result.objectives:
        console.print(_objective_header(objective))
        for segment in objective.segments:
            console.print(f"\n  segment {segment.index}")
            for row in segment.rows:
                console.print(_row_line(row))
        console.print()


def render_objective_gt_stacks_markdown(result: ObjectiveGtStacksResult) -> None:
    click.echo("# Objective stacks")
    click.echo()
    click.echo(f"Graphite trunk: `{result.trunk_branch}`")
    _render_warnings_markdown(result)

    if not result.objectives:
        click.echo()
        click.echo("No Objective stack work found.")
        return

    for objective in result.objectives:
        click.echo()
        click.echo(f"## {_status_label(objective.status)} {objective.slug}")
        click.echo()
        click.echo(f"- objective branches: {objective.objective_branch_count}")
        click.echo(f"- segments: {objective.segment_count}")
        click.echo(f"- latest: {_latest_markdown(objective.latest_work)}")
        click.echo()
        click.echo("```text")
        for segment in objective.segments:
            click.echo(f"segment {segment.index}")
            for row in segment.rows:
                click.echo(_row_line(row).removeprefix("  "))
            if segment.index != objective.segment_count:
                click.echo()
        click.echo("```")


def _render_warnings_human(result: ObjectiveGtStacksResult) -> None:
    if not result.warnings:
        return

    console = get_console()
    console.print("[yellow]Warnings:[/yellow]")
    for warning in result.warnings:
        console.print(f"  - {warning}")


def _render_warnings_markdown(result: ObjectiveGtStacksResult) -> None:
    if not result.warnings:
        return

    click.echo()
    click.echo("Warnings:")
    for warning in result.warnings:
        click.echo(f"- {warning}")


def _objective_header(objective: ObjectiveGtStackObjective) -> str:
    return (
        f"{_status_label(objective.status)} {objective.slug}  "
        f"{_plural(objective.objective_branch_count, 'objective branch')}  "
        f"{_plural(objective.segment_count, 'segment')}  "
        f"latest: {_latest_human(objective.latest_work)}"
    )


def _row_line(row: ObjectiveGtStackRow) -> str:
    marker = "◆" if row.touches_objective else "◇"
    annotation = _row_annotation(row)
    return f"  {'  ' * row.depth}{marker} {row.branch}{annotation}"


def _row_annotation(row: ObjectiveGtStackRow) -> str:
    annotations: list[str] = []
    if row.also_touches:
        annotations.append(f"also: {', '.join(row.also_touches)}")

    validation_annotation = _validation_annotation(row)
    if validation_annotation is not None:
        annotations.append(validation_annotation)

    if not annotations:
        return ""
    return f"  ({'; '.join(annotations)})"


def _validation_annotation(row: ObjectiveGtStackRow) -> str | None:
    validation_result = row.validation_result
    if row.needs_restack or _is_needs_restack(validation_result):
        return "needs restack"
    if _is_routine_validation_result(validation_result):
        return None
    return f"gt: {validation_result}"


def _is_needs_restack(validation_result: str | None) -> bool:
    if validation_result is None:
        return False
    return validation_result.strip().replace("-", "_").upper() == "NEEDS_RESTACK"


def _is_routine_validation_result(validation_result: str | None) -> bool:
    if validation_result is None:
        return True
    return validation_result.strip().upper() in {"", "OK", "VALID", "TRUNK"}


def _status_label(status: str) -> str:
    if status == "closed":
        return "✓ closed"
    if status == "in-flight":
        return "◇ in-flight"
    return "○ open"


def _latest_human(latest_work: ObjectiveGtLatestWork | None) -> str:
    if latest_work is None:
        return "—"
    formatted = format_relative_time(latest_work.committed_iso)
    if formatted == "":
        return latest_work.branch
    return f"{latest_work.branch} ({formatted})"


def _latest_markdown(latest_work: ObjectiveGtLatestWork | None) -> str:
    if latest_work is None:
        return "—"
    return f"`{latest_work.branch}` at `{latest_work.committed_iso}` (`{latest_work.oid}`)"


def _plural(count: int, noun: str) -> str:
    if count == 1:
        return f"1 {noun}"
    if noun == "objective branch":
        return f"{count} objective branches"
    return f"{count} {noun}s"
