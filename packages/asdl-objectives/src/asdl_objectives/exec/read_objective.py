"""``objective exec read-objective`` filesystem reader."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.exec.inventory import (
    ObjectiveFiles,
    ObjectiveUpdateFile,
    build_objective_files,
    empty_objective_files,
    list_update_files,
    relative_record_path,
    relative_root_path,
    render_file_presence,
)

ReadObjectiveStatus = Literal["ok", "missing_slug", "invalid_slug", "not_found"]


class ReadObjectiveRequest(ClinkrModel):
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


class ReadObjectiveResult(ClinkrModel):
    status: ReadObjectiveStatus
    error: str | None
    root_path: str
    root_exists: bool
    slug: str | None
    path: str | None
    exists: bool
    closed: bool
    files: ObjectiveFiles
    updates: tuple[ObjectiveUpdateFile, ...]
    update_count: int


def render_read_objective(result: ReadObjectiveResult) -> None:
    if result.slug is None or result.path is None:
        click.echo("No Objective record selected.")
        return

    record_path = Path.cwd() / result.path
    root_state = "present" if result.root_exists else "missing"
    state = "closed" if result.closed else "open"

    click.echo(f"# Objective `{result.slug}`")
    click.echo()
    click.echo(f"Root: `{result.root_path}` ({root_state})")
    click.echo(f"Path: `{result.path}`")
    click.echo(f"State: {state}")
    click.echo(f"Files: {render_file_presence(result.files)}")
    click.echo(f"Updates: {result.update_count}")
    click.echo()

    _render_markdown_file(record_path / "objective.md", "objective.md")
    _render_markdown_file(record_path / "roadmap.md", "roadmap.md")
    _render_updates(result, record_path)


@clinkr_operation(
    name="read-objective",
    help="Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
    human_renderer=render_read_objective,
)
def run_read_objective(
    ctx: click.Context,
    request: ReadObjectiveRequest,
) -> ClinkrExit[ReadObjectiveResult]:
    del ctx
    root = relative_root_path()
    absolute_root = Path.cwd() / root
    root_exists = absolute_root.exists()

    if request.slug is None:
        raise ClinkrExit.negative(
            _empty_result(
                status="missing_slug",
                error="missing_slug",
                slug=None,
                path=None,
                root_exists=root_exists,
            ),
            message="Missing Objective slug. Pass an explicit slug.",
        )

    if not _is_valid_slug(request.slug):
        raise ClinkrExit.negative(
            _empty_result(
                status="invalid_slug",
                error="invalid_slug",
                slug=None,
                path=None,
                root_exists=root_exists,
            ),
            message=f"Invalid Objective slug {request.slug!r}. Pass a single slug, not a path.",
        )

    relative_path = relative_record_path(request.slug)
    absolute_path = Path.cwd() / relative_path
    if not absolute_path.is_dir():
        raise ClinkrExit.negative(
            _empty_result(
                status="not_found",
                error="not_found",
                slug=request.slug,
                path=relative_path.as_posix(),
                root_exists=root_exists,
            ),
            message=f"No Objective record found for slug {request.slug!r}.",
        )

    files = build_objective_files(absolute_path)
    updates = list_update_files(absolute_path)
    return ClinkrExit.ok(
        ReadObjectiveResult(
            status="ok",
            error=None,
            root_path=root.as_posix(),
            root_exists=root_exists,
            slug=request.slug,
            path=relative_path.as_posix(),
            exists=True,
            closed=files.closed_md,
            files=files,
            updates=updates,
            update_count=len(updates),
        )
    )


def _is_valid_slug(slug: str) -> bool:
    return slug not in {"", ".", ".."} and "/" not in slug and "\\" not in slug


def _empty_result(
    *,
    status: ReadObjectiveStatus,
    error: str,
    slug: str | None,
    path: str | None,
    root_exists: bool,
) -> ReadObjectiveResult:
    return ReadObjectiveResult(
        status=status,
        error=error,
        root_path=relative_root_path().as_posix(),
        root_exists=root_exists,
        slug=slug,
        path=path,
        exists=False,
        closed=False,
        files=empty_objective_files(),
        updates=(),
        update_count=0,
    )


def _render_markdown_file(path: Path, display_path: str) -> None:
    click.echo(f"## {display_path}")
    click.echo()
    if not path.is_file():
        click.echo(f"_Missing `{display_path}`._")
        click.echo()
        return

    content = path.read_text(encoding="utf-8")
    click.echo(content, nl=False)
    if not content.endswith("\n"):
        click.echo()
    click.echo()


def _render_updates(result: ReadObjectiveResult, record_path: Path) -> None:
    if not result.files.updates_dir:
        click.echo("## updates/")
        click.echo()
        click.echo("_Missing `updates/` directory._")
        click.echo()
        return

    if not result.updates:
        click.echo("## updates/")
        click.echo()
        click.echo("_No direct update Markdown files found._")
        click.echo()
        return

    for update in result.updates:
        _render_markdown_file(record_path / "updates" / update.name, f"updates/{update.name}")
