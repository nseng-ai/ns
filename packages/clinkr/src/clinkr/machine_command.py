from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import click

from clinkr.dataclass_json import (
    emit_json_error,
    emit_json_success,
    parse_dataclass_from_json,
    read_json_stdin,
    serialize_to_json_dict,
)


@dataclass(frozen=True)
class MachineCommandMeta:
    request_type: type
    output_types: tuple[type, ...]


@dataclass(frozen=True)
class MachineCommandError:
    error_type: str
    message: str


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


def emit_machine_error(error: MachineCommandError) -> None:
    emit_json_error(error_type=error.error_type, message=error.message)


def emit_machine_result(result: Any) -> None:
    emit_json_success(serialize_to_json_dict(result))


def _apply_machine_command(
    cmd: click.Command,
    *,
    request_type: type,
    output_types: tuple[type, ...],
) -> click.Command:
    cmd._machine_command_meta = MachineCommandMeta(  # type: ignore[attr-defined]
        request_type=request_type,
        output_types=output_types,
    )

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
            from clinkr.machine_schema import build_machine_schema_document

            schema_doc = build_machine_schema_document(
                request_type=request_type,
                output_types=output_types,
            )
            click.echo(json.dumps(schema_doc, indent=2))
            return None

        try:
            input_data = read_machine_command_input()
        except json.JSONDecodeError as exc:
            emit_machine_error(
                MachineCommandError(
                    error_type="invalid_json_input",
                    message=f"Invalid JSON: {exc}",
                )
            )
            raise SystemExit(1) from None
        except ValueError as exc:
            emit_machine_error(
                MachineCommandError(
                    error_type="invalid_json_input",
                    message=str(exc),
                )
            )
            raise SystemExit(1) from None

        if input_data is None:
            input_data = {}

        try:
            kwargs["request"] = parse_machine_request(request_type, input_data)
        except ValueError as exc:
            emit_machine_error(
                MachineCommandError(
                    error_type="invalid_request",
                    message=str(exc),
                )
            )
            raise SystemExit(1) from None

        try:
            result = original_callback(**kwargs)
        except click.ClickException as exc:
            error_type = getattr(exc, "error_type", None)
            if error_type is None:
                raise
            emit_machine_error(
                MachineCommandError(
                    error_type=str(error_type),
                    message=exc.format_message(),
                )
            )
            raise SystemExit(1) from None

        if isinstance(result, MachineCommandError):
            emit_machine_error(result)
            raise SystemExit(1)

        if result is not None:
            emit_machine_result(result)
        return result

    wrapped_callback.__name__ = getattr(original_callback, "__name__", "wrapped")
    wrapped_callback.__doc__ = getattr(original_callback, "__doc__", None)
    cmd.callback = wrapped_callback
    return cmd
