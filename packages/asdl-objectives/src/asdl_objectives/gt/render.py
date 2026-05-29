"""Human and Markdown rendering for ``objective gt stacks``.

Pure presentation over :class:`ObjectiveGtStacksResult`. Glyphs, indentation,
status labels, annotations, and relative time live here — never in JSON.
"""

from __future__ import annotations

import click
from rich.console import Console

from asdl_core.console import get_console
from asdl_core.format import format_relative_time
from asdl_objectives.gt.models import (
    ObjectiveGtLatestWork,
    ObjectiveGtStackObjective,
    ObjectiveGtStackRow,
    ObjectiveGtStackSegment,
    ObjectiveGtStacksResult,
)

# Branch glyphs (blueprint §3.2 / §6.1).
_OBJECTIVE_GLYPH = "◆"
_CONNECTOR_GLYPH = "◇"

# Status labels, used verbatim in both text formats (blueprint §3.2).
_STATUS_LABELS = {
    "open": "○ open",
    "closed": "✓ closed",
    "in-flight": "◇ in-flight",
}

# Validation results that are routine/healthy and produce no annotation.
_HEALTHY_VALIDATION = {None, "OK", "VALID", "TRUNK"}

_EMPTY_MESSAGE = "No Objective stack work found."


# ---------------------------------------------------------------------------
# Shared presentation helpers
# ---------------------------------------------------------------------------


def _status_label(status: str) -> str:
    return _STATUS_LABELS.get(status, status)


def _glyph(row: ObjectiveGtStackRow) -> str:
    return _OBJECTIVE_GLYPH if row.touches_objective else _CONNECTOR_GLYPH


def _row_annotation(row: ObjectiveGtStackRow) -> str:
    """Build the ``  (item; item)`` annotation suffix, or ``""`` when none.

    Items, in order: also-touches, then exactly one restack-health item.
    """
    items: list[str] = []
    if row.also_touches:
        items.append(f"also: {', '.join(row.also_touches)}")
    health = _restack_health(row)
    if health is not None:
        items.append(health)
    if not items:
        return ""
    return f"  ({'; '.join(items)})"


def _restack_health(row: ObjectiveGtStackRow) -> str | None:
    if row.needs_restack:
        return "needs restack"
    if row.validation_result in _HEALTHY_VALIDATION:
        return None
    return f"gt: {row.validation_result}"


def _objective_branches_label(count: int) -> str:
    noun = "objective branch" if count == 1 else "objective branches"
    return f"{count} {noun}"


def _segments_label(count: int) -> str:
    noun = "segment" if count == 1 else "segments"
    return f"{count} {noun}"


def _latest_human(latest: ObjectiveGtLatestWork | None) -> str:
    if latest is None:
        return "—"
    relative = format_relative_time(latest.committed_iso)
    if relative == "":
        return latest.branch
    return f"{latest.branch} ({relative})"


def _latest_markdown(latest: ObjectiveGtLatestWork | None) -> str:
    if latest is None:
        return "—"
    return f"`{latest.branch}` at `{latest.committed_iso}` (`{latest.oid}`)"


# ---------------------------------------------------------------------------
# Human renderer (blueprint §3.3 / §6.3)
# ---------------------------------------------------------------------------


def render_stacks_human(result: ObjectiveGtStacksResult) -> None:
    console = get_console()
    console.print("Objective stacks")
    console.print(f"Graphite trunk: {result.trunk_branch}")
    console.print()

    if result.warnings:
        console.print("Warnings:")
        for warning in result.warnings:
            console.print(f"  - {warning}")
        console.print()

    if not result.objectives:
        console.print(f"[dim]{_EMPTY_MESSAGE}[/dim]")
        return

    for index, objective in enumerate(result.objectives):
        if index > 0:
            console.print()
        _render_objective_human(console, objective)


def _render_objective_human(console: Console, objective: ObjectiveGtStackObjective) -> None:
    header = (
        f"{_status_label(objective.status)} {objective.slug}  "
        f"{_objective_branches_label(objective.objective_branch_count)}  "
        f"{_segments_label(objective.segment_count)}  "
        f"latest: {_latest_human(objective.latest_work)}"
    )
    console.print(header)
    for segment in objective.segments:
        console.print()
        console.print(f"  segment {segment.index}")
        for row in segment.rows:
            lead = " " * (4 + 2 * max(0, row.depth - 1))
            console.print(f"{lead}{_glyph(row)} {row.branch}{_row_annotation(row)}")


# ---------------------------------------------------------------------------
# Markdown renderer (blueprint §3.4 / §6.4)
# ---------------------------------------------------------------------------


def render_stacks_markdown(result: ObjectiveGtStacksResult) -> None:
    click.echo("# Objective stacks")
    click.echo()
    click.echo(f"Graphite trunk: `{result.trunk_branch}`")
    click.echo()

    if result.warnings:
        click.echo("Warnings:")
        for warning in result.warnings:
            click.echo(f"- {warning}")
        click.echo()

    if not result.objectives:
        click.echo(_EMPTY_MESSAGE)
        return

    for index, objective in enumerate(result.objectives):
        if index > 0:
            click.echo()
        _render_objective_markdown(objective)


def _render_objective_markdown(objective: ObjectiveGtStackObjective) -> None:
    click.echo(f"## {_status_label(objective.status)} {objective.slug}")
    click.echo()
    click.echo(f"- objective branches: {objective.objective_branch_count}")
    click.echo(f"- segments: {objective.segment_count}")
    click.echo(f"- latest: {_latest_markdown(objective.latest_work)}")
    click.echo()
    click.echo("```text")
    for index, segment in enumerate(objective.segments):
        if index > 0:
            click.echo()
        _render_segment_markdown(segment)
    click.echo("```")


def _render_segment_markdown(segment: ObjectiveGtStackSegment) -> None:
    click.echo(f"segment {segment.index}")
    for row in segment.rows:
        lead = " " * (2 * row.depth)
        click.echo(f"{lead}{_glyph(row)} {row.branch}{_row_annotation(row)}")
