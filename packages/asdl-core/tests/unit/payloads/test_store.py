"""Tests for the payload artifact store."""

from __future__ import annotations

import json
import os
import stat
from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

import asdl_core.payloads.store as payload_store_module
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.models import PayloadReference
from asdl_core.payloads.root import ASDL_PAYLOAD_ROOT_ENV, ASDL_PAYLOAD_SESSION_ID_ENV
from asdl_core.payloads.store import PayloadStore


def _fixed_clock() -> datetime:
    return datetime(2026, 6, 3, 12, 34, 56, tzinfo=UTC)


def _open_store(tmp_path: Path, *, session_id: str = "session1") -> PayloadStore:
    return PayloadStore.open(
        root=tmp_path / "payload-root",
        session_id=session_id,
        clock=_fixed_clock,
    )


def _mkdir_private(path: Path) -> None:
    path.mkdir(mode=0o700)
    path.chmod(0o700)


def _payload_reference() -> PayloadReference:
    return PayloadReference(
        payload_path="/tmp/asdl/sessions/session1/payloads/20260603t123456z-0001-probe.raw.json",
        session_id="session1",
        descriptor="probe",
        role="raw",
        created_at_utc="2026-06-03T12:34:56Z",
        sequence=1,
        payload_bytes=17,
        content_type="application/json",
        extension="json",
    )


def test_payload_reference_constructs_json_compatible_wire_object() -> None:
    reference = _payload_reference()

    assert reference.model_dump(mode="json") == {
        "payload_path": (
            "/tmp/asdl/sessions/session1/payloads/20260603t123456z-0001-probe.raw.json"
        ),
        "session_id": "session1",
        "descriptor": "probe",
        "role": "raw",
        "created_at_utc": "2026-06-03T12:34:56Z",
        "sequence": 1,
        "payload_bytes": 17,
        "content_type": "application/json",
        "extension": "json",
    }


def test_payload_reference_forbids_extra_fields() -> None:
    reference_data = _payload_reference().model_dump(mode="json")
    reference_data["domain_id"] = "pr-815"

    with pytest.raises(ValidationError):
        PayloadReference(**reference_data)


def test_payload_reference_is_frozen() -> None:
    reference = _payload_reference()

    with pytest.raises(ValidationError):
        reference.sequence = 2  # type: ignore[misc]


def test_open_rejects_relative_root() -> None:
    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open(root=Path("relative-root"), session_id="session1")

    assert exc_info.value.error_type == "payload_root_invalid"


def test_open_rejects_invalid_session_id(tmp_path: Path) -> None:
    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open(root=tmp_path / "payload-root", session_id="BadSession")

    assert exc_info.value.error_type == "payload_session_invalid"


