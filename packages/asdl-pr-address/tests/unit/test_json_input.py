"""Tests for shared pr-address JSON input loading."""

from __future__ import annotations

import io
import json
import sys

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_pr_address.cli.pr_address.json_input import load_json_input


class _ExamplePayload(ClinkrModel):
    count: int


def test_load_json_input_prefers_option_value_over_stdin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"source": "stdin"}'))

    payload = load_json_input(
        option_value='{"source": "option"}',
        command_name="example-command",
        input_description="JSON payload",
        option_name="--payload-json",
        invalid_input_description="payload",
        parser=json.loads,
    )

    assert payload == {"source": "option"}


def test_load_json_input_rejects_empty_stdin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO("   \n"))

    with pytest.raises(ClinkrFailure) as exc_info:
        load_json_input(
            option_value=None,
            command_name="example-command",
            input_description="JSON payload",
            option_name="--payload-json",
            invalid_input_description="payload",
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_request"
    assert exc_info.value.message == (
        "example-command requires a non-empty JSON payload via stdin or --payload-json"
    )


def test_load_json_input_classifies_json_decode_errors_as_invalid_json() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        load_json_input(
            option_value="{",
            command_name="example-command",
            input_description="JSON payload",
            option_name="--payload-json",
            invalid_input_description="payload",
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_json"
    assert exc_info.value.message.startswith("Invalid example-command payload:")


def test_load_json_input_classifies_pydantic_json_parse_errors_as_invalid_json() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        load_json_input(
            option_value="{",
            command_name="example-command",
            input_description="JSON payload",
            option_name="--payload-json",
            invalid_input_description="payload",
            parser=_ExamplePayload.model_validate_json,
        )

    assert exc_info.value.error_type == "invalid_json"


def test_load_json_input_classifies_pydantic_schema_errors_as_invalid_request() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        load_json_input(
            option_value='{"count": "not-a-number"}',
            command_name="example-command",
            input_description="JSON payload",
            option_name="--payload-json",
            invalid_input_description="payload",
            parser=_ExamplePayload.model_validate_json,
        )

    assert exc_info.value.error_type == "invalid_request"
