"""Tests for RealCheckRunsGateway.

Walks the production path with ``subprocess.run`` monkeypatched, mirroring
the pattern in ``test_real_issue_gateway.py``. Each method that lands on
``RealCheckRunsGateway`` should gain a test here so CI keeps exercising
the real REST surface even though every other test in the tree injects
``FakeCheckRunsGateway``.
"""

from __future__ import annotations

import json
import subprocess
from typing import Any

import pytest

from twerk_core.gh import real_check_runs_gateway
from twerk_core.gh.real_check_runs_gateway import RealCheckRunsGateway
from twerk_core.gh.types import CheckRunAnnotation, CheckRunOutput

_OWNER_REPO_OUTPUT = json.dumps({"owner": {"login": "dagster-io"}, "name": "twerk"})


def _annotation(start_line: int, *, message: str = "m") -> CheckRunAnnotation:
    return CheckRunAnnotation(
        path="src/foo.py",
        start_line=start_line,
        end_line=start_line,
        annotation_level="warning",
        message=message,
    )


def _check_run_response(*, run_id: int = 999, name: str = "twerk-reviewer/r") -> str:
    return json.dumps(
        {
            "id": run_id,
            "name": name,
            "head_sha": "abc123",
            "status": "completed",
            "conclusion": "neutral",
            "html_url": f"https://github.com/dagster-io/twerk/runs/{run_id}",
        }
    )


def _list_runs_response(
    runs: list[dict[str, Any]] | None = None,
) -> str:
    return json.dumps({"total_count": len(runs or []), "check_runs": runs or []})


def _make_fake_run(
    *,
    existing_runs: list[dict[str, Any]] | None = None,
    created_response: str | None = None,
    patched_response: str | None = None,
    annotations_pages: list[list[dict[str, Any]]] | None = None,
    calls: list[dict[str, Any]] | None = None,
):
    """Build a fake ``subprocess.run`` that dispatches on command shape.

    ``calls`` collects each invocation so tests can assert on ordering,
    method, path, and the parsed JSON body.
    """
    list_runs_payload = _list_runs_response(existing_runs)
    created_payload = created_response or _check_run_response()
    patched_payload = patched_response or _check_run_response()
    annotations_payload = "".join(json.dumps(page) for page in (annotations_pages or []))

    def fake_run(
        cmd: list[str],
        **kwargs: Any,
    ) -> subprocess.CompletedProcess[str]:
        if calls is not None:
            # Record the full call shape so tests can inspect the POST/PATCH body.
            body = None
            stdin = kwargs.get("input")
            if stdin:
                body = json.loads(stdin)
            calls.append({"cmd": list(cmd), "body": body})
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=_OWNER_REPO_OUTPUT, stderr="")
        # List-runs for find_check_run:
        # `gh api repos/.../commits/<sha>/check-runs --paginate`
        if cmd[:2] == ["gh", "api"] and "/commits/" in cmd[2] and cmd[2].endswith("/check-runs"):
            return subprocess.CompletedProcess(cmd, 0, stdout=list_runs_payload, stderr="")
        # List annotations for list_annotations:
        # `gh api repos/.../check-runs/<id>/annotations --paginate`
        if cmd[:2] == ["gh", "api"] and cmd[2].endswith("/annotations"):
            return subprocess.CompletedProcess(cmd, 0, stdout=annotations_payload, stderr="")
        # Create/patch:
        # `gh api --method POST repos/.../check-runs --input -`
        # `gh api --method PATCH repos/.../check-runs/<id> --input -`
        if cmd[:4] == ["gh", "api", "--method", "POST"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=created_payload, stderr="")
        if cmd[:4] == ["gh", "api", "--method", "PATCH"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=patched_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    return fake_run


def test_find_check_run_returns_match(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = {
        "id": 42,
        "name": "twerk-reviewer/r",
        "head_sha": "abc123",
        "status": "completed",
        "conclusion": "neutral",
        "html_url": "https://example.com/42",
    }
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(existing_runs=[existing]),
    )

    result = RealCheckRunsGateway().find_check_run("abc123", "twerk-reviewer/r")

    assert result is not None
    assert result.id == 42
    assert result.html_url == "https://example.com/42"


def test_find_check_run_returns_none_when_no_match(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(existing_runs=[]),
    )
    assert RealCheckRunsGateway().find_check_run("abc", "twerk-reviewer/r") is None


def test_find_check_run_filters_by_name(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = [
        {
            "id": 1,
            "name": "twerk-reviewer/a",
            "head_sha": "abc",
            "status": "completed",
            "conclusion": "neutral",
            "html_url": "https://example.com/1",
        },
        {
            "id": 2,
            "name": "twerk-reviewer/b",
            "head_sha": "abc",
            "status": "completed",
            "conclusion": "neutral",
            "html_url": "https://example.com/2",
        },
    ]
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(existing_runs=existing),
    )
    result = RealCheckRunsGateway().find_check_run("abc", "twerk-reviewer/b")
    assert result is not None
    assert result.id == 2


def test_upsert_creates_new_check_run_when_none_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(existing_runs=[], calls=calls),
    )

    result = RealCheckRunsGateway().upsert_check_run(
        head_sha="abc123",
        name="twerk-reviewer/r",
        output=CheckRunOutput(title="Reviewer", summary="done"),
        annotations=[_annotation(1, message="one")],
    )

    assert result.id == 999

    # Expected command sequence: repo view (owner/repo) → list check-runs
    # (find_check_run preflight) → POST (create).
    methods = [
        ("POST" if "--method" in c["cmd"] and c["cmd"][3] == "POST" else None) for c in calls
    ]
    assert "POST" in methods
    create_call = next(c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "POST")
    assert create_call["body"]["head_sha"] == "abc123"
    assert create_call["body"]["name"] == "twerk-reviewer/r"
    assert create_call["body"]["status"] == "completed"
    assert create_call["body"]["conclusion"] == "neutral"
    assert len(create_call["body"]["output"]["annotations"]) == 1
    assert create_call["body"]["output"]["annotations"][0]["message"] == "one"


