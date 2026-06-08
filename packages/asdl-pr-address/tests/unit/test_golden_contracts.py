"""Golden contract tests for deterministic pr-address data shapes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from asdl_pr_address.cli.pr_address.feedback_classification import (
    validate_feedback_classification,
)
from asdl_pr_address.cli.pr_address.feedback_planning import plan_feedback

GOLDEN_ROOT = Path(__file__).resolve().parents[1] / "golden" / "v1"


def _load_case(*parts: str) -> tuple[dict[str, Any], dict[str, Any]]:
    case_dir = GOLDEN_ROOT.joinpath(*parts)
    input_payload = json.loads((case_dir / "input.json").read_text(encoding="utf-8"))
    expected = json.loads((case_dir / "expected.json").read_text(encoding="utf-8"))
    return input_payload, expected


def test_validate_feedback_classification_missing_required_thread_golden() -> None:
    input_payload, expected = _load_case(
        "validate-feedback-classification",
        "missing-required-thread",
    )

    actual = validate_feedback_classification(
        manifest=input_payload["manifest"],
        classification=input_payload["classification"],
    ).model_dump(mode="json")

    assert actual == expected


def test_plan_feedback_single_file_thread_plus_informational_golden() -> None:
    input_payload, expected = _load_case(
        "plan-feedback",
        "single-file-thread-plus-informational",
    )

    actual = plan_feedback(
        manifest=input_payload["manifest"],
        classification=input_payload["classification"],
    ).model_dump(mode="json")

    assert actual == expected
