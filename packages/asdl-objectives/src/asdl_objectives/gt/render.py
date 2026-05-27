"""Text renderers for ``objective gt stacks``."""

from __future__ import annotations

import click

from asdl_core.console import get_console
from asdl_core.format import format_relative_time
from asdl_objectives.gt.models import (
    ObjectiveGtStacksLatestWork,
    ObjectiveGtStacksObjective,
    ObjectiveGtStacksResult,
    ObjectiveGtStacksRow,
)


def render_objective_gt_stacks_human(result: ObjectiveGtStacksResult) -> None:
    console = get_console()
    console.print("[bold]Objective stacks[/bold]")
    click.echo(f"Graphite trunk: {result.trunk_branch}")
    click.echo()
    _render_warnings_human(result.warnings)

    if not result.objectives:
        console.print("[dim]No Objective stack work found.[/dim]")
        return

    for objective_index, objective in enumerate(result.objectives):
        if objective_index > 0:
            click.echo()
        _render_objective_human(objective)


def render_objective_gt_stacks_markdown(result: ObjectiveGtStacksResult) -> None:
    click.echo("# Objective stacks")
    click.echo()
    click.echo(f"Graphite trunk: `{result.trunk_branch}`")
    click.echo()
    _render_warnings_markdown(result.warnings)

    if not result.objectives:
        click.echo("No Objective stack work found.")
        return

    for objective_index, objective in enumerate(result.objectives):
        if objective_index > 0:
            click.echo()
        _render_objective_markdown(objective)


def _render_warnings_human(warnings: tuple[str, ...]) -> None:
    if not warnings:
        return
    click.echo("Warnings:")
    for warning in warnings:
        click.echo(f"  - {warning}")
    click.echo()


def _render_warnings_markdown(warnings: tuple[str, ...]) -> None:
    if not warnings:
        return
    click.echo("Warnings:")
    for warning in warnings:
        click.echo(f"- {warning}")
    click.echo()


def _render_objective_human(objective: ObjectiveGtStacksObjective) -> None:
    click.echo(
        f"{_status_label(objective.status)} {objective.slug}  "
        f"{_pluralize(objective.objective_branch_count, 'objective branch')}  "
        f"{_pluralize(objective.segment_count, 'segment')}  "
        f"latest: {_format_latest_human(objective.latest_work)}"
    )
    for segment in objective.segments:
        click.echo()
        click.echo(f"  segment {segment.index}")
        for row in segment.rows:
            click.echo(f"    {_branch_row_text(row, human=True)}")


def _render_objective_markdown(objective: ObjectiveGtStacksObjective) -> None:
    click.echo(f"## {_status_label(objective.status)} {objective.slug}")
    click.echo()
    click.echo(f"- objective branches: {objective.objective_branch_count}")
    click.echo(f"- segments: {objective.segment_count}")
    click.echo(f"- latest: {_format_latest_markdown(objective.latest_work)}")
    click.echo()
    click.echo("```text")
    for segment_index, segment in enumerate(objective.segments):
        if segment_index > 0:
            click.echo()
        click.echo(f"segment {segment.index}")
        for row in segment.rows:
            click.echo(_branch_row_text(row, human=False))
    click.echo("```")


def _branch_row_text(row: ObjectiveGtStacksRow, *, human: bool) -> str:
    if human:
        indent = "  " * row.depth
    else:
        indent = "  " * row.depth
    return f"{indent}{_branch_glyph(row)} {row.branch}{_annotation(row)}"


def _branch_glyph(row: ObjectiveGtStacksRow) -> str:
    if row.touches_objective:
        return "◆"
    return "◇"


def _annotation(row: ObjectiveGtStacksRow) -> str:
    items: list[str] = []
    if row.also_touches:
        items.append(f"also: {', '.join(row.also_touches)}")
    restack_annotation = _restack_annotation(row)
    if restack_annotation is not None:
        items.append(restack_annotation)
    if not items:
        return ""
    return f"  ({'; '.join(items)})"


def _restack_annotation(row: ObjectiveGtStacksRow) -> str | None:
    if row.needs_restack:
        return "needs restack"
    if row.validation_result is None:
        return None
    normalized = row.validation_result.strip().lower()
    if normalized in {"", "ok", "valid", "trunk"}:
        return None
    return f"gt: {row.validation_result}"


def _status_label(status: str) -> str:
    if status == "closed":
        return "✓ closed"
    if status == "in-flight":
        return "◇ in-flight"
    return "○ open"


def _pluralize(count: int, noun: str) -> str:
    if count == 1:
        return f"1 {noun}"
    if noun == "objective branch":
        return f"{count} objective branches"
    return f"{count} {noun}s"


def _format_latest_human(latest_work: ObjectiveGtStacksLatestWork | None) -> str:
    if latest_work is None:
        return "—"
    relative_time = format_relative_time(latest_work.committed_iso)
    if relative_time == "":
        return latest_work.branch
    return f"{latest_work.branch} ({relative_time})"


def _format_latest_markdown(latest_work: ObjectiveGtStacksLatestWork | None) -> str:
    if latest_work is None:
        return "—"
    return f"`{latest_work.branch}` at `{latest_work.committed_iso}` (`{latest_work.oid}`)"
