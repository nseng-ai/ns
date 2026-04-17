"""Markdown-driven reviewer operations."""

from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group, discover_group
from twerk_reviewer.cli.reviewer.context import build_reviewer_context


@click.pass_context
def _populate_ctx_obj(ctx: click.Context) -> None:
    """Populate ``ctx.obj`` with a :class:`ReviewerCliContext` for real invocations."""
    if ctx.obj is None:
        ctx.obj = build_reviewer_context()


@clinkr_group(help="Markdown-driven reviewer operations.")
def reviewer() -> ClinkrGroup:
    """Return the outer ``reviewer`` CLI group with ``review`` and ``harness`` subgroups."""
    review_group = discover_group("twerk_reviewer.cli.reviewer.review")
    harness_group = discover_group("twerk_reviewer.cli.reviewer.harness")

    outer = ClinkrGroup()
    outer.callback = _populate_ctx_obj
    outer.add_command(review_group)
    outer.add_command(harness_group)
    return outer
