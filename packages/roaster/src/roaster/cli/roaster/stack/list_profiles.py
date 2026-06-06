from __future__ import annotations

from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.context import RoasterCliContext
from roaster.stack_profile import StackProfileListFailed, list_stack_profiles


class StackProfileListRequest(ClinkrModel):
    pass


class StackProfileListResult(ClinkrModel):
    profiles_dir: str
    profile_slugs: tuple[str, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "profiles_dir": self.profiles_dir,
            "profile_slugs": list(self.profile_slugs),
            "count": len(self.profile_slugs),
        }


def render_stack_profile_list(result: StackProfileListResult) -> None:
    click.echo(f"Profiles directory: {result.profiles_dir}")
    if not result.profile_slugs:
        click.echo("No stack profiles found.")
        click.echo("Create .roaster/profiles/<slug>.md, then run `roaster stack run <slug>`.")
        return

    click.echo(f"Stack profiles: {len(result.profile_slugs)}")
    for slug in result.profile_slugs:
        click.echo(f"- {slug}")


@clinkr_operation(
    name="list",
    aliases=("ls",),
    help="List stack profiles discovered under .roaster/profiles/.",
    human_renderer=render_stack_profile_list,
)
def run_stack_profile_list_command(
    ctx: click.Context,
    request: StackProfileListRequest,
) -> ClinkrExit[StackProfileListResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    result = list_stack_profiles(cwd=roaster_context.cwd)
    if isinstance(result, StackProfileListFailed):
        raise ClinkrFailure(error_type=result.error_type, message=result.message)

    return ClinkrExit.ok(
        StackProfileListResult(
            profiles_dir=str(result.profiles_dir),
            profile_slugs=result.slugs,
        )
    )
