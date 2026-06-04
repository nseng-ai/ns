"""Lookup helpers for JSON payload side-channel artifacts."""

from __future__ import annotations

import json
import re
from collections.abc import Container
from pathlib import Path
from typing import Final, TypeAlias, cast

from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.segments import is_safe_segment
from asdl_core.payloads.store import PAYLOAD_FILENAME_PATTERN_TEXT

JsonValue: TypeAlias = object

_DEFAULT_JSON_PAYLOAD_ROLES: Final[frozenset[str]] = frozenset({"raw", "summary"})


def resolve_json_pointer(document: JsonValue, pointer: str) -> JsonValue:
    """Resolve an RFC 6901 JSON Pointer against ``document``."""

    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"JSON Pointer must be empty or start with '/': {pointer!r}",
        )

    current = document
    for raw_token in pointer.split("/")[1:]:
        token = _unescape_pointer_token(raw_token, pointer=pointer)
        if isinstance(current, dict):
            current_object = cast(dict[str, JsonValue], current)
            if token not in current_object:
                raise PayloadError(
                    error_type="payload_lookup_failed",
                    message=f"JSON Pointer token {token!r} was not found in object: {pointer!r}",
                )
            current = current_object[token]
            continue
        if isinstance(current, list):
            index = _array_index_for_token(token, pointer=pointer)
            if index >= len(current):
                raise PayloadError(
                    error_type="payload_lookup_failed",
                    message=(
                        f"JSON Pointer array index {index} is out of range for "
                        f"array of length {len(current)}: {pointer!r}"
                    ),
                )
            current = current[index]
            continue
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"JSON Pointer cannot traverse scalar value at token {token!r}: {pointer!r}",
        )
    return current


def read_json_payload_artifact(
    payload_path: Path,
    *,
    allowed_roles: Container[str] | None = None,
) -> JsonValue:
    """Validate and load a JSON payload artifact from an explicit absolute path."""

    roles = _DEFAULT_JSON_PAYLOAD_ROLES if allowed_roles is None else allowed_roles
    _validate_json_payload_artifact_path(payload_path, allowed_roles=roles)
    try:
        return json.loads(payload_path.read_text(encoding="utf-8"))
    except OSError as error:
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Failed to read payload artifact {payload_path}: {error}",
        ) from error
    except json.JSONDecodeError as error:
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Failed to parse JSON payload artifact {payload_path}: {error}",
        ) from error


def read_json_payload_artifact_value(
    payload_path: Path,
    pointer: str,
    *,
    allowed_roles: Container[str] | None = None,
) -> JsonValue:
    """Read one JSON Pointer value from a validated payload artifact."""

    document = read_json_payload_artifact(payload_path, allowed_roles=allowed_roles)
    return resolve_json_pointer(document, pointer)


def _unescape_pointer_token(token: str, *, pointer: str) -> str:
    result: list[str] = []
    index = 0
    while index < len(token):
        char = token[index]
        if char != "~":
            result.append(char)
            index += 1
            continue
        escape_index = index + 1
        if escape_index >= len(token):
            raise PayloadError(
                error_type="payload_lookup_failed",
                message=f"Invalid JSON Pointer escape in {pointer!r}: trailing '~'",
            )
        escape_char = token[escape_index]
        if escape_char == "0":
            result.append("~")
        elif escape_char == "1":
            result.append("/")
        else:
            raise PayloadError(
                error_type="payload_lookup_failed",
                message=f"Invalid JSON Pointer escape '~{escape_char}' in {pointer!r}",
            )
        index += 2
    return "".join(result)


def _array_index_for_token(token: str, *, pointer: str) -> int:
    if token == "-":
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"JSON Pointer '-' token is not a valid array index: {pointer!r}",
        )
    if token == "0":
        return 0
    if token.startswith("0"):
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"JSON Pointer array index must not contain leading zeroes: {pointer!r}",
        )
    if not token.isdecimal():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"JSON Pointer array token is not a non-negative integer: {pointer!r}",
        )
    return int(token)


def _validate_json_payload_artifact_path(
    payload_path: Path,
    *,
    allowed_roles: Container[str],
) -> None:
    if not payload_path.is_absolute():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path must be absolute: {payload_path}",
        )
    if not payload_path.exists():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path does not exist: {payload_path}",
        )
    if payload_path.is_symlink():
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact path must not be a symlink: {payload_path}",
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

    match = re.fullmatch(PAYLOAD_FILENAME_PATTERN_TEXT, payload_path.name)
    if match is None:
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=(
                f"Payload artifact filename does not match payload contract: {payload_path.name}"
            ),
        )
    if match.group("role") not in allowed_roles:
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=(
                f"Payload artifact role {match.group('role')!r} is not allowed for this lookup: "
                f"{payload_path}"
            ),
        )
    if match.group("extension") != "json":
        raise PayloadError(
            error_type="payload_lookup_failed",
            message=f"Payload artifact extension must be json: {payload_path}",
        )
