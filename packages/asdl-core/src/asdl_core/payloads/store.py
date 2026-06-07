"""Payload artifact store."""

from __future__ import annotations

import json
import os
import re
import stat
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Self

from asdl_core.payloads.errors import PayloadError, PayloadErrorType
from asdl_core.payloads.models import PayloadExtension, PayloadReference, PayloadRole
from asdl_core.payloads.root import resolve_payload_root, resolve_payload_session_id
from asdl_core.payloads.segments import is_safe_segment, require_safe_segment

SAFE_SEGMENT_FILENAME_PATTERN_TEXT = r"[a-z0-9][a-z0-9._-]{0,127}"
PAYLOAD_FILENAME_PATTERN_TEXT = (
    r"^\d{8}t\d{6}z-"
    r"(?P<sequence>\d+)-"
    rf"(?P<descriptor>{SAFE_SEGMENT_FILENAME_PATTERN_TEXT})\."
    r"(?P<role>raw|summary|log)\."
    r"(?P<extension>json|txt)$"
)
PAYLOAD_FILENAME_PATTERN = re.compile(PAYLOAD_FILENAME_PATTERN_TEXT)

JsonPayloadRole = Literal["raw", "summary"]
LogPayloadRole = Literal["log"]


@dataclass(frozen=True)
class PayloadStore:
    """Store for one validated payload root and session id."""

    root: Path
    session_id: str
    payload_dir: Path
    _clock: Callable[[], datetime] = field(repr=False, compare=False)

    @classmethod
    def open(
        cls,
        *,
        root: Path,
        session_id: str,
        clock: Callable[[], datetime] | None = None,
    ) -> Self:
        """Validate and prepare the store directories for ``session_id``."""

        if not root.is_absolute():
            raise PayloadError(
                error_type="payload_root_invalid",
                message=f"Payload root must be an absolute path: {root}",
            )
        if not is_safe_segment(session_id):
            raise PayloadError(
                error_type="payload_session_invalid",
                message=f"Payload session id must be a safe segment: {session_id!r}",
            )

        sessions_dir = root / "sessions"
        session_dir = sessions_dir / session_id
        payload_dir = session_dir / "payloads"

        _ensure_private_directory(
            root,
            not_directory_error_type="payload_root_invalid",
            create_error_type="payload_root_invalid",
        )
        _ensure_private_directory(
            sessions_dir,
            not_directory_error_type="payload_directory_unsafe",
            create_error_type="payload_directory_unsafe",
        )
        _ensure_private_directory(
            session_dir,
            not_directory_error_type="payload_directory_unsafe",
            create_error_type="payload_directory_unsafe",
        )
        _ensure_private_directory(
            payload_dir,
            not_directory_error_type="payload_directory_unsafe",
            create_error_type="payload_directory_unsafe",
        )

        return cls(
            root=root,
            session_id=session_id,
            payload_dir=payload_dir,
            _clock=clock if clock is not None else _default_clock,
        )

    @classmethod
    def open_containing_artifact(
        cls,
        payload_path: Path,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> Self:
        """Open the managed payload store containing an existing artifact path."""

        _validate_contained_artifact_path(payload_path)
        return cls.open(
            root=payload_path.parent.parent.parent.parent,
            session_id=payload_path.parent.parent.name,
            clock=clock,
        )

    @classmethod
    def from_environment(
        cls,
        explicit_session_id: str | None = None,
        *,
        env: Mapping[str, str] | None = None,
        temp_dir: Path | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> Self:
        """Open a store using environment-backed root and session-id resolution."""

        return cls.open(
            root=resolve_payload_root(env=env, temp_dir=temp_dir),
            session_id=resolve_payload_session_id(explicit_session_id, env=env),
            clock=clock,
        )

    def write_json_artifact(
        self,
        *,
        descriptor: str,
        role: JsonPayloadRole,
        payload: object,
    ) -> PayloadReference:
        """Write a JSON raw or summary artifact and return its payload reference."""

        if role not in ("raw", "summary"):
            raise ValueError(f"JSON artifact role must be 'raw' or 'summary': {role!r}")
        try:
            payload_bytes = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
        except (TypeError, ValueError) as error:
            raise PayloadError(
                error_type="payload_write_failed",
                message=f"Failed to serialize JSON payload for descriptor {descriptor!r}: {error}",
            ) from error

        return self._write_artifact(
            descriptor=descriptor,
            role=role,
            extension="json",
            content_type="application/json",
            payload_bytes=payload_bytes,
        )

    def write_text_artifact(
        self,
        *,
        descriptor: str,
        role: LogPayloadRole,
        text: str,
    ) -> PayloadReference:
        """Write a text log artifact and return its payload reference."""

        if role != "log":
            raise ValueError(f"Text artifact role must be 'log': {role!r}")
        return self._write_artifact(
            descriptor=descriptor,
            role=role,
            extension="txt",
            content_type="text/plain",
            payload_bytes=text.encode("utf-8"),
        )

    def _write_artifact(
        self,
        *,
        descriptor: str,
        role: PayloadRole,
        extension: PayloadExtension,
        content_type: str,
        payload_bytes: bytes,
    ) -> PayloadReference:
        require_safe_segment(descriptor, label="descriptor")
        created_at_utc, filename_timestamp = _payload_timestamps(self._clock())

        while True:
            sequence = self._next_sequence()
            payload_path = self.payload_dir / _payload_filename(
                filename_timestamp=filename_timestamp,
                sequence=sequence,
                descriptor=descriptor,
                role=role,
                extension=extension,
            )
            try:
                _write_bytes_exclusive(payload_path, payload_bytes)
            except FileExistsError:
                continue
            except OSError as error:
                raise PayloadError(
                    error_type="payload_write_failed",
                    message=f"Failed to write payload artifact {payload_path}: {error}",
                ) from error

            return PayloadReference(
                payload_path=str(payload_path),
                session_id=self.session_id,
                descriptor=descriptor,
                role=role,
                created_at_utc=created_at_utc,
                sequence=sequence,
                payload_bytes=len(payload_bytes),
                content_type=content_type,
                extension=extension,
            )

    def _next_sequence(self) -> int:
        max_sequence = 0
        try:
            payload_entries = tuple(self.payload_dir.iterdir())
        except OSError as error:
            raise PayloadError(
                error_type="payload_write_failed",
                message=f"Failed to scan payload directory {self.payload_dir}: {error}",
            ) from error

        for payload_entry in payload_entries:
            match = PAYLOAD_FILENAME_PATTERN.fullmatch(payload_entry.name)
            if match is not None:
                max_sequence = max(max_sequence, int(match.group("sequence")))
        return max_sequence + 1


def _default_clock() -> datetime:
    return datetime.now(UTC)


def _validate_contained_artifact_path(payload_path: Path) -> None:
    if not payload_path.is_absolute():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path must be absolute: {payload_path}",
        )
    if payload_path.is_symlink():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path must not be a symlink: {payload_path}",
        )
    if not payload_path.exists():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path does not exist: {payload_path}",
        )
    if not payload_path.is_file():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path must be a regular file: {payload_path}",
        )
    if payload_path.parent.name != "payloads":
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact must live under a payloads directory: {payload_path}",
        )

    session_id = payload_path.parent.parent.name
    if not is_safe_segment(session_id):
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact session id must be a safe segment: {session_id!r}",
        )
    if payload_path.parent.parent.parent.name != "sessions":
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=(
                f"Payload artifact must live under sessions/<session-id>/payloads: {payload_path}"
            ),
        )
    if PAYLOAD_FILENAME_PATTERN.fullmatch(payload_path.name) is None:
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=(
                f"Payload artifact filename does not match payload contract: {payload_path.name}"
            ),
        )


