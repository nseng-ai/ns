"""Tests for Clinkr payload sidecar helpers."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal

import click
import pytest
from click.testing import CliRunner

import asdl_core.payloads.store as payload_store_module
from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.exit import ClinkrExit, ExitStatus
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.payloads.clinkr import open_clinkr_payload_store, write_clinkr_raw_sidecar
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.models import PayloadReference
from asdl_core.payloads.root import ASDL_PAYLOAD_ROOT_ENV, ASDL_PAYLOAD_SESSION_ID_ENV
from asdl_core.payloads.store import PayloadStore


class _RawProbeResult(ClinkrModel):
    value: str


class _SidecarManifest(ClinkrModel):
    payload_mode: Literal["sidecar"]
    payload_reference: PayloadReference


class _HelperRequest(ClinkrModel):
    payload_root: Annotated[str, click.Argument(["payload_root"], type=click.STRING)]
    session_id: Annotated[str, click.Argument(["session_id"], type=click.STRING)]


def _fixed_clock() -> datetime:
    return datetime(2026, 6, 3, 12, 34, 56, tzinfo=UTC)


def _open_store(tmp_path: Path) -> PayloadStore:
    return PayloadStore.open(
        root=tmp_path / "payload-root",
        session_id="session1",
        clock=_fixed_clock,
    )


def _payload_env(*, root: str, session_id: str) -> dict[str, str]:
    return {
        ASDL_PAYLOAD_ROOT_ENV: root,
        ASDL_PAYLOAD_SESSION_ID_ENV: session_id,
    }


def _read_payload_json(reference: PayloadReference) -> dict[str, object]:
    return json.loads(Path(reference.payload_path).read_text(encoding="utf-8"))


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="payload-probes",
        operations=[_run_open_helper_failure, _run_sidecar_manifest],
    )


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


@clinkr_operation(name="open-helper-failure", help="Exercise helper failure dispatch.")
def _run_open_helper_failure(
    ctx: click.Context,
    request: _HelperRequest,
) -> ClinkrExit[_RawProbeResult]:
    del ctx
    open_clinkr_payload_store(
        env=_payload_env(root=request.payload_root, session_id=request.session_id),
        clock=_fixed_clock,
    )
    return ClinkrExit.ok(_RawProbeResult(value="not reached"))


@clinkr_operation(name="sidecar-manifest", help="Exercise helper manifest dispatch.")
def _run_sidecar_manifest(
    ctx: click.Context,
    request: _HelperRequest,
) -> ClinkrExit[_SidecarManifest]:
    del ctx
    store = open_clinkr_payload_store(
        env=_payload_env(root=request.payload_root, session_id=request.session_id),
        clock=_fixed_clock,
    )
    reference = write_clinkr_raw_sidecar(
        store=store,
        descriptor="operation-probe",
        result=ClinkrExit.ok(_RawProbeResult(value="from sidecar")),
    )
    return ClinkrExit.ok(
        _SidecarManifest(payload_mode="sidecar", payload_reference=reference),
    )


def test_open_clinkr_payload_store_uses_env_and_creates_store(tmp_path: Path) -> None:
    root = tmp_path / "env-root"

    store = open_clinkr_payload_store(
        env=_payload_env(root=str(root), session_id="env-session"),
        clock=_fixed_clock,
    )

    assert store.root == root
    assert store.session_id == "env-session"
    assert store.payload_dir == root / "sessions" / "env-session" / "payloads"
    assert store.payload_dir.is_dir()


def test_open_clinkr_payload_store_translates_missing_session_to_clinkr_failure(
    tmp_path: Path,
) -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        open_clinkr_payload_store(env={}, temp_dir=tmp_path, clock=_fixed_clock)

    assert exc_info.value.error_type == "payload_session_required"
    assert isinstance(exc_info.value.__cause__, PayloadError)


def test_open_clinkr_payload_store_translates_relative_root_to_clinkr_failure() -> None:
    with pytest.raises(ClinkrFailure) as exc_info:
        open_clinkr_payload_store(
            env=_payload_env(root="relative-root", session_id="session1"),
            clock=_fixed_clock,
        )

    assert exc_info.value.error_type == "payload_root_invalid"
    assert isinstance(exc_info.value.__cause__, PayloadError)


def test_write_clinkr_raw_sidecar_writes_ok_machine_envelope(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    reference = write_clinkr_raw_sidecar(
        store=store,
        descriptor="probe",
        result=ClinkrExit.ok(_RawProbeResult(value="found")),
    )

    payload_path = Path(reference.payload_path)
    assert payload_path.is_absolute()
    assert reference.session_id == "session1"
    assert reference.descriptor == "probe"
    assert reference.role == "raw"
    assert reference.content_type == "application/json"
    assert reference.extension == "json"
    assert reference.payload_bytes == len(payload_path.read_bytes())
    assert _read_payload_json(reference) == {
        "exit_code": 0,
        "data": {"value": "found"},
    }


def test_write_clinkr_raw_sidecar_writes_negative_machine_envelope(tmp_path: Path) -> None:
    store = _open_store(tmp_path)

    reference = write_clinkr_raw_sidecar(
        store=store,
        descriptor="probe",
        result=ClinkrExit.negative(_RawProbeResult(value="partial"), message="nothing here"),
    )

    assert _read_payload_json(reference) == {
        "exit_code": 1,
        "message": "nothing here",
        "data": {"value": "partial"},
    }


def test_write_clinkr_raw_sidecar_writes_failure_machine_envelope_without_data(
    tmp_path: Path,
) -> None:
    store = _open_store(tmp_path)

    reference = write_clinkr_raw_sidecar(
        store=store,
        descriptor="probe",
        result=ClinkrExit.failure(error_type="bad_mode", message="boom"),
    )

    assert _read_payload_json(reference) == {
        "exit_code": 2,
        "error_type": "bad_mode",
        "message": "boom",
    }
    assert "data" not in _read_payload_json(reference)


def test_write_clinkr_raw_sidecar_translates_payload_write_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = _open_store(tmp_path)

    def fail_after_partial_write(fd: int, payload: bytes) -> None:
        os.write(fd, payload[:1])
        raise OSError("simulated write failure")

    monkeypatch.setattr(payload_store_module, "_write_bytes_to_fd", fail_after_partial_write)

    with pytest.raises(ClinkrFailure) as exc_info:
        write_clinkr_raw_sidecar(
            store=store,
            descriptor="probe",
            result=ClinkrExit.ok(_RawProbeResult(value="found")),
        )

    assert exc_info.value.error_type == "payload_write_failed"
    assert isinstance(exc_info.value.__cause__, PayloadError)
    assert list(store.payload_dir.iterdir()) == []


def test_write_clinkr_raw_sidecar_translates_envelope_serialization_failure(
    tmp_path: Path,
) -> None:
    store = _open_store(tmp_path)

    with pytest.raises(ClinkrFailure) as exc_info:
        write_clinkr_raw_sidecar(
            store=store,
            descriptor="probe",
            result=ClinkrExit(status=ExitStatus.OK, data=object()),
        )

    assert exc_info.value.error_type == "payload_write_failed"
    assert "Cannot serialize result of type object" in exc_info.value.message
    assert list(store.payload_dir.iterdir()) == []


def test_operation_using_open_helper_failure_dispatches_json_failure_without_data() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["open-helper-failure", "relative-root", "session1", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 2
    envelope = json.loads(result.output)
    assert envelope["exit_code"] == 2
    assert envelope["error_type"] == "payload_root_invalid"
    assert "data" not in envelope


def test_operation_using_helper_returns_manifest_and_writes_raw_sidecar(tmp_path: Path) -> None:
    root = tmp_path / "payload-root"

    result = CliRunner().invoke(
        _make_group(),
        ["sidecar-manifest", str(root), "session1", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    envelope = json.loads(result.output)
    assert envelope["exit_code"] == 0
    data = envelope["data"]
    assert data["payload_mode"] == "sidecar"
    reference = data["payload_reference"]
    assert reference["descriptor"] == "operation-probe"
    assert reference["role"] == "raw"
    assert json.loads(Path(reference["payload_path"]).read_text(encoding="utf-8")) == {
        "exit_code": 0,
        "data": {"value": "from sidecar"},
    }
