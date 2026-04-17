from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_reviewer import git_toplevel as git_toplevel_module
from twerk_reviewer.gateways.harness_config.fake import FakeHarnessConfigGateway
from twerk_reviewer.gateways.harness_config.gateway import ReviewerConfig
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
    "# Dignified Python\n\n"
    "## Description\n\n"
    "Review Python diffs.\n\n"
    "## Instructions\n\n"
    "Flag concrete issues.\n\n"
    "## Default Model\n\n"
    "sonnet\n"
)


@pytest.fixture(autouse=True)
def _fake_git_toplevel(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{REPO_ROOT}\n", stderr="")
        raise AssertionError(f"unexpected git command: {cmd!r}")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)


@pytest.fixture
def harness_config() -> FakeHarnessConfigGateway:
    gateway = FakeHarnessConfigGateway()
    gateway.save(REPO_ROOT, ReviewerConfig(harness_name="claude-code"))
    return gateway


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


def test_runs_end_to_end_using_config_harness(
    harness_config: FakeHarnessConfigGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_config_gateway=harness_config,
    )

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == "Dignified Python"
    assert result.model == "sonnet"
    assert result.base_ref == "master"
    assert review_execution.executed_requests[0].adapter_name == "claude-code"


def test_explicit_harness_flag_wins_over_config(
    harness_config: FakeHarnessConfigGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    _run(
        requested_harness="claude-code",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_config_gateway=harness_config,
    )

    assert review_execution.executed_requests[0].adapter_name == "claude-code"


def test_env_var_overrides_config(
    harness_config: FakeHarnessConfigGateway,
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
        harness_config_gateway=FakeHarnessConfigGateway(),  # no persisted config
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
        harness_config_gateway=FakeHarnessConfigGateway(),
    )

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_unknown"


def test_missing_config_surfaces_init_hint(
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_config_gateway=FakeHarnessConfigGateway(),
    )

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_not_configured"
    assert "reviewer harness init" in result.message


def test_unknown_key_returns_failure_before_execution(
    harness_config: FakeHarnessConfigGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    result = _run(
        key="nope",
        review_definition_gateway=FakeReviewDefinitionGateway(),
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_config_gateway=harness_config,
    )

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "review_definition_not_found"
    assert review_execution.executed_requests == ()


def test_model_flag_overrides_default_model(
    harness_config: FakeHarnessConfigGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    _run(
        requested_model="opus",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_config_gateway=harness_config,
    )

    assert review_execution.executed_requests[0].model == "opus"


def test_format_is_threaded_onto_execution_request(
    harness_config: FakeHarnessConfigGateway,
    review_definition: FakeReviewDefinitionGateway,
    local_diff: FakeLocalDiffGateway,
    review_execution: FakeReviewExecutionGateway,
) -> None:
    _run(
        requested_format="text",
        review_definition_gateway=review_definition,
        local_diff_gateway=local_diff,
        review_execution_gateway=review_execution,
        harness_config_gateway=harness_config,
    )

    executed = review_execution.executed_requests[0]
    assert executed.review_format == "text"
    assert "markdown review" in executed.system_prompt.lower()
    assert "JSON" not in executed.prompt
