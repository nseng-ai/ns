"""Read one selected feedback detail from a raw PR feedback payload."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Annotated, Any, Final, Literal, NoReturn, TypeAlias, cast

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.lookup import read_json_payload_artifact, resolve_json_pointer

DetailKind: TypeAlias = Literal[
    "review",
    "review_body",
    "review_thread",
    "thread_comment",
    "thread_comment_body",
    "discussion_comment",
    "discussion_comment_body",
]

_DETAIL_KIND_PATTERNS: Final[tuple[tuple[str, DetailKind], ...]] = (
    (r"^/data/reviews/(0|[1-9][0-9]*)$", "review"),
    (r"^/data/reviews/(0|[1-9][0-9]*)/body$", "review_body"),
    (r"^/data/review_threads/(0|[1-9][0-9]*)$", "review_thread"),
    (
        r"^/data/review_threads/(0|[1-9][0-9]*)/comments/(0|[1-9][0-9]*)$",
        "thread_comment",
    ),
    (
        r"^/data/review_threads/(0|[1-9][0-9]*)/comments/(0|[1-9][0-9]*)/body$",
        "thread_comment_body",
    ),
    (r"^/data/discussion_comments/(0|[1-9][0-9]*)$", "discussion_comment"),
    (r"^/data/discussion_comments/(0|[1-9][0-9]*)/body$", "discussion_comment_body"),
)


class ReadFeedbackDetailRequest(ClinkrModel):
    payload_path: Annotated[
        str,
        click.Option(["--payload-path"], type=click.STRING, required=True),
    ]
    json_pointer: Annotated[
        str,
        click.Option(["--json-pointer"], type=click.STRING, required=True),
    ]


class ReadFeedbackDetailResult(ClinkrModel):
    payload_path: str
    json_pointer: str
    detail_kind: DetailKind
    value: Any


@clinkr_operation(
    name="read-feedback-detail",
    help="Read one selected PR feedback body or item from a raw payload artifact.",
)
def run_read_feedback_detail(
    ctx: click.Context,
    request: ReadFeedbackDetailRequest,
) -> ClinkrExit[ReadFeedbackDetailResult]:
    del ctx
    detail_kind = _validated_detail_kind(request.json_pointer)
    envelope = _read_raw_payload_envelope(Path(request.payload_path))
    _validate_success_envelope(envelope, payload_path=request.payload_path)
    value = _resolve_detail_value(envelope, request.json_pointer)
    _validate_detail_value_type(
        value,
        detail_kind=detail_kind,
        payload_path=request.payload_path,
        json_pointer=request.json_pointer,
    )
    return ClinkrExit.ok(
        ReadFeedbackDetailResult(
            payload_path=request.payload_path,
            json_pointer=request.json_pointer,
            detail_kind=detail_kind,
            value=value,
        )
    )


def _validated_detail_kind(pointer: str) -> DetailKind:
    detail_kind = _detail_kind_for_pointer(pointer)
    if detail_kind is None:
        Ensure.fail(
            error_type="invalid_request",
            message=f"JSON Pointer is not an allowed PR feedback detail locator: {pointer!r}",
        )
    return detail_kind


def _detail_kind_for_pointer(pointer: str) -> DetailKind | None:
    for pattern, detail_kind in _DETAIL_KIND_PATTERNS:
        if re.fullmatch(pattern, pointer) is not None:
            return detail_kind
    return None


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


def _resolve_detail_value(envelope: dict[str, Any], pointer: str) -> Any:
    try:
        return resolve_json_pointer(envelope, pointer)
    except PayloadError as error:
        _raise_clinkr_failure_for_payload_error(error)


def _validate_detail_value_type(
    value: Any,
    *,
    detail_kind: DetailKind,
    payload_path: str,
    json_pointer: str,
) -> None:
    if detail_kind.endswith("_body"):
        if not isinstance(value, str):
            Ensure.fail(
                error_type="payload_lookup_failed",
                message=(
                    f"Feedback body locator resolved to non-string value in {payload_path}: "
                    f"{json_pointer}"
                ),
            )
        return

    if not isinstance(value, dict):
        Ensure.fail(
            error_type="payload_lookup_failed",
            message=(
                f"Feedback item locator resolved to non-object value in {payload_path}: "
                f"{json_pointer}"
            ),
        )


def _raise_clinkr_failure_for_payload_error(error: PayloadError) -> NoReturn:
    raise ClinkrFailure(error_type=error.error_type, message=error.message) from error
