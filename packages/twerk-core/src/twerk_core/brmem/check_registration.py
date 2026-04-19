"""Register brmem check commands with grep-style human exit semantics."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError, machine_command
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import get_operation_meta
from twerk_core.clinkr.params import build_request_from_click_params, extract_click_params
from twerk_core.clinkr.rendering import default_human_renderer


def add_check_operation(group: ClinkrGroup, operation: Callable[..., Any]) -> None:
    """Register a brmem check operation on *group*.

    Human mode follows grep-style exit semantics so shell callers can distinguish
    missing targets from command failures. JSON mode keeps standard clinkr
    success/error envelopes.
    """
    # This intentionally re-implements part of clinkr's command registration.
    # `brmem check` needs nonstandard human exit semantics while keeping the
    # standard machine JSON contract. Rather than teaching clinkr about this
    # one-off policy, we localize the divergence here. If more commands need
    # this shape, it likely means clinkr's registration/dispatch abstractions
    # should be factored more explicitly.
    meta = get_operation_meta(operation)
    if meta is None:
        raise TypeError(f"{operation!r} is not decorated with @clinkr_operation")

    help_text = meta.help or operation.__doc__ or ""
    request_type = meta.request_type
    renderer = meta.human_renderer or default_human_renderer

    @click.pass_context
    def human_callback(ctx: click.Context, **kwargs: Any) -> None:
        request = build_request_from_click_params(request_type, kwargs)
        result = operation(ctx, request)
        if isinstance(result, ClinkrCommandError):
            click.echo(f"error: {result.message}", err=True)
            ctx.exit(2)

        if not result.exists:
            click.echo(result.absent_message or "", err=True)
            ctx.exit(1)

        renderer(result)

    human_cmd = click.Command(
        name=meta.name,
        callback=human_callback,
        params=extract_click_params(request_type),
        help=help_text,
    )

    @machine_command(request_type=request_type, output_types=meta.result_types)
    @click.command(meta.name, help=f"{help_text} (JSON)")
    def machine_callback(request: Any) -> Any:
        ctx = click.get_current_context()
        return operation(ctx, request)

    group.add_command(human_cmd, meta.name)
    group.json_group.add_command(machine_callback, meta.name)
    for alias in meta.aliases:
        group.add_alias(meta.name, alias)