def test_upsert_patches_existing_check_run_with_same_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = {
        "id": 42,
        "name": "twerk-reviewer/r",
        "head_sha": "abc123",
        "status": "completed",
        "conclusion": "neutral",
        "html_url": "https://example.com/42",
    }
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(
            existing_runs=[existing],
            patched_response=_check_run_response(run_id=42),
            calls=calls,
        ),
    )

    result = RealCheckRunsGateway().upsert_check_run(
        head_sha="abc123",
        name="twerk-reviewer/r",
        output=CheckRunOutput(title="Reviewer", summary="done"),
        annotations=[_annotation(1)],
    )

    # PATCH on the existing id, not POST creating a new one.
    assert result.id == 42
    patch_calls = [c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "PATCH"]
    post_calls = [c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "POST"]
    assert len(patch_calls) == 1
    assert post_calls == []
    # PATCH path targets the specific check run id.
    assert patch_calls[0]["cmd"][4].endswith("/check-runs/42")


def test_upsert_chunks_annotations_over_50(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """120 annotations → initial POST (50) + two follow-up PATCH (50, 20)."""
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(
            existing_runs=[],
            created_response=_check_run_response(run_id=999),
            patched_response=_check_run_response(run_id=999),
            calls=calls,
        ),
    )

    RealCheckRunsGateway().upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=CheckRunOutput(title="t", summary="s"),
        annotations=[_annotation(i + 1) for i in range(120)],
    )

    post_calls = [c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "POST"]
    patch_calls = [c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "PATCH"]
    assert len(post_calls) == 1
    assert len(post_calls[0]["body"]["output"]["annotations"]) == 50
    assert len(patch_calls) == 2
    batch_sizes = [len(c["body"]["output"]["annotations"]) for c in patch_calls]
    assert batch_sizes == [50, 20]
    # Every PATCH targets the same check-run id the POST returned.
    for c in patch_calls:
        assert c["cmd"][4].endswith("/check-runs/999")


def test_upsert_propagates_output_text_to_initial_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(existing_runs=[], calls=calls),
    )

    RealCheckRunsGateway().upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=CheckRunOutput(
            title="t",
            summary="s",
            text="file-level findings appear here",
        ),
        annotations=[],
    )

    post_call = next(c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "POST")
    assert post_call["body"]["output"]["text"] == "file-level findings appear here"


def test_list_annotations_returns_empty_when_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(annotations_pages=[[]]),
    )
    result = RealCheckRunsGateway().list_annotations(42)
    assert result == ()


def test_list_annotations_parses_multiple_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    page_one = [
        {
            "path": "a.py",
            "start_line": 1,
            "end_line": 1,
            "annotation_level": "warning",
            "message": "one",
        }
    ]
    page_two = [
        {
            "path": "b.py",
            "start_line": 2,
            "end_line": 3,
            "annotation_level": "failure",
            "message": "two",
            "title": "bang",
            "raw_details": "deep dive",
        }
    ]
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(annotations_pages=[page_one, page_two]),
    )

    result = RealCheckRunsGateway().list_annotations(42)
    assert tuple(a.message for a in result) == ("one", "two")
    assert result[1].title == "bang"
    assert result[1].raw_details == "deep dive"


def test_annotation_title_and_raw_details_round_trip_to_api_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        real_check_runs_gateway.subprocess,
        "run",
        _make_fake_run(existing_runs=[], calls=calls),
    )

    RealCheckRunsGateway().upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=CheckRunOutput(title="t", summary="s"),
        annotations=[
            CheckRunAnnotation(
                path="a.py",
                start_line=1,
                end_line=2,
                annotation_level="notice",
                message="m",
                title="heads-up",
                raw_details="more context",
            )
        ],
    )

    post_call = next(c for c in calls if "--method" in c["cmd"] and c["cmd"][3] == "POST")
    annotation_body = post_call["body"]["output"]["annotations"][0]
    assert annotation_body["title"] == "heads-up"
    assert annotation_body["raw_details"] == "more context"
    assert annotation_body["annotation_level"] == "notice"
