"""Golden contract tests for deterministic pr-address data shapes."""

from __future__ import annotations

import json
from dataclasses import is_dataclass
from pathlib import Path
from typing import Any

import pytest
from pydantic import TypeAdapter

from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.pr_address import reply_formatting
from asdl_pr_address.cli.pr_address.batch_checkpoint_models import RecordBatchCheckpointInput
from asdl_pr_address.cli.pr_address.batch_checkpoint_validation import record_batch_checkpoint
from asdl_pr_address.cli.pr_address.build_resolve_thread_batch_payload import (
    BuildResolveThreadBatchPayloadInput,
    build_resolve_thread_batch_payload,
)
from asdl_pr_address.cli.pr_address.feedback_classification import (
    validate_feedback_classification,
)
from asdl_pr_address.cli.pr_address.feedback_classification_template import (
    build_feedback_classification_template,
)
from asdl_pr_address.cli.pr_address.feedback_payload import (
    build_get_feedback_payload_manifest,
    build_prepare_run_payload_manifest,
)
from asdl_pr_address.cli.pr_address.feedback_planning import plan_feedback
from asdl_pr_address.cli.pr_address.finalization import finalize_run
from asdl_pr_address.cli.pr_address.finalization_models import FinalizeRunInput
from asdl_pr_address.cli.pr_address.resolution_provenance_models import ResolutionProvenance

GOLDEN_ROOT = Path(__file__).resolve().parents[1] / "golden" / "v1"
FIXED_REPLY_TIMESTAMP = "2026-06-01T12:34:56Z"


def _case_names(operation: str) -> tuple[str, ...]:
    operation_dir = GOLDEN_ROOT / operation
    if not operation_dir.exists():
        return ()
    return tuple(
        sorted(
            case_dir.name
            for case_dir in operation_dir.iterdir()
            if case_dir.is_dir()
            and (case_dir / "input.json").exists()
            and (case_dir / "expected.json").exists()
        )
    )


def _load_case(operation: str, case_name: str) -> tuple[dict[str, Any], dict[str, Any]]:
    case_dir = GOLDEN_ROOT / operation / case_name
    input_payload = json.loads((case_dir / "input.json").read_text(encoding="utf-8"))
    expected = json.loads((case_dir / "expected.json").read_text(encoding="utf-8"))
    return input_payload, expected


def _assert_golden(actual: object, expected: dict[str, Any] | str) -> None:
    assert actual == expected


def _reviews(payloads: list[dict[str, Any]]) -> tuple[PRReview, ...]:
    return tuple(PRReview(**payload) for payload in payloads)


def _review_threads(payloads: list[dict[str, Any]]) -> tuple[PRReviewThread, ...]:
    threads: list[PRReviewThread] = []
    for payload in payloads:
        thread_payload = dict(payload)
        thread_payload["comments"] = tuple(
            PRReviewComment(**comment_payload)
            for comment_payload in thread_payload.get("comments", [])
        )
        threads.append(PRReviewThread(**thread_payload))
    return tuple(threads)


def _discussion_comments(payloads: list[dict[str, Any]]) -> tuple[PRDiscussionComment, ...]:
    return tuple(PRDiscussionComment(**payload) for payload in payloads)


def _model_dump_json(value: object) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")  # type: ignore[no-any-return, attr-defined]
    if is_dataclass(value):
        msg = "Golden helper expected a Clinkr/Pydantic model, not a dataclass."
        raise TypeError(msg)
    msg = f"Golden helper cannot dump object of type {type(value).__name__}."
    raise TypeError(msg)


@pytest.mark.parametrize("case_name", _case_names("validate-feedback-classification"))
def test_validate_feedback_classification_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("validate-feedback-classification", case_name)

    actual = validate_feedback_classification(
        manifest=input_payload["manifest"],
        classification=input_payload["classification"],
    ).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("plan-feedback"))
