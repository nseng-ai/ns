from __future__ import annotations

from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_reviewer.context import ReviewerCliContext


class HarnessListRequest(ClinkrModel):
    pass


class HarnessEntry(ClinkrModel):
    name: str
    binary: str
    path: str | None
    available: bool


class HarnessListResult(ClinkrModel):
    harnesses: tuple[HarnessEntry, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "harnesses": [
                {
                    "name": entry.name,
                    "binary": entry.binary,
                    "path": entry.path,
                    "available": entry.available,
                }
                for entry in self.harnesses
            ],
            "count": len(self.harnesses),
        }


def render_harness_list(result: HarnessListResult) -> None:
    if not result.harnesses:
        click.echo("No harnesses known.")
        return
    for entry in result.harnesses:
        status = entry.path or "not found"
        click.echo(f"- {entry.name} ({entry.binary}): {status}")


@clinkr_operation(
    name="list",
    aliases=("ls",),
    help="Detect known harnesses on PATH.",
    human_renderer=render_harness_list,
)
def run_harness_list_command(
    ctx: click.Context,
    request: HarnessListRequest,
) -> ClinkrExit[HarnessListResult]:
    reviewer_context = load_typed_context(ctx, ReviewerCliContext)
    entries = tuple(
        HarnessEntry(
            name=detection.name,
            binary=detection.binary,
            path=detection.path,
            available=detection.available,
        )
        for detection in reviewer_context.review_environment.list_harnesses()
    )
    return ClinkrExit.ok(HarnessListResult(harnesses=entries))