def test_open_rejects_existing_root_file(tmp_path: Path) -> None:
    root = tmp_path / "payload-root"
    root.write_text("not a directory", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open(root=root, session_id="session1")

    assert exc_info.value.error_type == "payload_root_invalid"


def test_open_rejects_existing_sessions_file(tmp_path: Path) -> None:
    root = tmp_path / "payload-root"
    _mkdir_private(root)
    (root / "sessions").write_text("not a directory", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open(root=root, session_id="session1")

    assert exc_info.value.error_type == "payload_directory_unsafe"


def test_open_rejects_existing_session_file(tmp_path: Path) -> None:
    root = tmp_path / "payload-root"
    sessions_dir = root / "sessions"
    _mkdir_private(root)
    _mkdir_private(sessions_dir)
    (sessions_dir / "session1").write_text("not a directory", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open(root=root, session_id="session1")

    assert exc_info.value.error_type == "payload_directory_unsafe"


def test_open_rejects_existing_payloads_file(tmp_path: Path) -> None:
    root = tmp_path / "payload-root"
    sessions_dir = root / "sessions"
    session_dir = sessions_dir / "session1"
    _mkdir_private(root)
    _mkdir_private(sessions_dir)
    _mkdir_private(session_dir)
    (session_dir / "payloads").write_text("not a directory", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open(root=root, session_id="session1")

    assert exc_info.value.error_type == "payload_directory_unsafe"


def test_open_creates_managed_directories_with_private_permissions(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    managed_directories = [
        store.root,
        store.root / "sessions",
        store.root / "sessions" / store.session_id,
        store.payload_dir,
    ]
    assert all(path.is_dir() for path in managed_directories)
    if os.name == "posix":
        assert all(stat.S_IMODE(path.stat().st_mode) & 0o077 == 0 for path in managed_directories)


@pytest.mark.skipif(os.name != "posix", reason="POSIX mode bits are required for this check")
def test_open_rejects_existing_too_permissive_managed_directory(tmp_path: Path) -> None:
    root = tmp_path / "payload-root"
    root.mkdir(mode=0o755)
    root.chmod(0o755)

    try:
        with pytest.raises(PayloadError) as exc_info:
            PayloadStore.open(root=root, session_id="session1")

        assert exc_info.value.error_type == "payload_directory_unsafe"
    finally:
        root.chmod(0o700)


def test_from_environment_resolves_and_prepares_store(tmp_path: Path) -> None:
    root = tmp_path / "env-root"

    store = PayloadStore.from_environment(
        env={
            ASDL_PAYLOAD_ROOT_ENV: str(root),
            ASDL_PAYLOAD_SESSION_ID_ENV: "env-session",
        },
        clock=_fixed_clock,
    )

    assert store.root == root
    assert store.session_id == "env-session"
    assert store.payload_dir == root / "sessions" / "env-session" / "payloads"
    assert store.payload_dir.is_dir()


def test_open_containing_artifact_reopens_existing_artifact_store(tmp_path: Path) -> None:
    store = _open_store(tmp_path)
    source_reference = store.write_json_artifact(
        descriptor="source",
        role="raw",
        payload={"value": 1},
    )

    reopened = PayloadStore.open_containing_artifact(
        Path(source_reference.payload_path),
        clock=_fixed_clock,
    )
    followup_reference = reopened.write_json_artifact(
        descriptor="followup",
        role="summary",
        payload={"value": 2},
    )

    assert reopened.root == store.root
    assert reopened.session_id == store.session_id
    assert reopened.payload_dir == store.payload_dir
    assert followup_reference.sequence == 2
    assert Path(followup_reference.payload_path).parent == store.payload_dir


def test_open_containing_artifact_rejects_relative_path() -> None:
    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(Path("payload.json"))

    assert exc_info.value.error_type == "payload_lookup_failed"


def test_open_containing_artifact_rejects_missing_path(tmp_path: Path) -> None:
    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(tmp_path / "missing.json")

    assert exc_info.value.error_type == "payload_lookup_failed"


def test_open_containing_artifact_rejects_non_managed_layout(tmp_path: Path) -> None:
    payload_path = (
        tmp_path
        / "payload-root"
        / "not-sessions"
        / "session1"
        / "payloads"
        / "20260603t123456z-0001-probe.raw.json"
    )
    payload_path.parent.mkdir(parents=True)
    payload_path.write_text("{}", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(payload_path)

    assert exc_info.value.error_type == "payload_lookup_failed"


def test_open_containing_artifact_rejects_unsafe_session_id(tmp_path: Path) -> None:
    payload_path = (
        tmp_path
        / "payload-root"
        / "sessions"
        / "BadSession"
        / "payloads"
        / "20260603t123456z-0001-probe.raw.json"
    )
    payload_path.parent.mkdir(parents=True)
    payload_path.write_text("{}", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(payload_path)

    assert exc_info.value.error_type == "payload_lookup_failed"


def test_open_containing_artifact_rejects_unmanaged_filename(tmp_path: Path) -> None:
    payload_path = tmp_path / "payload-root" / "sessions" / "session1" / "payloads" / "probe.json"
    payload_path.parent.mkdir(parents=True)
    payload_path.write_text("{}", encoding="utf-8")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(payload_path)

    assert exc_info.value.error_type == "payload_lookup_failed"


@pytest.mark.skipif(os.name != "posix", reason="POSIX symlinks are required for this check")
def test_open_containing_artifact_rejects_symlink_path(tmp_path: Path) -> None:
    target_path = tmp_path / "target.json"
    target_path.write_text("{}", encoding="utf-8")
    link_path = tmp_path / "payload-link.json"
    link_path.symlink_to(target_path)

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(link_path)

    assert exc_info.value.error_type == "payload_lookup_failed"


@pytest.mark.skipif(os.name != "posix", reason="POSIX symlinks are required for this check")
def test_open_containing_artifact_rejects_broken_symlink_as_symlink(tmp_path: Path) -> None:
    link_path = tmp_path / "20260603t123456z-0001-probe.raw.json"
    link_path.symlink_to(tmp_path / "missing-target.json")

    with pytest.raises(PayloadError) as exc_info:
        PayloadStore.open_containing_artifact(link_path)

    assert exc_info.value.error_type == "payload_lookup_failed"
    assert "must not be a symlink" in exc_info.value.message


def test_write_json_artifact_creates_raw_json_reference(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    reference = store.write_json_artifact(
        descriptor="probe",
        role="raw",
        payload={"value": 1},
    )

    payload_path = Path(reference.payload_path)
    assert payload_path.is_absolute()
    assert payload_path.name == "20260603t123456z-0001-probe.raw.json"
    assert json.loads(payload_path.read_text(encoding="utf-8")) == {"value": 1}
    assert reference.session_id == "session1"
    assert reference.descriptor == "probe"
    assert reference.role == "raw"
    assert reference.created_at_utc == "2026-06-03T12:34:56Z"
    assert reference.sequence == 1
    assert reference.payload_bytes == len(payload_path.read_bytes())
    assert reference.content_type == "application/json"
    assert reference.extension == "json"
    if os.name == "posix":
        assert stat.S_IMODE(payload_path.stat().st_mode) & 0o077 == 0


def test_write_json_artifact_creates_summary_json(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    reference = store.write_json_artifact(
        descriptor="summary-probe",
        role="summary",
        payload={"source": "raw"},
    )

    assert Path(reference.payload_path).name == "20260603t123456z-0001-summary-probe.summary.json"
    assert reference.role == "summary"
    assert reference.content_type == "application/json"
    assert reference.extension == "json"


def test_write_text_artifact_creates_log_txt_without_implicit_newline(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    reference = store.write_text_artifact(descriptor="pytest-output", role="log", text="line 1")

    payload_path = Path(reference.payload_path)
    assert payload_path.name == "20260603t123456z-0001-pytest-output.log.txt"
    assert payload_path.read_text(encoding="utf-8") == "line 1"
    assert reference.role == "log"
    assert reference.payload_bytes == len(b"line 1")
    assert reference.content_type == "text/plain"
    assert reference.extension == "txt"


def test_invalid_descriptor_raises_value_error_and_creates_no_files(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    with pytest.raises(ValueError, match="descriptor"):
        store.write_json_artifact(descriptor="Bad", role="raw", payload={"value": 1})

    assert list(store.payload_dir.iterdir()) == []


def test_invalid_json_role_raises_value_error(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    with pytest.raises(ValueError, match="JSON artifact role"):
        store.write_json_artifact(descriptor="probe", role="log", payload={})  # type: ignore[arg-type]

    assert list(store.payload_dir.iterdir()) == []


def test_invalid_text_role_raises_value_error(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    with pytest.raises(ValueError, match="Text artifact role"):
        store.write_text_artifact(descriptor="probe", role="raw", text="log")  # type: ignore[arg-type]

    assert list(store.payload_dir.iterdir()) == []


def test_sequence_increments_per_session_payload_directory(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    first = store.write_json_artifact(descriptor="first", role="raw", payload={"value": 1})
    second = store.write_text_artifact(descriptor="second", role="log", text="log")

    assert first.sequence == 1
    assert second.sequence == 2
    assert Path(first.payload_path).name.startswith("20260603t123456z-0001-")
    assert Path(second.payload_path).name.startswith("20260603t123456z-0002-")


def test_preexisting_matching_payload_filenames_influence_next_sequence(tmp_path: Path) -> None:
    store = _open_store(tmp_path)
    (store.payload_dir / "20260603t000000z-0012-existing.raw.json").write_text(
        "{}",
        encoding="utf-8",
    )

    reference = store.write_text_artifact(descriptor="probe", role="log", text="log")

    assert reference.sequence == 13
    assert Path(reference.payload_path).name.startswith("20260603t123456z-0013-")


def test_non_matching_payload_filenames_are_ignored_for_sequence_scan(tmp_path: Path) -> None:
    store = _open_store(tmp_path)
    (store.payload_dir / "20260603t000000z-9999-BAD.raw.json").write_text(
        "{}",
        encoding="utf-8",
    )
    (store.payload_dir / "notes.txt").write_text("ignored", encoding="utf-8")

    reference = store.write_text_artifact(descriptor="probe", role="log", text="log")

    assert reference.sequence == 1
    assert Path(reference.payload_path).name.startswith("20260603t123456z-0001-")


def test_sequence_is_global_per_session_not_per_descriptor_or_role(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    raw = store.write_json_artifact(descriptor="same", role="raw", payload={"value": 1})
    summary = store.write_json_artifact(descriptor="same", role="summary", payload={"value": 2})
    log = store.write_text_artifact(descriptor="other", role="log", text="log")

    assert raw.sequence == 1
    assert summary.sequence == 2
    assert log.sequence == 3


def test_exclusive_create_collision_rescans_and_retries(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = _open_store(tmp_path)
    real_write = payload_store_module._write_bytes_exclusive
    collision_state = {"collided": False}

    def collide_once(path: Path, payload: bytes) -> None:
        if not collision_state["collided"]:
            collision_state["collided"] = True
            path.write_bytes(b"collision")
            raise FileExistsError(path)
        real_write(path, payload)

    monkeypatch.setattr(payload_store_module, "_write_bytes_exclusive", collide_once)

    reference = store.write_json_artifact(descriptor="probe", role="raw", payload={"value": 1})

    payload_path = Path(reference.payload_path)
    assert reference.sequence == 2
    assert payload_path.name == "20260603t123456z-0002-probe.raw.json"
    assert json.loads(payload_path.read_text(encoding="utf-8")) == {"value": 1}
    payload_matches = [
        candidate
        for candidate in store.payload_dir.iterdir()
        if candidate.read_bytes() == payload_path.read_bytes()
    ]
    assert payload_matches == [payload_path]


def test_json_serialization_failure_raises_payload_write_failed_and_creates_no_artifact(
    tmp_path: Path,
) -> None:
    store = _open_store(tmp_path)

    with pytest.raises(PayloadError) as exc_info:
        store.write_json_artifact(descriptor="probe", role="raw", payload=object())

    assert exc_info.value.error_type == "payload_write_failed"
    assert list(store.payload_dir.iterdir()) == []


def test_partial_write_failure_cleans_up_partial_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = _open_store(tmp_path)

    def fail_after_partial_write(fd: int, payload: bytes) -> None:
        os.write(fd, payload[:1])
        raise OSError("simulated write failure")

    monkeypatch.setattr(payload_store_module, "_write_bytes_to_fd", fail_after_partial_write)

    with pytest.raises(PayloadError) as exc_info:
        store.write_text_artifact(descriptor="probe", role="log", text="log")

    assert exc_info.value.error_type == "payload_write_failed"
    assert list(store.payload_dir.iterdir()) == []