def test_plan_feedback_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("plan-feedback", case_name)

    actual = plan_feedback(
        manifest=input_payload["manifest"],
        classification=input_payload["classification"],
    ).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("build-resolve-thread-batch-payload"))
def test_build_resolve_thread_batch_payload_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("build-resolve-thread-batch-payload", case_name)
    request = BuildResolveThreadBatchPayloadInput.model_validate(input_payload)

    actual = build_resolve_thread_batch_payload(request).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("record-batch-checkpoint"))
def test_record_batch_checkpoint_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("record-batch-checkpoint", case_name)
    request = RecordBatchCheckpointInput.model_validate(input_payload)

    actual = record_batch_checkpoint(request).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("finalize-run"))
def test_finalize_run_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("finalize-run", case_name)
    request = FinalizeRunInput.model_validate(input_payload)

    actual = finalize_run(request).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("get-feedback-payload-manifest"))
def test_get_feedback_payload_manifest_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("get-feedback-payload-manifest", case_name)

    actual = build_get_feedback_payload_manifest(
        payload_reference=PayloadReference.model_validate(input_payload["payload_reference"]),
        pr_number=input_payload["pr_number"],
        reviews=_reviews(input_payload.get("reviews", [])),
        review_threads=_review_threads(input_payload.get("review_threads", [])),
        discussion_comments=_discussion_comments(input_payload.get("discussion_comments", [])),
    ).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("prepare-run-payload-manifest"))
def test_prepare_run_payload_manifest_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("prepare-run-payload-manifest", case_name)

    actual = build_prepare_run_payload_manifest(
        payload_reference=PayloadReference.model_validate(input_payload["payload_reference"]),
        found=input_payload["found"],
        current_branch=input_payload.get("current_branch"),
        number=input_payload.get("number"),
        title=input_payload.get("title"),
        url=input_payload.get("url"),
        head_ref_name=input_payload.get("head_ref_name"),
        base_ref_name=input_payload.get("base_ref_name"),
        state=input_payload.get("state"),
        reviews=_reviews(input_payload.get("reviews", [])),
        review_threads=_review_threads(input_payload.get("review_threads", [])),
        discussion_comments=_discussion_comments(input_payload.get("discussion_comments", [])),
        reopened_thread_ids=tuple(input_payload.get("reopened_thread_ids", [])),
        warnings=tuple(input_payload.get("warnings", [])),
        error=input_payload.get("error"),
        returncode=input_payload.get("returncode"),
    ).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("classification-template"))
def test_classification_template_goldens(case_name: str) -> None:
    input_payload, expected = _load_case("classification-template", case_name)

    actual = build_feedback_classification_template(
        manifest=input_payload["manifest"],
    ).model_dump(mode="json")

    _assert_golden(actual, expected)


@pytest.mark.parametrize("case_name", _case_names("reply-formatting"))
def test_reply_formatting_goldens(
    case_name: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    input_payload, expected = _load_case("reply-formatting", case_name)
    monkeypatch.setattr(reply_formatting, "_utc_timestamp", lambda: FIXED_REPLY_TIMESTAMP)

    actual = _format_reply(input_payload)

    _assert_golden(actual, expected)


def _format_reply(input_payload: dict[str, Any]) -> str:
    function_name = input_payload["function"]
    kwargs = dict(input_payload["kwargs"])
    if function_name == "resolution_reply":
        provenance_payload = kwargs.get("provenance")
        if provenance_payload is not None:
            kwargs["provenance"] = TypeAdapter(ResolutionProvenance).validate_python(
                provenance_payload
            )
        return reply_formatting.format_resolution_reply(**kwargs)
    if function_name == "review_reply":
        return reply_formatting.format_review_reply(**kwargs)
    if function_name == "discussion_reply":
        return reply_formatting.format_discussion_reply(**kwargs)
    msg = f"Unsupported reply formatting function: {function_name}"
    raise ValueError(msg)
