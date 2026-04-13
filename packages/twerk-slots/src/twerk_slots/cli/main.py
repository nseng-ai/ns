from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup, discover_group
from twerk_slots.cli.slot.context import build_slots_context


@click.pass_context
def _populate_ctx_obj(ctx: click.Context) -> None:
    """Populate ``ctx.obj`` with a :class:`SlotsCliContext` for real invocations.

    Tests inject a pre-built context via ``obj=`` on ``CliRunner().invoke``;
    this callback only runs the real gateway bootstrap when no obj is set.
    """
    if ctx.obj is None:
        ctx.obj = build_slots_context()


def build_cli() -> ClinkrGroup:
    """Build the standalone ``slot`` CLI group."""
    group = discover_group("twerk_slots.cli.slot")
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    group.callback = _populate_ctx_obj
    click.version_option(package_name="twerk-slots")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``slot`` CLI."""
    build_cli()()
