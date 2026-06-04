"""Tests for payload JSON lookup helpers."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest

from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.lookup import read_json_payload_artifact_value, resolve_json_pointer
from asdl_core.payloads.store import PayloadStore


def _fixed_clock() -> datetime:
    return datetime(2026, 6, 3, 12, 34, 56, tzinfo=UTC)


def _open_store(tmp_path: Path) -> PayloadStore:
    return PayloadStore.open(
        root=tmp_path / "payload-root",
        session_id="session1",
        clock=_fixed_clock,
    )


def _payload_file(tmp_path: Path, filename: str, text: str) -> Path:
    payload_dir = tmp_path / "payload-root" / "sessions" / "session1" / "payloads"
    payload_dir.mkdir(parents=True)
    payload_path = payload_dir / filename
    payload_path.write_text(text, encoding="utf-8")
    return payload_path


def _assert_payload_lookup_failed(exc_info: pytest.ExceptionInfo[PayloadError]) -> None:
    assert exc_info.value.error_type == "payload_lookup_failed"


def test_resolve_json_pointer_empty_pointer_returns_document() -> None:
    document = {"data": {"value": 1}}

    assert resolve_json_pointer(document, "") is document


def test_resolve_json_pointer_reads_object_key_and_array_index() -> None:
    document = {"data": {"items": [{"name": "first"}, {"name": "second"}]}}

    assert resolve_json_pointer(document, "/data/items/1/name") == "second"


def test_resolve_json_pointer_unescapes_tilde_and_slash_tokens() -> None:
    document = {"a/b": {"tilde~key": "value"}}

    assert resolve_json_pointer(document, "/a~1b/tilde~0key") == "value"


def test_resolve_json_pointer_rejects_pointer_without_leading_slash() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_json_pointer({"data": {}}, "data")

    _assert_payload_lookup_failed(exc_info)


@pytest.mark.parametrize("pointer", ["/data/~", "/data/~2"])
def test_resolve_json_pointer_rejects_invalid_escape_sequence(pointer: str) -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_json_pointer({"data": {}}, pointer)

    _assert_payload_lookup_failed(exc_info)


def test_resolve_json_pointer_rejects_missing_object_key() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_json_pointer({"data": {}}, "/data/missing")

    _assert_payload_lookup_failed(exc_info)


def test_resolve_json_pointer_rejects_out_of_range_array_index() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_json_pointer({"data": ["only"]}, "/data/1")

    _assert_payload_lookup_failed(exc_info)


def test_resolve_json_pointer_rejects_dash_array_index() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_json_pointer({"data": ["only"]}, "/data/-")

    _assert_payload_lookup_failed(exc_info)


def test_resolve_json_pointer_rejects_leading_zero_array_index() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_json_pointer({"data": ["first", "second"]}, "/data/01")

    _assert_payload_lookup_failed(exc_info)


def test_read_json_payload_artifact_value_reads_raw_artifact(tmp_path: Path) -> None:
    store = _open_store(tmp_path)
    reference = store.write_json_artifact(
        descriptor="probe",
        role="raw",
        payload={"data": {"value": "selected"}},
    )

    assert read_json_payload_artifact_value(Path(reference.payload_path), "/data/value") == (
        "selected"
    )


def test_read_json_payload_artifact_value_reads_summary_artifact(tmp_path: Path) -> None:
    store = _open_store(tmp_path)
    reference = store.write_json_artifact(
        descriptor="probe",
        role="summary",
        payload={"data": {"value": "summary"}},
    )

    assert read_json_payload_artifact_value(Path(reference.payload_path), "/data/value") == (
        "summary"
    )


def test_read_json_payload_artifact_value_rejects_relative_path() -> None:
    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(Path("relative.raw.json"), "")

    _assert_payload_lookup_failed(exc_info)


def test_read_json_payload_artifact_value_rejects_non_payload_filename(tmp_path: Path) -> None:
    payload_path = _payload_file(tmp_path, "notes.json", "{}")

    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(payload_path, "")

    _assert_payload_lookup_failed(exc_info)


def test_read_json_payload_artifact_value_rejects_log_artifact_by_default(tmp_path: Path) -> None:
    store = _open_store(tmp_path)
    reference = store.write_text_artifact(descriptor="probe", role="log", text="log")

    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(Path(reference.payload_path), "")

    _assert_payload_lookup_failed(exc_info)


@pytest.mark.skipif(os.name == "nt", reason="symlink privileges vary on Windows")
def test_read_json_payload_artifact_value_rejects_symlink_file(tmp_path: Path) -> None:
    target_path = _payload_file(tmp_path, "20260603t123456z-0001-probe.raw.json", "{}")
    symlink_path = target_path.with_name("20260603t123456z-0002-probe.raw.json")
    symlink_path.symlink_to(target_path)

    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(symlink_path, "")

    _assert_payload_lookup_failed(exc_info)


def test_read_json_payload_artifact_value_rejects_invalid_json(tmp_path: Path) -> None:
    payload_path = _payload_file(
        tmp_path,
        "20260603t123456z-0001-probe.raw.json",
        "{not-json",
    )

    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(payload_path, "")

    _assert_payload_lookup_failed(exc_info)


def test_read_json_payload_artifact_value_rejects_role_outside_allowed_roles(
    tmp_path: Path,
) -> None:
    store = _open_store(tmp_path)
    reference = store.write_json_artifact(
        descriptor="probe",
        role="summary",
        payload={"data": {"value": "summary"}},
    )

    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(
            Path(reference.payload_path),
            "/data/value",
            allowed_roles=frozenset({"raw"}),
        )

    _assert_payload_lookup_failed(exc_info)


def test_read_json_payload_artifact_value_rejects_wrong_path_shape(tmp_path: Path) -> None:
    payload_path = tmp_path / "payload-root" / "session1" / "payloads"
    payload_path.mkdir(parents=True)
    artifact_path = payload_path / "20260603t123456z-0001-probe.raw.json"
    artifact_path.write_text(json.dumps({"data": {}}), encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        read_json_payload_artifact_value(artifact_path, "")

    _assert_payload_lookup_failed(exc_info)
