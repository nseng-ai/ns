"""Concrete JSON source helpers for pr-address CLI operations."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, NoReturn, cast

from pydantic import ValidationError

from asdl_core.clinkr.ensure import Ensure


def read_json_text_source(
    *,
    inline_json: str | None,
    file_path: str | None,
    allow_stdin: bool,
    command_name: str,
    input_name: str,
    inline_option: str,
    file_option: str,
) -> str:
    source_count = int(inline_json is not None) + int(file_path is not None)
    Ensure.true(
        source_count <= 1,
        error_type="invalid_request",
        message=(
            f"{command_name} accepts only one {input_name} source; "
            f"do not pass both {inline_option} and {file_option}."
        ),
    )

    if inline_json is not None:
        raw_payload = inline_json
    elif file_path is not None:
        raw_payload = _read_json_file(
            file_path,
            command_name=command_name,
            input_name=input_name,
            file_option=file_option,
        )
    elif allow_stdin:
        raw_payload = sys.stdin.read()
    else:
        Ensure.fail(
            error_type="invalid_request",
            message=f"{command_name} requires {input_name} via {inline_option} or {file_option}.",
        )

    Ensure.truthy(
        raw_payload.strip(),
        error_type="invalid_request",
        message=f"{command_name} requires non-empty {input_name} JSON.",
    )
    return raw_payload


def load_json_object_source(
    *,
    inline_json: str | None,
    file_path: str | None,
    allow_stdin: bool,
    command_name: str,
    input_name: str,
    inline_option: str,
    file_option: str,
) -> dict[str, object]:
    raw_payload = read_json_text_source(
        inline_json=inline_json,
        file_path=file_path,
        allow_stdin=allow_stdin,
        command_name=command_name,
        input_name=input_name,
        inline_option=inline_option,
        file_option=file_option,
    )
    try:
        parsed = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        Ensure.fail(
            error_type="invalid_json",
            message=f"Invalid {input_name} JSON for {command_name}: {exc}",
        )
    if not isinstance(parsed, dict):
        Ensure.fail(
            error_type="invalid_request",
            message=f"{command_name} {input_name} JSON must be an object.",
        )
    return cast(dict[str, Any], parsed)


def fail_for_json_or_validation_error(
    *,
    exc: json.JSONDecodeError | ValidationError,
    command_name: str,
    input_name: str,
) -> NoReturn:
    if isinstance(exc, json.JSONDecodeError) or _is_json_parse_error(exc):
        error_type = "invalid_json"
    else:
        error_type = "invalid_request"
    Ensure.fail(
        error_type=error_type,
        message=f"Invalid {input_name} for {command_name}: {exc}",
    )


def _read_json_file(
    file_path: str,
    *,
    command_name: str,
    input_name: str,
    file_option: str,
) -> str:
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        Ensure.fail(
            error_type="invalid_request",
            message=(
                f"{command_name} {file_option} must point to an existing file "
                f"for {input_name}: {file_path}"
            ),
        )
    return path.read_text(encoding="utf-8")


def _is_json_parse_error(exc: ValidationError) -> bool:
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            return True
    return False
