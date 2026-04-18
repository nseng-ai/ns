"""Markdown-driven reviewer operations."""

from __future__ import annotations

import shutil

import click

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group
from twerk_reviewer.cli.reviewer.context import build_reviewer_context


@click.pass_context
def _populate_ctx_obj(ctx: click.Context) -> None:
    """Populate ``ctx.obj`` with a :class:`ReviewerCliContext` for real invocations."""
    if ctx.obj is None:
        if shutil.which("git") is None:
            raise click.ClickException(
                "git is not installed or not on PATH; install git to run reviewer commands."
            )
        ctx.obj = build_reviewer_context()


@clinkr_group(help="Markdown-driven reviewer operations.")
def reviewer() -> ClinkrGroup:
    """Return the ``reviewer`` CLI group with a typed gateway context."""
    group = ClinkrGroup.discover_subcommands()
    group.callback = _populate_ctx_obj
    return group
