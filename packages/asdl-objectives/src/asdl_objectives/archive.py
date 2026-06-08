"""``objective archive`` directory move command."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliUnavailable, load_objective_context
from asdl_objectives.objective_storage import (
    FilesystemObjectiveStorage,
    ObjectiveArchiveDirection,
    archive_empty_destination_relative_path,
    archive_empty_source_relative_path,
    is_valid_objective_slug,
)

ObjectiveArchiveStatus = Literal[
    "archived",
    "unarchived",
    "missing_slug",
    "invalid_slug",
    "source_not_found",
    "source_not_directory",
    "destination_exists",
]


class ObjectiveArchiveRequest(ClinkrModel):
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None
    unarchive: Annotated[
        bool,
        click.Option(
            ["--unarchive"],
            is_flag=True,
            default=False,
            help="Move from archive back to active Objectives.",
        ),
    ] = False


class ObjectiveArchiveResult(ClinkrModel):
    status: ObjectiveArchiveStatus
    error: str | None
    slug: str | None
    direction: ObjectiveArchiveDirection
    source_path: str
    destination_path: str
    source_exists: bool
    destination_exists: bool
    moved: bool


def render_archive_objective(result: ObjectiveArchiveResult) -> None:
    if result.status == "archived":
        click.echo(f"Archived Objective `{result.slug}`.")
    elif result.status == "unarchived":
        click.echo(f"Unarchived Objective `{result.slug}`.")
    else:
        click.echo(result.error or result.status)
        return

    click.echo()
    click.echo("Moved:")
    click.echo(f"  {result.source_path}")
    click.echo(f"  -> {result.destination_path}")


@clinkr_operation(
    name="archive",
    help="Archive or unarchive an Objective record by moving its directory.",
    human_renderer=render_archive_objective,
)
def run_archive_objective(
    ctx: click.Context,
    request: ObjectiveArchiveRequest,
) -> ClinkrExit[ObjectiveArchiveResult]:
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)

    direction: ObjectiveArchiveDirection = "unarchive" if request.unarchive else "archive"
    if request.slug is None:
        raise ClinkrExit.negative(
            _empty_result(
                status="missing_slug",
                error="missing_slug",
                direction=direction,
            ),
            message="Missing Objective slug. Pass an explicit slug.",
        )

    if not is_valid_objective_slug(request.slug):
        raise ClinkrExit.negative(
            _empty_result(
                status="invalid_slug",
                error="invalid_slug",
                direction=direction,
            ),
            message=f"Invalid Objective slug {request.slug!r}. Pass a single slug, not a path.",
        )

    storage = FilesystemObjectiveStorage(objective_ctx.repo_root)
    move_paths = storage.move_paths(request.slug, direction=direction)
    source_exists = move_paths.source.exists()
    destination_exists = move_paths.destination.exists()
    if not source_exists:
        raise ClinkrExit.negative(
            _result(
                status="source_not_found",
                error="source_not_found",
                slug=request.slug,
                direction=direction,
                source_path=move_paths.relative_source,
                destination_path=move_paths.relative_destination,
                source_exists=False,
                destination_exists=destination_exists,
                moved=False,
            ),
            message=_source_not_found_message(
                request.slug,
                direction=direction,
                source_path=move_paths.relative_source,
            ),
        )

    if not move_paths.source.is_dir():
        raise ClinkrExit.negative(
            _result(
                status="source_not_directory",
                error="source_not_directory",
                slug=request.slug,
                direction=direction,
                source_path=move_paths.relative_source,
                destination_path=move_paths.relative_destination,
                source_exists=True,
                destination_exists=destination_exists,
                moved=False,
            ),
            message=(
                f"Objective source path for slug {request.slug!r} is not a directory: "
                f"{move_paths.relative_source.as_posix()}."
            ),
        )

    if destination_exists:
        raise ClinkrExit.negative(
            _result(
                status="destination_exists",
                error="destination_exists",
                slug=request.slug,
                direction=direction,
                source_path=move_paths.relative_source,
                destination_path=move_paths.relative_destination,
                source_exists=True,
                destination_exists=True,
                moved=False,
            ),
            message=(
                f"Destination already exists for slug {request.slug!r}: "
                f"{move_paths.relative_destination.as_posix()}. Refusing to merge or overwrite."
            ),
        )

    storage.move_record(move_paths)
    status: ObjectiveArchiveStatus = "unarchived" if direction == "unarchive" else "archived"
    return ClinkrExit.ok(
        _result(
            status=status,
            error=None,
            slug=request.slug,
            direction=direction,
            source_path=move_paths.relative_source,
            destination_path=move_paths.relative_destination,
            source_exists=False,
            destination_exists=True,
            moved=True,
        )
    )


def _empty_result(
    *,
    status: ObjectiveArchiveStatus,
    error: str,
    direction: ObjectiveArchiveDirection,
) -> ObjectiveArchiveResult:
    return ObjectiveArchiveResult(
        status=status,
        error=error,
        slug=None,
        direction=direction,
        source_path=archive_empty_source_relative_path(direction).as_posix(),
        destination_path=archive_empty_destination_relative_path(direction).as_posix(),
        source_exists=False,
        destination_exists=False,
        moved=False,
    )


def _result(
    *,
    status: ObjectiveArchiveStatus,
    error: str | None,
    slug: str,
    direction: ObjectiveArchiveDirection,
    source_path: Path,
    destination_path: Path,
    source_exists: bool,
    destination_exists: bool,
    moved: bool,
) -> ObjectiveArchiveResult:
    return ObjectiveArchiveResult(
        status=status,
        error=error,
        slug=slug,
        direction=direction,
        source_path=source_path.as_posix(),
        destination_path=destination_path.as_posix(),
        source_exists=source_exists,
        destination_exists=destination_exists,
        moved=moved,
    )


def _source_not_found_message(
    slug: str,
    *,
    direction: ObjectiveArchiveDirection,
    source_path: Path,
) -> str:
    source_label = "archived" if direction == "unarchive" else "active"
    return (
        f"No {source_label} Objective record found for slug {slug!r} at {source_path.as_posix()}."
    )
