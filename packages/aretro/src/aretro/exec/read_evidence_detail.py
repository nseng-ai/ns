"""Read one selected value from an aretro evidence payload artifact."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any, NoReturn, cast

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.lookup import read_json_payload_artifact, resolve_json_pointer


class ReadEvidenceDetailRequest(ClinkrModel):
    payload_path: Annotated[
        str,
        click.Option(["--payload-path"], type=click.STRING, required=True),
    ]
    json_pointer: Annotated[
        str,
        click.Option(["--json-pointer"], type=click.STRING, required=True),
    ]


class ReadEvidenceDetailResult(ClinkrModel):
    payload_path: str
    json_pointer: str
    value: Any


@clinkr_operation(
    name="read-evidence-detail",
    help="Read one selected value from an aretro evidence payload artifact.",
)
def run_read_evidence_detail(
    ctx: click.Context,
    request: ReadEvidenceDetailRequest,
) -> ClinkrExit[ReadEvidenceDetailResult]:
    del ctx
    _validate_data_pointer(request.json_pointer)
    envelope = _read_raw_payload_envelope(Path(request.payload_path))
    _validate_success_envelope(envelope, payload_path=request.payload_path)
    _validate_payload_data(envelope, payload_path=request.payload_path)
    value = _resolve_detail_value(envelope, request.json_pointer)
    return ClinkrExit.ok(
        ReadEvidenceDetailResult(
            payload_path=request.payload_path,
            json_pointer=request.json_pointer,
            value=value,
        )
    )


def _validate_data_pointer(pointer: str) -> None:
    if pointer == "/data" or pointer.startswith("/data/"):
        return
    Ensure.fail(
        error_type="invalid_request",
        message=f"JSON Pointer must target the payload data document under /data: {pointer!r}",
    )


def _read_raw_payload_envelope(payload_path: Path) -> dict[str, Any]:
    try:
        document = read_json_payload_artifact(payload_path, allowed_roles=frozenset({"raw"}))
    except PayloadError as error:
        _raise_clinkr_failure_for_payload_error(error)

    if not isinstance(document, dict):
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=f"Raw payload artifact must contain a Clinkr envelope object: {payload_path}",
        )
    return cast(dict[str, Any], document)


def _validate_success_envelope(envelope: dict[str, Any], *, payload_path: str) -> None:
    exit_code = envelope.get("exit_code")
    if not isinstance(exit_code, int) or isinstance(exit_code, bool) or exit_code != 0:
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=f"Raw payload artifact must be a successful Clinkr envelope: {payload_path}",
        )
    if "data" not in envelope:
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=f"Raw payload artifact is missing Clinkr data: {payload_path}",
        )


def _validate_payload_data(envelope: dict[str, Any], *, payload_path: str) -> None:
    data = envelope.get("data")
    if not isinstance(data, dict):
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=f"Raw payload artifact data must be an aretro detail object: {payload_path}",
        )
    schema_version = data.get("schema_version")
    if not isinstance(schema_version, int) or isinstance(schema_version, bool):
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=(
                f"Raw payload artifact data is missing a supported schema version: {payload_path}"
            ),
        )
    if schema_version != 1:
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=f"Raw payload artifact schema version is unsupported: {payload_path}",
        )


def _resolve_detail_value(envelope: dict[str, Any], pointer: str) -> Any:
    try:
        return resolve_json_pointer(envelope, pointer)
    except PayloadError as error:
        _raise_clinkr_failure_for_payload_error(error)


def _raise_clinkr_failure_for_payload_error(error: PayloadError) -> NoReturn:
    raise ClinkrFailure(error_type=error.error_type, message=error.message) from error
