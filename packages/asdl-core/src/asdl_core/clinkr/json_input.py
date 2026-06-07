"""Shared JSON input loading for Clinkr CLI operations."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
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
) -> ParsedJsonInput:
    raw_payload = option_value if option_value is not None else sys.stdin.read()
    Ensure.truthy(
        raw_payload.strip(),
        error_type="invalid_request",
        message=(
            f"{command_name} requires a non-empty {input_description} via stdin or {option_name}"
        ),
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


def _validation_error_type(exc: ValidationError) -> str:
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            return "invalid_json"
    return "invalid_request"
