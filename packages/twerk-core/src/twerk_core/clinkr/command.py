from __future__ import annotations

import json
from typing import Any

import click

from twerk_core.clinkr.context import set_machine_mode
from twerk_core.clinkr.dataclass_json import (
    parse_dataclass_from_json,
    read_json_stdin,
)
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.json_schema import build_json_schema_document


def machine_command(
    *,
    request_type: type,
    output_types: tuple[type, ...],
) -> Any:
    def decorator(cmd: click.Command) -> click.Command:
        return _apply_machine_command(
            cmd,
            request_type=request_type,
            output_types=output_types,
        )

    return decorator


def read_machine_command_input() -> dict[str, Any] | None:
    return read_json_stdin()


def parse_machine_request(request_type: type, data: dict[str, Any]) -> Any:
    return parse_dataclass_from_json(request_type, data)


def emit_machine_envelope(result: Any) -> None:
    """Emit the machine-readable envelope for an operation's result.

    Shared by the ``json`` subtree and the ``--format json`` flag so both
    dispatch paths produce identical output and exit codes. Raises
    ``SystemExit`` when the operation's exit code is non-zero.
    """
    if not isinstance(result, ClinkrExit):
        raise TypeError(
            f"clinkr operation did not return a ClinkrExit; got {type(result).__name__}"
        )
    click.echo(json.dumps(result.to_envelope_dict(), indent=2))
    if result.exit_code != 0:
        raise SystemExit(result.exit_code)


def _apply_machine_command(
    cmd: click.Command,
    *,
    request_type: type,
    output_types: tuple[type, ...],
) -> click.Command:
    cmd.params.append(
        click.Option(
            ["--schema", "schema_mode"],
            is_flag=True,
            default=False,
            help="Output JSON Schema for this command's input/output shapes",
        )
    )

    original_callback = cmd.callback
    if original_callback is None:
        return cmd

    def wrapped_callback(**kwargs: Any) -> Any:
        schema_mode = kwargs.pop("schema_mode", False)
        if schema_mode:
            schema_doc = build_json_schema_document(
                request_type=request_type,
                output_types=output_types,
            )
            click.echo(json.dumps(schema_doc, indent=2))
            return None

        try:
            input_data = read_machine_command_input()
        except json.JSONDecodeError as exc:
            _emit_invalid_input(f"Invalid JSON: {exc}")
            raise SystemExit(2) from None
        except ValueError as exc:
            _emit_invalid_input(str(exc))
            raise SystemExit(2) from None

        if input_data is None:
            input_data = {}

        try:
            kwargs["request"] = parse_machine_request(request_type, input_data)
        except ValueError as exc:
            _emit_invalid_request(str(exc))
            raise SystemExit(2) from None

        set_machine_mode(click.get_current_context())

        try:
            result = original_callback(**kwargs)
        except click.ClickException as exc:
            error_type = getattr(exc, "error_type", None)
            if error_type is None:
                raise
            _emit_click_exception(error_type=str(error_type), message=exc.format_message())
            raise SystemExit(2) from None

        emit_machine_envelope(result)
        return result

    wrapped_callback.__name__ = getattr(original_callback, "__name__", "wrapped")
    wrapped_callback.__doc__ = getattr(original_callback, "__doc__", None)
    cmd.callback = wrapped_callback
    return cmd


def _emit_invalid_input(message: str) -> None:
    click.echo(
        json.dumps(
            {"exit_code": 2, "error_type": "invalid_json_input", "message": message},
            indent=2,
        )
    )


def _emit_invalid_request(message: str) -> None:
    click.echo(
        json.dumps(
            {"exit_code": 2, "error_type": "invalid_request", "message": message},
            indent=2,
        )
    )


def _emit_click_exception(*, error_type: str, message: str) -> None:
    click.echo(
        json.dumps(
            {"exit_code": 2, "error_type": error_type, "message": message},
            indent=2,
        )
    )