def _payload_timestamps(value: datetime) -> tuple[str, str]:
    if value.tzinfo is None or value.utcoffset() is None:
        utc_value = value.replace(tzinfo=UTC)
    else:
        utc_value = value.astimezone(UTC)
    utc_value = utc_value.replace(microsecond=0)
    return utc_value.isoformat().replace("+00:00", "Z"), utc_value.strftime("%Y%m%dt%H%M%Sz")


def _payload_filename(
    *,
    filename_timestamp: str,
    sequence: int,
    descriptor: str,
    role: PayloadRole,
    extension: PayloadExtension,
) -> str:
    return f"{filename_timestamp}-{sequence:04d}-{descriptor}.{role}.{extension}"


def _ensure_private_directory(
    path: Path,
    *,
    not_directory_error_type: PayloadErrorType,
    create_error_type: PayloadErrorType,
) -> None:
    if path.is_symlink():
        raise PayloadError(
            error_type="payload_directory_unsafe",
            message=f"Managed payload path must not be a symlink: {path}",
        )
    if path.exists():
        if not path.is_dir():
            raise PayloadError(
                error_type=not_directory_error_type,
                message=f"Managed payload path must be a directory: {path}",
            )
        _validate_private_directory(path)
        return

    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        if path.is_symlink() or not path.is_dir():
            raise PayloadError(
                error_type=not_directory_error_type,
                message=f"Managed payload path must be a directory: {path}",
            ) from None
        _validate_private_directory(path)
        return
    except OSError as error:
        raise PayloadError(
            error_type=create_error_type,
            message=f"Failed to create managed payload directory {path}: {error}",
        ) from error

    try:
        path.chmod(0o700)
    except OSError as error:
        raise PayloadError(
            error_type="payload_directory_unsafe",
            message=(
                f"Failed to set private permissions on managed payload directory {path}: {error}"
            ),
        ) from error
    _validate_private_directory(path)


def _validate_private_directory(path: Path) -> None:
    if os.name != "posix":
        return
    try:
        path_mode = stat.S_IMODE(path.stat().st_mode)
    except OSError as error:
        raise PayloadError(
            error_type="payload_directory_unsafe",
            message=f"Failed to inspect managed payload directory {path}: {error}",
        ) from error
    if path_mode & 0o077 != 0:
        raise PayloadError(
            error_type="payload_directory_unsafe",
            message=f"Managed payload directory must not be group/world accessible: {path}",
        )


def _write_bytes_exclusive(path: Path, payload: bytes) -> None:
    fd: int | None = None
    owns_path = False
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        owns_path = True
        _set_private_file_mode(fd)
        _write_bytes_to_fd(fd, payload)
        os.close(fd)
        fd = None
    except FileExistsError:
        raise
    except OSError:
        if fd is not None:
            _close_fd_after_write_failure(fd)
        if owns_path:
            _remove_partial_payload_file(path)
        raise


def _set_private_file_mode(fd: int) -> None:
    if os.name == "posix":
        os.fchmod(fd, 0o600)


def _write_bytes_to_fd(fd: int, payload: bytes) -> None:
    bytes_written_total = 0
    while bytes_written_total < len(payload):
        bytes_written = os.write(fd, payload[bytes_written_total:])
        if bytes_written == 0:
            raise OSError("write returned 0 bytes")
        bytes_written_total += bytes_written


def _close_fd_after_write_failure(fd: int) -> None:
    try:
        os.close(fd)
    except OSError:
        # Best-effort cleanup close: preserve the original write/open failure.
        return


def _remove_partial_payload_file(path: Path) -> None:
    if path.exists() and not path.is_dir():
        path.unlink()
