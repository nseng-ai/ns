"""Explicit builder for the `reviewer` CLI group."""

from __future__ import annotations

import shutil

import click

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer.cli.reviewer.context import build_reviewer_context
from twerk_reviewer.cli.reviewer.harness.group import build_harness_group
from twerk_reviewer.cli.reviewer.review.group import build_review_group


@click.pass_context
def _populate_ctx_obj(ctx: click.Context) -> None:
    """Populate ``ctx.obj`` with a :class:`ReviewerCliContext` for real invocations."""
    if ctx.obj is None:
        if shutil.which("git") is None:
            raise click.ClickException(
                "git is not installed or not on PATH; install git to run reviewer commands."
            )
        ctx.obj = build_reviewer_context()


def build_reviewer_group() -> ClinkrGroup:
    outer = ClinkrGroup(name="reviewer", help="Markdown-driven reviewer operations.")
    outer.callback = _populate_ctx_obj
    outer.add_command(build_review_group())
    outer.add_command(build_harness_group())
    return outer
