"""Builder for the hidden root ``asdl exec`` CLI subgroup."""

from __future__ import annotations

import click

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_tools.exec.cmux_workspace_summary import run_cmux_workspace_summary
from asdl_tools.exec.context import build_asdl_exec_context, has_clinkr_context
from asdl_tools.exec.resolve_prompt import run_resolve_prompt


@click.pass_context
def ensure_exec_context(ctx: click.Context) -> None:
    """Install the root exec context only for ``asdl exec`` invocations."""
    if has_clinkr_context(ctx):
        return
    ctx.find_root().obj = build_clinkr_context_object(build_asdl_exec_context)


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by asdl-tools skills.",
        operations=[run_cmux_workspace_summary, run_resolve_prompt],
        hidden=True,
        callback=ensure_exec_context,
    )
