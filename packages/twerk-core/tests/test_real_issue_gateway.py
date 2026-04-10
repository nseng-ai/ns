"""Tests for RealIssueGateway.

Walks the production fallback path with `subprocess.run` monkeypatched out,
mirroring the shape of
`packages/twerk-objectives/tests/test_objective_cli.py::test_objective_list_falls_back_to_real_gateway`.
Each push-down method that lands on `RealIssueGateway` should gain a test in
this file so CI keeps exercising the real code path even though every other
test in the tree injects `FakeIssueGateway` via Click context.
"""

from __future__ import annotations

import json
import subprocess

import pytest

from twerk_core.gh import real_issue_gateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway

_OWNER_REPO_OUTPUT = json.dumps({"owner": {"login": "dagster-io"}, "name": "twerk"})


def _make_thread(
    *,
    thread_id: str | None,
    is_resolved: bool,
    is_outdated: bool = False,
    path: str = "src/foo.py",
    line: int | None = 42,
    comments: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "id": thread_id,
        "isResolved": is_resolved,
        "isOutdated": is_outdated,
        "path": path,
        "line": line,
        "comments": {
            "nodes": comments
            if comments is not None
            else [
                {
                    "databaseId": 1001,
                    "body": "looks off",
                    "author": {"login": "reviewer"},
                    "path": path,
                    "line": line,
                    "createdAt": "2026-04-10T12:00:00Z",
                }
            ]
        },
    }


def _make_fake_run(
    threads: list[dict[str, object]],
) -> object:
    """Build a fake `subprocess.run` that dispatches on the command shape.

    Returns owner/repo JSON for `gh repo view ...` and a GraphQL payload for
    `gh api graphql ...`. Raises if the test harness sends any other command.
    """
    graphql_payload = json.dumps(
        {
            "data": {
                "repository": {
                    "pullRequest": {
                        "reviewThreads": {"nodes": threads},
                    }
                }
            }
        }
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=_OWNER_REPO_OUTPUT, stderr="")
        if cmd[:3] == ["gh", "api", "graphql"]:
            # Sanity-check that the owner/repo/number variables are present.
            assert "-F" in cmd
            joined = " ".join(cmd)
            assert "owner=dagster-io" in joined
            assert "repo=twerk" in joined
            assert "number=47" in joined
            return subprocess.CompletedProcess(cmd, 0, stdout=graphql_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    return fake_run


def test_get_review_threads_default_filters_out_resolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    threads = [
        _make_thread(thread_id="PRRT_open", is_resolved=False),
        _make_thread(thread_id="PRRT_closed", is_resolved=True),
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads))

    result = RealIssueGateway().get_review_threads(47)

    assert tuple(t.id for t in result) == ("PRRT_open",)
    assert result[0].is_resolved is False
    assert result[0].path == "src/foo.py"
    assert result[0].line == 42
    assert len(result[0].comments) == 1
    assert result[0].comments[0].id == 1001
    assert result[0].comments[0].author == "reviewer"


def test_get_review_threads_include_resolved_returns_everything(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    threads = [
        _make_thread(thread_id="PRRT_open", is_resolved=False),
        _make_thread(thread_id="PRRT_closed", is_resolved=True),
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads))

    result = RealIssueGateway().get_review_threads(47, include_resolved=True)

    assert tuple(t.id for t in result) == ("PRRT_open", "PRRT_closed")
    assert result[1].is_resolved is True


def test_get_review_threads_drops_null_id_threads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GraphQL sometimes returns null-id threads for deleted files."""
    threads = [
        _make_thread(thread_id=None, is_resolved=False),
        _make_thread(thread_id="PRRT_valid", is_resolved=False),
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads))

    result = RealIssueGateway().get_review_threads(47)

    assert tuple(t.id for t in result) == ("PRRT_valid",)


def test_get_review_threads_handles_deleted_author(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`author` can be null when a reviewer's GitHub account is deleted."""
    threads = [
        _make_thread(
            thread_id="PRRT_ghost",
            is_resolved=False,
            comments=[
                {
                    "databaseId": 2002,
                    "body": "ghost comment",
                    "author": None,
                    "path": "src/foo.py",
                    "line": 1,
                    "createdAt": "2026-04-10T12:00:00Z",
                }
            ],
        ),
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads))

    result = RealIssueGateway().get_review_threads(47)

    assert len(result) == 1
    assert result[0].comments[0].author == ""
