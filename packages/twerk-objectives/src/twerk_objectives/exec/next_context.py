"""``objective exec next-context`` — deterministic context for objective-next."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import (
    BODY_FILE,
    NOTES_FILE,
    ROADMAP_FILE,
    body_key,
    notes_key,
    roadmap_key,
)
from twerk_objectives.freshness import ObjectiveSnapshotState, classify_branch_snapshot
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from twerk_objectives.trunk_resolution import resolve_trunk


@dataclass(frozen=True)
class ObjectiveNextContextRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class NextContextResult(JsonSerializable):
    current_branch: str
    trunk_branch: str
    on_trunk: bool
    slug: str
    files_present: list[str]
    freshness: ObjectiveSnapshotState | None
    freshness_advisory: str | None
    notes_present: bool
    body_content: str
    roadmap_content: str | None
    notes_content: str | None


def render_next_context(result: NextContextResult) -> None:
    if result.freshness_advisory is not None:
        click.echo(
            f"> Snapshot is stale. Consider running `objective-update {result.slug}` "
            "before creating the next slice branch."
        )
        click.echo()

    files = ", ".join(result.files_present) if result.files_present else "none"
    notes = "present" if result.notes_present else "none"
    freshness = result.freshness or "skipped"

    click.echo(f"# Objective next context: `{result.slug}`")
    click.echo()
    click.echo(f"Current branch: `{result.current_branch}`")
    click.echo(f"Trunk branch: `{result.trunk_branch}`")
    click.echo(f"On trunk: {str(result.on_trunk).lower()}")
    click.echo(f"Files: {files}")
    click.echo(f"Freshness: {freshness}")
    click.echo(f"Notes: {notes}")
    if result.freshness_advisory is not None:
        click.echo(f"Advisory: {result.freshness_advisory}")


@clinkr_operation(
    name="next-context",
    help=(
        "Emit deterministic objective-next facts: branch/trunk preflight, "
        "slug resolution, raw objective content, and freshness. Markdown "
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

    freshness: ObjectiveSnapshotState | None = None
    freshness_advisory: str | None = None
    if not on_trunk:
        freshness = classify_branch_snapshot(
            mctx.brmem_gateway,
            mctx.git_gateway,
            current_branch,
            slug,
            trunk=trunk,
            alive=True,
        )
        if freshness == "stale":
            freshness_advisory = (
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
            freshness=freshness,
            freshness_advisory=freshness_advisory,
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
                    "Run `objective-claim <slug>` first."
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
