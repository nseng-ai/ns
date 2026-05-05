"""``objective exec next-collision`` — check next-slice slug availability."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk


class ObjectiveNextCollisionRequest(ClinkrModel):
    candidate_slug: Annotated[
        str,
        click.Argument(["candidate_slug"], type=click.STRING, required=True),
    ]


class NextCollisionResult(ClinkrModel):
    candidate_slug: str
    branch_exists: bool
    canonical_exists: bool
    clear: bool
    warnings: list[str]


def render_next_collision(result: NextCollisionResult) -> None:
    if result.clear:
        click.echo("Collision check: clear")
        return

    click.echo("Collision check: blocked")
    if result.branch_exists:
        click.echo(f"- Local branch exists: {result.candidate_slug}")
    if result.canonical_exists:
        click.echo(f"- Canonical objective exists: {result.candidate_slug}")
    for warning in result.warnings:
        click.echo(f"- Warning: {warning}")


@clinkr_operation(
    name="next-collision",
    help=(
        "Check whether a candidate next-slice slug collides with a local branch "
        "or canonical objective body on trunk. Intended for objective-next callers."
    ),
    human_renderer=render_next_collision,
)
def run_next_collision_objective(
    ctx: click.Context,
    request: ObjectiveNextCollisionRequest,
) -> ClinkrExit[NextCollisionResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    candidate_slug = slug_for_key(request.candidate_slug)
    trunk = resolve_trunk(mctx.git_gateway).trunk

    branch_exists = mctx.git_gateway.branch_exists(candidate_slug)
    canonical_exists = (
        mctx.brmem_gateway.get(
            OBJECTIVE_NAMESPACE,
            body_key(candidate_slug),
            trunk,
        )
        is not None
    )

    return ClinkrExit.ok(
        NextCollisionResult(
            candidate_slug=candidate_slug,
            branch_exists=branch_exists,
            canonical_exists=canonical_exists,
            clear=not branch_exists and not canonical_exists,
            warnings=[],
        )
    )
