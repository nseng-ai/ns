"""Shared JSON input loading for Clinkr CLI operations."""

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
    command_name: str,
    input_description: str,
    option_name: str,
    parser: Callable[[str], ParsedJsonInput],
    file_path: str | Path | None = None,
    file_option_name: str | None = None,
    allow_stdin: bool = True,
) -> ParsedJsonInput:
    raw_payload = read_json_input_text(
        option_value=option_value,
        command_name=command_name,
        input_description=input_description,
        option_name=option_name,
        file_path=file_path,
        file_option_name=file_option_name,
        allow_stdin=allow_stdin,
    )
    # Current callers use two disjoint parser contracts: json.loads raises
    # JSONDecodeError directly, while Pydantic model_validate_json wraps JSON
    # syntax and schema failures in ValidationError.
    try:
        return parser(raw_payload)
    except json.JSONDecodeError as exc:
        Ensure.fail(
            error_type="invalid_json",
            message=f"Invalid {command_name} {input_description}: {exc}",
        )
    except ValidationError as exc:
        Ensure.fail(
            error_type=_validation_error_type(exc),
            message=f"Invalid {command_name} {input_description}: {exc}",
        )


def read_json_input_text(
    *,
    option_value: str | None,
    command_name: str,
    input_description: str,
    option_name: str,
    file_path: str | Path | None = None,
    file_option_name: str | None = None,
    allow_stdin: bool = True,
) -> str:
    source_count = int(option_value is not None) + int(file_path is not None)
    Ensure.true(
        source_count <= 1,
        error_type="invalid_request",
        message=(
            f"{command_name} accepts only one {input_description} source; "
            f"do not pass both {option_name} and {_file_option_name(file_option_name)}."
        ),
    )

    if option_value is not None:
        raw_payload = option_value
    elif file_path is not None:
        raw_payload = _read_json_input_file(
            file_path,
            command_name=command_name,
            input_description=input_description,
            file_option_name=file_option_name,
        )
    elif allow_stdin:
        raw_payload = sys.stdin.read()
    else:
        source_description = _source_description(
            option_name=option_name,
            file_option_name=file_option_name,
            allow_stdin=False,
        )
        Ensure.fail(
            error_type="invalid_request",
            message=f"{command_name} requires {input_description} via {source_description}.",
        )

    source_description = _source_description(
        option_name=option_name,
        file_option_name=file_option_name,
        allow_stdin=allow_stdin,
    )
    Ensure.true(
        raw_payload.strip() != "",
        error_type="invalid_request",
        message=(
            f"{command_name} requires a non-empty {input_description} via {source_description}"
        ),
    )
    return raw_payload


def _read_json_input_file(
    file_path: str | Path,
    *,
    command_name: str,
    input_description: str,
    file_option_name: str | None,
) -> str:
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        Ensure.fail(
            error_type="invalid_request",
            message=(
                f"{command_name} {_file_option_name(file_option_name)} must point to an "
                f"existing file for {input_description}: {file_path}"
            ),
        )
    return path.read_text(encoding="utf-8")


def _source_description(
    *,
    option_name: str,
    file_option_name: str | None,
    allow_stdin: bool,
) -> str:
    sources = []
    if allow_stdin:
        sources.append("stdin")
    sources.append(option_name)
    if file_option_name is not None:
        sources.append(file_option_name)
    if len(sources) == 1:
        return sources[0]
    if len(sources) == 2:
        return f"{sources[0]} or {sources[1]}"
    return f"{', '.join(sources[:-1])}, or {sources[-1]}"


def _file_option_name(file_option_name: str | None) -> str:
    if file_option_name is None:
        return "file path"
    return file_option_name


def _validation_error_type(exc: ValidationError) -> str:
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            return "invalid_json"
    return "invalid_request"
