"""Tests for shared Clinkr JSON input loading."""

from __future__ import annotations

import io
import json
import sys
from functools import partial
from pathlib import Path

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel


class _ExamplePayload(ClinkrModel):
    count: int


_load_example_json_input = partial(
    load_json_input,
    command_name="example-command",
    input_description="JSON payload",
    option_name="--payload-json",
)


def test_load_json_input_reads_option_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"source": "stdin"}'))

    payload = _load_example_json_input(
        option_value='{"source": "option"}',
        parser=json.loads,
    )

    assert payload == {"source": "option"}


def test_load_json_input_reads_file_value(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    payload_path = tmp_path / "payload.json"
    payload_path.write_text('{"source": "file"}', encoding="utf-8")
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"source": "stdin"}'))

    payload = _load_example_json_input(
        option_value=None,
        file_path=payload_path,
        file_option_name="--payload-file",
        parser=json.loads,
    )

    assert payload == {"source": "file"}


def test_load_json_input_rejects_inline_and_file_sources(tmp_path: Path) -> None:
    payload_path = tmp_path / "payload.json"
    payload_path.write_text('{"source": "file"}', encoding="utf-8")

    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value='{"source": "option"}',
            file_path=payload_path,
            file_option_name="--payload-file",
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_request"
    assert exc_info.value.message == (
        "example-command accepts only one JSON payload source; "
        "do not pass both --payload-json and --payload-file."
    )


def test_load_json_input_rejects_missing_file() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value=None,
            file_path="missing.json",
            file_option_name="--payload-file",
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_request"
    assert exc_info.value.message == (
        "example-command --payload-file must point to an existing file "
        "for JSON payload: missing.json"
    )


def test_load_json_input_rejects_empty_file(tmp_path: Path) -> None:
    payload_path = tmp_path / "payload.json"
    payload_path.write_text("   \n", encoding="utf-8")

    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value=None,
            file_path=payload_path,
            file_option_name="--payload-file",
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_request"
    assert exc_info.value.message == (
        "example-command requires a non-empty JSON payload via "
        "stdin, --payload-json, or --payload-file"
    )


def test_load_json_input_rejects_missing_source_when_stdin_disabled() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value=None,
            file_option_name="--payload-file",
            allow_stdin=False,
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_request"
    assert exc_info.value.message == (
        "example-command requires JSON payload via --payload-json or --payload-file."
    )


def test_load_json_input_rejects_empty_stdin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO("   \n"))

    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value=None,
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_request"
    assert exc_info.value.message == (
        "example-command requires a non-empty JSON payload via stdin or --payload-json"
    )


def test_load_json_input_classifies_json_decode_errors_as_invalid_json() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value="{",
            parser=json.loads,
        )

    assert exc_info.value.error_type == "invalid_json"
    assert exc_info.value.message.startswith("Invalid example-command JSON payload:")


def test_load_json_input_classifies_pydantic_json_parse_errors_as_invalid_json() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value="{",
            parser=_ExamplePayload.model_validate_json,
        )

    assert exc_info.value.error_type == "invalid_json"


def test_load_json_input_classifies_pydantic_schema_errors_as_invalid_request() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        _load_example_json_input(
            option_value='{"count": "not-a-number"}',
            parser=_ExamplePayload.model_validate_json,
        )

    assert exc_info.value.error_type == "invalid_request"
