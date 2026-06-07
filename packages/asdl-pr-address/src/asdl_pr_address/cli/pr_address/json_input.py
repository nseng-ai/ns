"""JSON input loading helpers for pr-address CLI operations."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from pydantic import ValidationError

from asdl_core.clinkr.ensure import Ensure

ParsedJsonInput = TypeVar("ParsedJsonInput")


def load_json_input(
    *,
    option_value: str | None,
    file_value: str | None = None,
    stdin_allowed: bool = True,
    command_name: str,
    input_description: str,
    option_name: str,
    file_option_name: str | None = None,
    parser: Callable[[str], ParsedJsonInput],
) -> ParsedJsonInput:
    file_label = file_option_name or "file option"
    source_count = int(option_value is not None) + int(file_value is not None)
    Ensure.true(
        source_count <= 1,
        error_type="invalid_request",
        message=(
            f"{command_name} accepts only one {input_description} source; "
            f"do not pass both {option_name} and {file_label}."
        ),
    )

    raw_payload: str | None = None
    if option_value is not None:
        raw_payload = option_value
    elif file_value is not None:
        raw_payload = _read_json_file(
            file_value,
            command_name=command_name,
            input_description=input_description,
            file_option_name=file_label,
        )
    elif stdin_allowed:
        raw_payload = sys.stdin.read()
    else:
        Ensure.fail(
            error_type="invalid_request",
            message=(
                f"{command_name} requires {input_description} via {option_name} or {file_label}."
            ),
        )

    if raw_payload is None:
        raise AssertionError("JSON input source selection must produce raw payload text")
    Ensure.truthy(
        raw_payload.strip(),
        error_type="invalid_request",
        message=f"{command_name} requires non-empty {input_description} JSON.",
    )
    try:
        return parser(raw_payload)
    except json.JSONDecodeError as exc:
        Ensure.fail(
            error_type="invalid_json",
            message=f"Invalid {input_description} JSON for {command_name}: {exc}",
        )
    except ValidationError as exc:
        raise_type = "invalid_json" if _is_json_parse_error(exc) else "invalid_request"
        Ensure.fail(
            error_type=raise_type,
            message=f"Invalid {input_description} for {command_name}: {exc}",
        )


def _read_json_file(
    file_value: str,
    *,
    command_name: str,
    input_description: str,
    file_option_name: str,
) -> str:
    path = Path(file_value)
    if not path.exists() or not path.is_file():
        Ensure.fail(
            error_type="invalid_request",
            message=(
                f"{command_name} {file_option_name} must point to an existing file "
                f"for {input_description}: {file_value}"
            ),
        )
    return path.read_text(encoding="utf-8")


def _is_json_parse_error(exc: ValidationError) -> bool:
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            return True
    return False
