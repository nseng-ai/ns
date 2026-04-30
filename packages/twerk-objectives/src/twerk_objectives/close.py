"""``objective close`` — mark an objective as closed on the canonical trunk."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_objectives.closed_marker import load_closed_marker, serialize_closed_marker
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import body_key, closed_key
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.trunk_resolution import resolve_trunk


@dataclass(frozen=True)
class ObjectiveCloseRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    reason: Annotated[
        str | None,
        click.Option(
            ["--reason"],
            type=click.STRING,
            default=None,
            help="Optional human-readable reason recorded with the closed marker.",
        ),
    ] = None


@dataclass(frozen=True)
class ObjectiveCloseResult(JsonSerializable):
    slug: str
    trunk_branch: str
    state: str
    closed_at: str
    reason: str | None
    already_closed: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "trunk_branch": self.trunk_branch,
            "state": self.state,
            "closed_at": self.closed_at,
            "reason": self.reason,
            "already_closed": self.already_closed,
        }


def render_objective_close(result: ObjectiveCloseResult) -> None:
    if result.already_closed:
        click.echo(f"{result.slug} already closed (closed_at={result.closed_at}).")
    else:
        click.echo(f"Closed {result.slug} on {result.trunk_branch} at {result.closed_at}.")


@clinkr_operation(
    name="close",
    help=(
        "Mark an objective as closed by writing the canonical `.closed` "
        "marker on the repo's trunk branch. Idempotent: re-closing preserves "
        "the original closed_at."
    ),
    human_renderer=render_objective_close,
)
def run_close_objective(
    ctx: click.Context,
    request: ObjectiveCloseRequest,
) -> ClinkrExit[ObjectiveCloseResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    trunk = resolve_trunk(mctx.git_gateway).trunk

    body_diagnostic = gateway.check(OBJECTIVE_NAMESPACE, body_key(request.slug), trunk)
    Ensure.true(
        body_diagnostic is not None,
        error_type="unknown_slug",
        message=(
            f"No canonical objective for slug {request.slug!r} on {trunk!r}. "
            "Run `objective reconcile` to land it before closing."
        ),
    )

    existing = load_closed_marker(gateway, slug=request.slug, trunk_branch=trunk)
    if existing.present and existing.closed_at is not None:
        return ClinkrExit.ok(
            ObjectiveCloseResult(
                slug=request.slug,
                trunk_branch=trunk,
                state="closed",
                closed_at=existing.closed_at,
                reason=existing.reason,
                already_closed=True,
            )
        )

    closed_at = datetime.now(UTC).isoformat()
    gateway.put(
        OBJECTIVE_NAMESPACE,
        closed_key(request.slug),
        trunk,
        serialize_closed_marker(closed_at=closed_at, reason=request.reason),
    )

    return ClinkrExit.ok(
        ObjectiveCloseResult(
            slug=request.slug,
            trunk_branch=trunk,
            state="closed",
            closed_at=closed_at,
            reason=request.reason,
            already_closed=False,
        )
    )
