"""``objective reopen`` — clear the canonical ``.closed`` marker."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import closed_key
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.trunk_resolution import resolve_trunk


@dataclass(frozen=True)
class ObjectiveReopenRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]


@dataclass(frozen=True)
class ObjectiveReopenResult(JsonSerializable):
    slug: str
    trunk_branch: str
    state: str
    already_open: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "trunk_branch": self.trunk_branch,
            "state": self.state,
            "already_open": self.already_open,
        }


def render_objective_reopen(result: ObjectiveReopenResult) -> None:
    if result.already_open:
        click.echo(f"{result.slug} is already open.")
    else:
        click.echo(f"Reopened {result.slug} on {result.trunk_branch}.")


@clinkr_operation(
    name="reopen",
    help=(
        "Clear the canonical `.closed` marker for an objective on the repo's "
        "trunk branch. Idempotent: reopening an already-open objective is a no-op."
    ),
    human_renderer=render_objective_reopen,
)
def run_reopen_objective(
    ctx: click.Context,
    request: ObjectiveReopenRequest,
) -> ClinkrExit[ObjectiveReopenResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    trunk = resolve_trunk(mctx.git_gateway).trunk

    diagnostic = gateway.check(OBJECTIVE_NAMESPACE, closed_key(request.slug), trunk)
    if diagnostic is None:
        return ClinkrExit.ok(
            ObjectiveReopenResult(
                slug=request.slug,
                trunk_branch=trunk,
                state="open",
                already_open=True,
            )
        )

    gateway.delete(OBJECTIVE_NAMESPACE, closed_key(request.slug), trunk)
    return ClinkrExit.ok(
        ObjectiveReopenResult(
            slug=request.slug,
            trunk_branch=trunk,
            state="open",
            already_open=False,
        )
    )
