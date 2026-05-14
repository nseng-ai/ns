"""``objective list`` filesystem inventory and renderers."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_objectives.exec.inventory import (
    ObjectiveFiles,
    build_objective_files,
    list_update_files,
    relative_record_path,
    relative_root_path,
    render_file_presence,
)

ObjectiveListState = Literal["all", "open", "closed"]


class ObjectiveListRequest(ClinkrModel):
    state: Annotated[
        ObjectiveListState,
        click.Option(
            ["--state"],
            type=click.Choice(["all", "open", "closed"]),
            default="open",
            show_default=True,
            help="Filter Objective records by closed state.",
        ),
    ] = "open"


class ObjectiveListEntry(ClinkrModel):
    slug: str
    path: str
    closed: bool
    files: ObjectiveFiles
    update_count: int


class ObjectiveListResult(ClinkrModel):
    root_path: str
    root_exists: bool
    state: ObjectiveListState
    entries: tuple[ObjectiveListEntry, ...]


def render_objective_list_markdown(result: ObjectiveListResult) -> None:
    root_state = "present" if result.root_exists else "missing"
    click.echo(f"Root: `{result.root_path}` ({root_state})")
    click.echo()
    click.echo("| slug | state | files | updates | path |")
    click.echo("| --- | --- | --- | ---: | --- |")
    for entry in result.entries:
        click.echo(
            "| "
            f"{entry.slug} | "
            f"{'closed' if entry.closed else 'open'} | "
            f"{render_file_presence(entry.files)} | "
            f"{entry.update_count} | "
            f"`{entry.path}` |"
        )


def render_objective_list_human(result: ObjectiveListResult) -> None:
    console = get_console()
    root_state = "present" if result.root_exists else "missing"
    state_color = "green" if result.root_exists else "red"
    console.print(
        f"Root: [bold]{result.root_path}[/bold] ([{state_color}]{root_state}[/{state_color}])"
    )

    if not result.entries:
        console.print(f"[dim]{_empty_records_message(result.state)}[/dim]")
        return

    table = make_table()
    table.add_column("Slug", style="bold cyan", no_wrap=True)
    table.add_column("State", no_wrap=True)
    table.add_column("Files", no_wrap=True)
    table.add_column("Updates", justify="right", no_wrap=True)
    table.add_column("Path", style="dim", overflow="ellipsis", ratio=1)

    for entry in result.entries:
        state_label = "[red]closed[/red]" if entry.closed else "[green]open[/green]"
        table.add_row(
            entry.slug,
            state_label,
            _render_file_tokens(entry.files),
            str(entry.update_count),
            entry.path,
        )

    console.print(table)


def _empty_records_message(state: ObjectiveListState) -> str:
    if state == "all":
        return "No objective records."
    return f"No {state} objective records."


def _render_file_tokens(files: ObjectiveFiles) -> str:
    return "  ".join(
        (
            _token("obj", files.objective_md),
            _token("rmap", files.roadmap_md),
            _token("upd", files.updates_dir),
            _token("cls", files.closed_md),
        )
    )


def _token(label: str, present: bool) -> str:
    return f"[green]{label}[/green]" if present else f"[dim]{label}[/dim]"


@clinkr_operation(
    name="list",
    help="List checked-in Objective record directories as filesystem facts.",
    human_renderer=render_objective_list_human,
    markdown_renderer=render_objective_list_markdown,
)
def run_list_objectives(
    ctx: click.Context,
    request: ObjectiveListRequest,
) -> ClinkrExit[ObjectiveListResult]:
    del ctx
    return ClinkrExit.ok(_build_objective_list_result(request.state))


def _build_objective_list_result(state: ObjectiveListState = "open") -> ObjectiveListResult:
    root = relative_root_path()
    absolute_root = Path.cwd() / root
    entries: tuple[ObjectiveListEntry, ...] = ()
    if absolute_root.is_dir():
        entries = tuple(
            _build_entry(path)
            for path in sorted(
                (child for child in absolute_root.iterdir() if child.is_dir()),
                key=lambda child: child.name,
            )
        )
        entries = _filter_entries(entries, state)
    return ObjectiveListResult(
        root_path=root.as_posix(),
        root_exists=absolute_root.exists(),
        state=state,
        entries=entries,
    )


def _filter_entries(
    entries: tuple[ObjectiveListEntry, ...],
    state: ObjectiveListState,
) -> tuple[ObjectiveListEntry, ...]:
    if state == "open":
        return tuple(entry for entry in entries if not entry.closed)
    if state == "closed":
        return tuple(entry for entry in entries if entry.closed)
    return entries


def _build_entry(path: Path) -> ObjectiveListEntry:
    relative_path = relative_record_path(path.name)
    files = build_objective_files(path)
    updates = list_update_files(path)
    return ObjectiveListEntry(
        slug=path.name,
        path=relative_path.as_posix(),
        closed=files.closed_md,
        files=files,
        update_count=len(updates),
    )
