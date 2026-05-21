from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_reviewer.gateways.review_environment import real as review_environment_real
from asdl_reviewer.gateways.review_environment.real import RealReviewEnvironmentGateway
from asdl_reviewer.harness import invocation as harness_invocation
from asdl_reviewer.harness.invocation import HarnessReviewRequest
from asdl_reviewer.models import (
    FindingsReview,
    LocalDiff,
    ReviewDefinition,
    ReviewExecutionResponse,
    ReviewSource,
)


def _sample_request() -> HarnessReviewRequest:
    return HarnessReviewRequest(
        harness_name="claude-code",
        model="sonnet",
        review_definition=ReviewDefinition(
            name="Dignified Python",
            description="Review Python diffs for style violations.",
            instructions="Flag concrete issues in the diff.",
            default_model="sonnet",
        ),
        local_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        ),
        review_format="findings",
    )


def test_real_review_environment_loads_review_source(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews_dir = tmp_path / "reviews"
    path = reviews_dir / "dignified-python.md"
    path.parent.mkdir(parents=True)
    path.write_text("# Dignified Python", encoding="utf-8")

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return tmp_path

    monkeypatch.setattr(review_environment_real, "git_toplevel", fake_git_toplevel)

    result = RealReviewEnvironmentGateway(cwd=tmp_path).load_review_source(key="dignified-python")

    assert isinstance(result, ReviewSource)
    assert result.key == "dignified-python"
    assert result.path == path
    assert result.source == "# Dignified Python"


def test_real_review_environment_load_diff_runs_git_diff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cwd = Path("/repo")

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return cwd

    def fake_run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
        assert cwd == Path("/repo")
        if cmd[:3] == ["git", "diff", "--no-ext-diff"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="diff --git a/app.py b/app.py\n+print('hello')\n",
                stderr="",
            )
        raise AssertionError(f"unexpected command: {cmd!r}")

    monkeypatch.setattr(review_environment_real, "git_toplevel", fake_git_toplevel)
    monkeypatch.setattr(review_environment_real, "run_git", fake_run_git)

    result = RealReviewEnvironmentGateway(cwd=cwd).load_diff(base_ref="master")

    assert isinstance(result, LocalDiff)
    assert result.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in result.diff_text


def test_real_review_environment_list_harnesses_reports_available_binary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def fake_which(binary: str) -> str | None:
        calls.append(binary)
        return "/usr/local/bin/claude"

    monkeypatch.setattr(harness_invocation.shutil, "which", fake_which)

    detections = RealReviewEnvironmentGateway(cwd=Path("/repo")).list_harnesses()

    assert len(detections) == 1
    detection = detections[0]
    assert detection.name == "claude-code"
    assert detection.binary == "claude"
    assert detection.path == "/usr/local/bin/claude"
    assert detection.available is True
    assert calls == ["claude"]


def test_real_review_environment_list_harnesses_reports_absent_binary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(harness_invocation.shutil, "which", lambda _binary: None)

    detections = RealReviewEnvironmentGateway(cwd=Path("/repo")).list_harnesses()

    assert len(detections) == 1
    detection = detections[0]
    assert detection.name == "claude-code"
    assert detection.binary == "claude"
    assert detection.path is None
    assert detection.available is False


def test_real_review_environment_run_review_delegates_to_harness_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeHarnessRuntime:
        def __init__(self, *, progress_writer: object) -> None:
            self.progress_writer = progress_writer
            self.requests: list[HarnessReviewRequest] = []
            created_runtimes.append(self)

        def list_harnesses(self) -> tuple[object, ...]:
            return ()

        def run_review(
            self,
            request: HarnessReviewRequest,
        ) -> ReviewExecutionResponse:
            self.requests.append(request)
            return ReviewExecutionResponse(payload=FindingsReview(findings=()))

    created_runtimes: list[_FakeHarnessRuntime] = []
    monkeypatch.setattr(review_environment_real, "HarnessRuntime", _FakeHarnessRuntime)

    request = _sample_request()
    gateway = RealReviewEnvironmentGateway(cwd=Path("/repo"))
    result = gateway.run_review(request)

    assert isinstance(result, ReviewExecutionResponse)
    assert len(created_runtimes) == 1
    assert created_runtimes[0].requests == [request]
