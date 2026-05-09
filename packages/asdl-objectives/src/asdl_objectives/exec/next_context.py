"""``objective exec next-context`` — deterministic context for objective-next."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import (
    BODY_FILE,
    NOTES_FILE,
    ROADMAP_FILE,
    body_key,
    notes_key,
    roadmap_key,
)
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from asdl_objectives.snapshot_state import ObjectiveSnapshotState, classify_branch_snapshot_state
from asdl_objectives.trunk_resolution import resolve_trunk


class ObjectiveNextContextRequest(ClinkrModel):
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


class NextContextResult(ClinkrModel):
    current_branch: str
    trunk_branch: str
    on_trunk: bool
    slug: str
    files_present: list[str]
    snapshot_state: ObjectiveSnapshotState | None
    snapshot_state_advisory: str | None
    notes_present: bool
    body_content: str
    roadmap_content: str | None
    notes_content: str | None


def render_next_context(result: NextContextResult) -> None:
    if result.snapshot_state_advisory is not None:
        click.echo(
            f"> Snapshot is stale. Consider running `objective-update {result.slug}` "
            "before creating the next slice branch."
        )
        click.echo()

    files = ", ".join(result.files_present) if result.files_present else "none"
    notes = "present" if result.notes_present else "none"
    snapshot_state = result.snapshot_state or "skipped"

    click.echo(f"# Objective next context: `{result.slug}`")
    click.echo()
    click.echo(f"Current branch: `{result.current_branch}`")
    click.echo(f"Trunk branch: `{result.trunk_branch}`")
    click.echo(f"On trunk: {str(result.on_trunk).lower()}")
    click.echo(f"Files: {files}")
    click.echo(f"Snapshot state: {snapshot_state}")
    click.echo(f"Notes: {notes}")
    if result.snapshot_state_advisory is not None:
        click.echo(f"Advisory: {result.snapshot_state_advisory}")


@clinkr_operation(
    name="next-context",
    help=(
        "Emit deterministic objective-next facts: branch/trunk preflight, "
        "slug resolution, raw objective content, and snapshot state. Markdown "
        "interpretation stays with the caller."
    ),
    human_renderer=render_next_context,
)
def run_next_context_objective(
    ctx: click.Context,
    request: ObjectiveNextContextRequest,
) -> ClinkrExit[NextContextResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    current_branch = _resolve_current_branch(mctx)
    trunk = resolve_trunk(mctx.git_gateway).trunk
    on_trunk = current_branch == trunk
    slug = _resolve_context_slug(
        mctx,
        request.slug,
        current_branch=current_branch,
        on_trunk=on_trunk,
    )

    body_content = mctx.brmem_gateway.get(OBJECTIVE_NAMESPACE, body_key(slug), current_branch)
    if body_content is None or not body_content.strip():
        raise ClinkrFailure(
            error_type="no_objective_on_branch",
            message=f"No objective body for slug {slug!r} on branch {current_branch!r}.",
        )

    roadmap_content = mctx.brmem_gateway.get(OBJECTIVE_NAMESPACE, roadmap_key(slug), current_branch)
    notes_content = mctx.brmem_gateway.get(OBJECTIVE_NAMESPACE, notes_key(slug), current_branch)
    files_present = _files_present(
        body_content=body_content,
        roadmap_content=roadmap_content,
        notes_content=notes_content,
    )

    snapshot_state: ObjectiveSnapshotState | None = None
    snapshot_state_advisory: str | None = None
    if not on_trunk:
        snapshot_state = classify_branch_snapshot_state(
            mctx.brmem_gateway,
            mctx.git_gateway,
            current_branch,
            slug,
            trunk=trunk,
            alive=True,
        )
        if snapshot_state == "stale":
            snapshot_state_advisory = (
                f"Snapshot is behind HEAD on {current_branch} — "
                f"consider running objective-update {slug} first."
            )

    return ClinkrExit.ok(
        NextContextResult(
            current_branch=current_branch,
            trunk_branch=trunk,
            on_trunk=on_trunk,
            slug=slug,
            files_present=files_present,
            snapshot_state=snapshot_state,
            snapshot_state_advisory=snapshot_state_advisory,
            notes_present=notes_content is not None and bool(notes_content.strip()),
            body_content=body_content,
            roadmap_content=roadmap_content,
            notes_content=notes_content,
        )
    )


def _resolve_current_branch(mctx: ObjectiveCliContext) -> str:
    current_branch_result = mctx.git_gateway.get_current_branch(Path.cwd())
    match current_branch_result:
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: objective-next requires a checked-out branch.",
            )
        case str() as current_branch:
            return current_branch


def _resolve_context_slug(
    mctx: ObjectiveCliContext,
    requested_slug: str | None,
    *,
    current_branch: str,
    on_trunk: bool,
) -> str:
    match resolve_slug(mctx, requested_slug, requested_branch=current_branch):
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: objective-next requires a checked-out branch.",
            )
        case NoObjectiveOnBranch() as missing:
            message = (
                f"No canonical objectives on trunk {missing.branch!r}."
                if on_trunk
                else (
                    f"No objective on branch {missing.branch!r}. "
                    "Run `objective-attach <slug>` first."
                )
            )
            raise ClinkrFailure(error_type="no_objective_on_branch", message=message)
        case AmbiguousObjective() as ambiguity:
            names = ", ".join(ambiguity.slugs)
            branch_kind = "trunk" if on_trunk else "branch"
            raise ClinkrFailure(
                error_type="ambiguous_objective",
                message=(
                    f"Multiple objectives on {branch_kind} {ambiguity.branch!r}: {names}. "
                    "Specify a SLUG."
                ),
            )
        case SlugResolution() as resolution:
            return resolution.slug


def _files_present(
    *,
    body_content: str | None,
    roadmap_content: str | None,
    notes_content: str | None,
) -> list[str]:
    files: list[str] = []
    if body_content is not None:
        files.append(BODY_FILE)
    if roadmap_content is not None:
        files.append(ROADMAP_FILE)
    if notes_content is not None:
        files.append(NOTES_FILE)
    return files
