"""Payload root and session-id resolution helpers."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Mapping
from pathlib import Path

from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.segments import is_safe_segment

ASDL_PAYLOAD_ROOT_ENV = "ASDL_PAYLOAD_ROOT"
ASDL_PAYLOAD_SESSION_ID_ENV = "ASDL_PAYLOAD_SESSION_ID"


def default_payload_root(*, temp_dir: Path | None = None) -> Path:
    """Return the default payload root under the platform temp directory."""

    base_temp_dir = temp_dir if temp_dir is not None else Path(tempfile.gettempdir())
    return base_temp_dir / "asdl"


def resolve_payload_root(
    *,
    env: Mapping[str, str] | None = None,
    temp_dir: Path | None = None,
) -> Path:
    """Resolve the payload root from ``ASDL_PAYLOAD_ROOT`` or the default temp root."""

    source_env = os.environ if env is None else env
    env_value = source_env.get(ASDL_PAYLOAD_ROOT_ENV)
    if env_value is None or env_value == "":
        return default_payload_root(temp_dir=temp_dir)

    payload_root = Path(env_value)
    if payload_root.is_absolute():
        return payload_root
    raise PayloadError(
        error_type="payload_root_invalid",
        message=f"{ASDL_PAYLOAD_ROOT_ENV} must be an absolute path: {env_value!r}",
    )


def resolve_payload_session_id(
    explicit_session_id: str | None = None,
    *,
    env: Mapping[str, str] | None = None,
) -> str:
    """Resolve and validate a supplied payload session id."""

    source_env = os.environ if env is None else env
    if explicit_session_id is not None and explicit_session_id != "":
        session_id = explicit_session_id
    else:
        env_session_id = source_env.get(ASDL_PAYLOAD_SESSION_ID_ENV)
        if env_session_id is None or env_session_id == "":
            raise PayloadError(
                error_type="payload_session_required",
                message=(
                    "Payload artifact mode requires a session id from an explicit option "
                    f"or {ASDL_PAYLOAD_SESSION_ID_ENV}."
                ),
            )
        session_id = env_session_id

    if is_safe_segment(session_id):
        return session_id
    raise PayloadError(
        error_type="payload_session_invalid",
        message=f"Payload session id must be a safe segment: {session_id!r}",
    )
