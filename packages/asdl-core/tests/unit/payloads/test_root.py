"""Tests for payload root and session resolution."""

from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.root import (
    ASDL_PAYLOAD_ROOT_ENV,
    ASDL_PAYLOAD_SESSION_ID_ENV,
    default_payload_root,
    resolve_payload_root,
    resolve_payload_session_id,
)


def test_payload_error_exposes_stable_type_message_and_string() -> None:
    error = PayloadError(error_type="payload_session_required", message="session needed")

    assert error.error_type == "payload_session_required"
    assert error.message == "session needed"
    assert str(error) == "session needed"


def test_default_payload_root_is_temp_dir_asdl(tmp_path: Path) -> None:
    assert default_payload_root(temp_dir=tmp_path) == tmp_path / "asdl"


def test_resolve_payload_root_uses_default_when_env_override_missing(tmp_path: Path) -> None:
    assert resolve_payload_root(env={}, temp_dir=tmp_path) == tmp_path / "asdl"


def test_resolve_payload_root_uses_absolute_env_override(tmp_path: Path) -> None:
    payload_root = tmp_path / "custom-root"

    assert resolve_payload_root(env={ASDL_PAYLOAD_ROOT_ENV: str(payload_root)}) == payload_root


def test_resolve_payload_root_treats_empty_env_override_as_missing(tmp_path: Path) -> None:
    assert (
        resolve_payload_root(env={ASDL_PAYLOAD_ROOT_ENV: ""}, temp_dir=tmp_path)
        == tmp_path / "asdl"
    )


def test_resolve_payload_root_rejects_relative_env_override() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_payload_root(env={ASDL_PAYLOAD_ROOT_ENV: "relative/root"})

    assert exc_info.value.error_type == "payload_root_invalid"


def test_resolve_payload_session_id_prefers_explicit_over_env() -> None:
    assert (
        resolve_payload_session_id(
            "explicit-session",
            env={ASDL_PAYLOAD_SESSION_ID_ENV: "env-session"},
        )
        == "explicit-session"
    )


def test_resolve_payload_session_id_uses_env_when_explicit_missing() -> None:
    assert (
        resolve_payload_session_id(env={ASDL_PAYLOAD_SESSION_ID_ENV: "env-session"})
        == "env-session"
    )


def test_resolve_payload_session_id_treats_empty_explicit_as_missing() -> None:
    assert (
        resolve_payload_session_id("", env={ASDL_PAYLOAD_SESSION_ID_ENV: "env-session"})
        == "env-session"
    )


@pytest.mark.parametrize("env", [{}, {ASDL_PAYLOAD_SESSION_ID_ENV: ""}])
def test_resolve_payload_session_id_requires_supplied_session(env: dict[str, str]) -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_payload_session_id(env=env)

    assert exc_info.value.error_type == "payload_session_required"


def test_resolve_payload_session_id_rejects_invalid_explicit_session() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_payload_session_id("BadSession", env={ASDL_PAYLOAD_SESSION_ID_ENV: "env-session"})

    assert exc_info.value.error_type == "payload_session_invalid"


def test_resolve_payload_session_id_rejects_invalid_env_session() -> None:
    with pytest.raises(PayloadError) as exc_info:
        resolve_payload_session_id(env={ASDL_PAYLOAD_SESSION_ID_ENV: "bad/session"})

    assert exc_info.value.error_type == "payload_session_invalid"
