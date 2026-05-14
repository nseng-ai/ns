"""``initiative exec list`` filesystem inventory."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation


class InitiativeListRequest(ClinkrModel):
    pass


class InitiativeFiles(ClinkrModel):
    initiative_md: bool
    roadmap_md: bool
    updates_dir: bool
    closed_md: bool


class InitiativeListEntry(ClinkrModel):
    slug: str
    path: str
    closed: bool
    files: InitiativeFiles
    update_count: int


class InitiativeListResult(ClinkrModel):
    root_path: str
    root_exists: bool
    entries: tuple[InitiativeListEntry, ...]


def render_initiative_list(result: InitiativeListResult) -> None:
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
            f"{_render_file_presence(entry.files)} | "
            f"{entry.update_count} | "
            f"`{entry.path}` |"
        )


@clinkr_operation(
    name="list",
    help="List checked-in Initiative record directories as filesystem facts.",
    human_renderer=render_initiative_list,
)
def run_list_initiatives(
    ctx: click.Context,
    request: InitiativeListRequest,
) -> ClinkrExit[InitiativeListResult]:
    del ctx, request
    return ClinkrExit.ok(_build_initiative_list_result())


def _build_initiative_list_result() -> InitiativeListResult:
    root = _relative_root_path()
    absolute_root = Path.cwd() / root
    entries: tuple[InitiativeListEntry, ...] = ()
    if absolute_root.is_dir():
        entries = tuple(
            _build_entry(path)
            for path in sorted(
                (child for child in absolute_root.iterdir() if child.is_dir()),
                key=lambda child: child.name,
            )
        )
    return InitiativeListResult(
        root_path=root.as_posix(),
        root_exists=absolute_root.exists(),
        entries=entries,
    )


def _build_entry(path: Path) -> InitiativeListEntry:
    relative_path = _relative_root_path() / path.name
    files = InitiativeFiles(
        initiative_md=(path / "initiative.md").is_file(),
        roadmap_md=(path / "roadmap.md").is_file(),
        updates_dir=(path / "updates").is_dir(),
        closed_md=(path / "closed.md").is_file(),
    )
    return InitiativeListEntry(
        slug=path.name,
        path=relative_path.as_posix(),
        closed=files.closed_md,
        files=files,
        update_count=_count_update_files(path / "updates"),
    )


def _count_update_files(updates_dir: Path) -> int:
    if not updates_dir.is_dir():
        return 0
    return sum(1 for child in updates_dir.glob("*.md") if child.is_file())


def _render_file_presence(files: InitiativeFiles) -> str:
    return ", ".join(
        (
            f"initiative.md:{_yes_no(files.initiative_md)}",
            f"roadmap.md:{_yes_no(files.roadmap_md)}",
            f"updates/:{_yes_no(files.updates_dir)}",
            f"closed.md:{_yes_no(files.closed_md)}",
        )
    )


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def _relative_root_path() -> Path:
    return Path(".asdl") / "initiatives"
