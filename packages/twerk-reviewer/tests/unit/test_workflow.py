from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_core.clinkr.non_ideal_state import error_type_for
from twerk_reviewer import git_toplevel as git_toplevel_module
from twerk_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway
from twerk_reviewer.models import (
    FindingsReview,
    LocalDiff,
    LocalReviewResult,
    ReviewerFailure,
    ReviewExecutionResponse,
)
from twerk_reviewer.workflow import ENV_HARNESS, run_review_by_key

REPO_ROOT = Path("/repo")
REVIEWS_DIR = REPO_ROOT / "reviews"
REVIEW_PATH = REVIEWS_DIR / "dignified-python.md"
SAMPLE_SOURCE = (
    "---\ndescription: Review Python diffs.\ndefault_model: sonnet\n---\n\nFlag concrete issues.\n"
)


@pytest.fixture(autouse=True)
def _fake_git_toplevel(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{REPO_ROOT}\n", stderr="")
        raise AssertionError(f"unexpected git command: {cmd!r}")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)


@pytest.fixture
def harness_detection() -> FakeHarnessDetectionGateway:
    return FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})


@pytest.fixture
def review_definition() -> FakeReviewDefinitionGateway:
    return FakeReviewDefinitionGateway(
        sources_by_path={REVIEW_PATH: SAMPLE_SOURCE},
    )


@pytest.fixture
def local_diff() -> FakeLocalDiffGateway:
    return FakeLocalDiffGateway(
        default_result=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        )
    )


@pytest.fixture
def review_execution() -> FakeReviewExecutionGateway:
    return FakeReviewExecutionGateway(
        default_response=ReviewExecutionResponse(payload=FindingsReview(findings=())),
    )


def _run(
    **overrides: object,
) -> LocalReviewResult | ReviewerFailure:
    defaults: dict[str, object] = {
        "key": "dignified-python",
        "requested_model": None,
        "requested_base_ref": None,
        "requested_harness": None,
        "requested_format": "findings",
        "cwd": Path("/anywhere"),
    }
    defaults.update(overrides)
    return run_review_by_key(**defaults)  # type: ignore[arg-type]


def test_runs_end_to_end_auto_selecting_single_detected_harness(
    harness_detection: FakeHarnessDetectionGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=harness_detection,
    )

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == "dignified-python"
    assert result.model == "sonnet"
    assert result.base_ref == "master"
    assert review_execution.executed_requests[0].adapter_name == "claude-code"


def test_nested_key_preserves_subpath_in_review_name(
    harness_detection: FakeHarnessDetectionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    nested_path = REVIEWS_DIR / "python" / "typing.md"
    review_definition = FakeReviewDefinitionGateway(
        sources_by_path={nested_path: SAMPLE_SOURCE},
    )

    result = _run(
        key="python/typing",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=harness_detection,
    )

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == "python/typing"
    assert review_execution.executed_requests[0].review_name == "python/typing"


def test_explicit_harness_flag_wins(
    harness_detection: FakeHarnessDetectionGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    _run(
        requested_harness="claude-code",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=harness_detection,
    )

    assert review_execution.executed_requests[0].adapter_name == "claude-code"


def test_env_var_overrides_auto_detection(
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(ENV_HARNESS, "claude-code")

    _run(
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=FakeHarnessDetectionGateway(),  # no harness detected
    )

    assert review_execution.executed_requests[0].adapter_name == "claude-code"


def test_unknown_harness_is_rejected(
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        requested_harness="banana",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=FakeHarnessDetectionGateway(),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_unknown"


def test_no_harness_detected_surfaces_install_hint(
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=FakeHarnessDetectionGateway(),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_not_configured"
    assert "No harness detected" in result.message


def test_unknown_key_returns_failure_before_execution(
    harness_detection: FakeHarnessDetectionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        key="nope",
        review_definition_gateway=FakeReviewDefinitionGateway(),
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=harness_detection,
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_definition_not_found"
    assert review_execution.executed_requests == ()


def test_model_flag_overrides_default_model(
    harness_detection: FakeHarnessDetectionGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    _run(
        requested_model="opus",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=harness_detection,
    )

    assert review_execution.executed_requests[0].model == "opus"


def test_format_is_threaded_onto_execution_request(
    harness_detection: FakeHarnessDetectionGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    _run(
        requested_format="text",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_detection_gateway=harness_detection,
    )

    executed = review_execution.executed_requests[0]
    assert executed.review_format == "text"
    assert "markdown review" in executed.system_prompt.lower()
    assert "JSON" not in executed.prompt
