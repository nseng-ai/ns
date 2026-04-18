from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.cli.reviewer.context import load_reviewer_context
from twerk_reviewer.workflow import resolve_harness


@dataclass(frozen=True)
class HarnessShowRequest:
    pass


@dataclass(frozen=True)
class HarnessShowResult:
    harness_name: str

    def to_json_dict(self) -> dict[str, Any]:
        return {"harness_name": self.harness_name}


def render_harness_show(result: HarnessShowResult) -> None:
    click.echo(f"Harness: {result.harness_name}")


@clinkr_operation(
    name="show",
    help="Print the harness that would be used for a review.",
    human_renderer=render_harness_show,
)
def run_harness_show_command(
    ctx: click.Context,
    request: HarnessShowRequest,
) -> HarnessShowResult | ClinkrCommandError:
    reviewer_context = load_reviewer_context(ctx)

    resolved = resolve_harness(
        requested_harness=None,
        harness_detection_gateway=reviewer_context.harness_detection,
    )
    if not isinstance(resolved, str):
        return ClinkrCommandError(error_type=resolved.error_type, message=resolved.message)

    return HarnessShowResult(harness_name=resolved)
