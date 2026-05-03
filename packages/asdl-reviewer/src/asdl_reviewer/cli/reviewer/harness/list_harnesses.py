from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.harness_registry import HARNESS_ADAPTERS


@dataclass(frozen=True)
class HarnessListRequest:
    pass


@dataclass(frozen=True)
class HarnessEntry:
    name: str
    binary: str
    path: str | None
    available: bool


@dataclass(frozen=True)
class HarnessListResult(JsonSerializable):
    harnesses: tuple[HarnessEntry, ...]

    def to_json_dict(self) -> dict[str, Any]:
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
    entries: list[HarnessEntry] = []
    for adapter in HARNESS_ADAPTERS.values():
        detection = reviewer_context.harness_detection.detect(
            name=adapter.name,
            binary=adapter.binary,
        )
        entries.append(
            HarnessEntry(
                name=adapter.name,
                binary=adapter.binary,
                path=detection.path,
                available=detection.available,
            )
        )
    return ClinkrExit.ok(HarnessListResult(harnesses=tuple(entries)))
