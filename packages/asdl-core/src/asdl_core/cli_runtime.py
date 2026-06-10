"""Shared Click helpers for root CLI runtime diagnostics."""

from __future__ import annotations

import click


def add_runtime_option(command: click.Command, *, runtime: str, entry_point: str) -> click.Command:
    """Attach an eager root ``--runtime`` diagnostic option to a Click command."""

    def show_runtime(ctx: click.Context, _parameter: click.Parameter, value: bool) -> None:
        if not value or ctx.resilient_parsing:
            return
        click.echo(f"runtime: {runtime}")
        click.echo(f"entry_point: {entry_point}")
        ctx.exit(0)

    return click.option(
        "--runtime",
        is_flag=True,
        is_eager=True,
        expose_value=False,
        callback=show_runtime,
        help="Show CLI runtime diagnostics and exit.",
    )(command)
