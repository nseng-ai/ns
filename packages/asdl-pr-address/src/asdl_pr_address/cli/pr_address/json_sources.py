"""Compatibility JSON source helpers for pr-address CLI operations."""

from __future__ import annotations

import json
from typing import Any, cast

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.json_input import load_json_input, read_json_input_text


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
    return read_json_input_text(
        option_value=inline_json,
        file_path=file_path,
        allow_stdin=allow_stdin,
        command_name=command_name,
        input_description=input_name,
        option_name=inline_option,
        file_option_name=file_option,
    )


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
    def parse_json_object(raw_payload: str) -> dict[str, object]:
        parsed = json.loads(raw_payload)
        if not isinstance(parsed, dict):
            Ensure.fail(
                error_type="invalid_request",
                message=f"{command_name} {input_name} JSON must be an object.",
            )
        return cast(dict[str, Any], parsed)

    return load_json_input(
        option_value=inline_json,
        file_path=file_path,
        allow_stdin=allow_stdin,
        command_name=command_name,
        input_description=input_name,
        option_name=inline_option,
        file_option_name=file_option,
        parser=parse_json_object,
    )
