"""Register format-aware clinkr commands with explicit exit handling."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import click

from twerk_core.clinkr.command import machine_command
from twerk_core.clinkr.dataclass_json import emit_json_error, serialize_to_json_dict
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import get_operation_meta
from twerk_core.clinkr.params import build_request_from_click_params, extract_click_params
from twerk_core.clinkr.rendering import default_human_renderer


def add_format_operation(
    group: ClinkrGroup,
    operation: Callable[..., Any],
    *,
    add_legacy_json_alias: bool = False,
) -> None:
    meta = get_operation_meta(operation)
    if meta is None:
        raise TypeError(f"{operation!r} is not decorated with @clinkr_operation")

    help_text = meta.help or operation.__doc__ or ""
    request_type = meta.request_type
    renderer = meta.human_renderer or default_human_renderer
    params = extract_click_params(request_type)
    params.append(
        click.Option(
            ["--format", "output_format"],
            type=click.Choice(("text", "json")),
            default="text",
            show_default=True,
            help="Output format.",
        )
    )

    @click.pass_context
    def callback(ctx: click.Context, **kwargs: Any) -> None:
        output_format = kwargs.pop("output_format")
        request = build_request_from_click_params(request_type, kwargs)
        outcome = operation(ctx, request)
        if not isinstance(outcome, ClinkrExit):
            raise TypeError(f"{operation!r} must return ClinkrExit for format registration")

        if output_format == "json":
            _emit_json_outcome(outcome)
        else:
            _emit_text_outcome(outcome, renderer)

        if outcome.exit_code != 0:
            ctx.exit(outcome.exit_code)

    group.add_command(
        click.Command(
            name=meta.name,
            callback=callback,
            params=params,
            help=help_text,
        ),
        meta.name,
    )
    for alias in meta.aliases:
        group.add_alias(meta.name, alias)

    if add_legacy_json_alias:
        _add_legacy_json_alias(
            group,
            operation,
            meta.name,
            help_text,
            request_type,
            meta.result_types,
        )


def _emit_text_outcome(
    outcome: ClinkrExit[Any],
    renderer: Callable[..., None],
) -> None:
    if outcome.error is not None:
        click.echo(f"error: {outcome.error.message}", err=True)
        return

    if outcome.result is None:
        raise TypeError("ClinkrExit must contain either result or error")

    if outcome.exit_code != 0:
        absent_message = getattr(outcome.result, "absent_message", None)
        if isinstance(absent_message, str) and absent_message:
            click.echo(absent_message, err=True)
            return

    renderer(outcome.result)


def _emit_json_outcome(outcome: ClinkrExit[Any]) -> None:
    if outcome.error is not None:
        emit_json_error(
            error_type=outcome.error.error_type,
            message=outcome.error.message,
        )
        return

    if outcome.result is None:
        raise TypeError("ClinkrExit must contain either result or error")

    click.echo(json.dumps(serialize_to_json_dict(outcome.result), indent=2))


def _add_legacy_json_alias(
    group: ClinkrGroup,
    operation: Callable[..., Any],
    name: str,
    help_text: str,
    request_type: type,
    result_types: tuple[type, ...],
) -> None:
    @machine_command(request_type=request_type, output_types=result_types)
    @click.command(name, help=f"{help_text} (JSON)")
    def machine_callback(request: Any) -> Any:
        ctx = click.get_current_context()
        outcome = operation(ctx, request)
        if not isinstance(outcome, ClinkrExit):
            raise TypeError(f"{operation!r} must return ClinkrExit for format registration")
        if outcome.error is not None:
            return outcome.error
        return outcome.result

    group.json_group.add_command(machine_callback, name)
