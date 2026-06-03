"""Clinkr helpers for opt-in payload sidecar writes."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from pathlib import Path
from typing import Any, NoReturn

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.models import PayloadReference
from asdl_core.payloads.store import PayloadStore


def open_clinkr_payload_store(
    explicit_session_id: str | None = None,
    *,
    env: Mapping[str, str] | None = None,
    temp_dir: Path | None = None,
    clock: Callable[[], datetime] | None = None,
) -> PayloadStore:
    """Open a payload store for a Clinkr sidecar command.

    Payload preflight failures are translated to ``ClinkrFailure`` so the
    Clinkr dispatcher emits a stable failure envelope with no result data.
    """

    try:
        return PayloadStore.from_environment(
            explicit_session_id,
            env=env,
            temp_dir=temp_dir,
            clock=clock,
        )
    except PayloadError as error:
        _raise_clinkr_failure_for_payload_error(error)


def write_clinkr_raw_sidecar(
    *,
    store: PayloadStore,
    descriptor: str,
    result: ClinkrExit[Any],
) -> PayloadReference:
    """Write ``result`` as a full Clinkr machine envelope raw sidecar."""

    try:
        envelope = result.to_envelope_dict()
    except (TypeError, ValueError) as error:
        raise ClinkrFailure(
            error_type="payload_write_failed",
            message=(
                f"Failed to build Clinkr raw payload envelope for descriptor "
                f"{descriptor!r}: {error}"
            ),
        ) from error

    try:
        return store.write_json_artifact(
            descriptor=descriptor,
            role="raw",
            payload=envelope,
        )
    except PayloadError as error:
        _raise_clinkr_failure_for_payload_error(error)


def _raise_clinkr_failure_for_payload_error(error: PayloadError) -> NoReturn:
    raise ClinkrFailure(error_type=error.error_type, message=error.message) from error
