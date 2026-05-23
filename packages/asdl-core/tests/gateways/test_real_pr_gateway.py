"""Tests for RealPRGateway and shared gh helper behavior."""

from __future__ import annotations

import json
import subprocess
from typing import Any

import pytest

from asdl_core.gh import real_gateway_helpers
from asdl_core.gh.pr_gateway import RealPRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRInlineCommentInput,
    PRLookupMiss,
    PRMergeOutcome,
    PRReview,
    PRReviewThreadState,
)

_OWNER_REPO_OUTPUT = json.dumps({"owner": {"login": "dagster-io"}, "name": "asdl"})
_PR_SUMMARY_FIELDS = "number,title,body,url,headRefName,headRefOid,baseRefName,state"


def _summary_response(*, state: str = "OPEN", head_ref_oid: str = "abc123") -> dict[str, object]:
    return {
        "number": 47,
        "title": "Port pr-address skill",
        "url": "https://github.com/dagster-io/asdl/pull/47",
        "body": "PR body text",
        "headRefName": "feature",
        "headRefOid": head_ref_oid,
        "baseRefName": "master",
        "state": state,
    }


def _make_thread(
    *,
    thread_id: str | None,
    is_resolved: bool,
    path: str = "src/foo.py",
    line: int | None = 42,
    start_line: int | None = None,
    author: dict[str, str] | None = None,
) -> dict[str, object]:
    return {
        "id": thread_id,
        "isResolved": is_resolved,
        "isOutdated": False,
        "path": path,
        "line": line,
        "startLine": start_line,
        "comments": {
            "nodes": [
                {
                    "databaseId": 1001,
                    "body": "looks off",
                    "author": author,
                    "path": path,
                    "line": line,
                    "startLine": start_line,
                    "createdAt": "2026-04-10T12:00:00Z",
                }
            ]
        },
    }


def _make_fake_run(
    *,
    pr_view_response: dict[str, object] | None = None,
    pr_view_returncode: int = 0,
    pr_view_stderr: str = "",
    pr_list_response: list[dict[str, object]] | None = None,
    pr_list_returncode: int = 0,
    pr_list_stderr: str = "",
    threads: list[dict[str, object]] | None = None,
    discussion_comment_pages: list[list[dict[str, object]]] | None = None,
    changed_file_pages: list[list[dict[str, object]]] | None = None,
    review_comment_pages: list[list[dict[str, object]]] | None = None,
    reviews: list[dict[str, object]] | None = None,
    create_review_response: dict[str, object] | None = None,
    resolve_response: dict[str, object] | None = None,
    unresolve_response: dict[str, object] | None = None,
    reply_response: dict[str, object] | None = None,
    add_comment_response: dict[str, object] | None = None,
    update_comment_response: dict[str, object] | None = None,
    add_reaction_response: dict[str, object] | None = None,
    merge_returncode: int = 0,
    merge_stdout: str = "",
    merge_stderr: str = "",
    calls: list[list[str]] | None = None,
    inputs: list[str | None] | None = None,
) -> object:
    pr_view_payload = json.dumps(pr_view_response) if pr_view_response is not None else ""
    pr_list_payload = json.dumps(pr_list_response or [])
    review_threads_payload = json.dumps(
        {"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": threads or []}}}}}
    )
    discussion_comments_payload = "".join(
        json.dumps(page) for page in (discussion_comment_pages or [])
    )
    changed_files_payload = "".join(json.dumps(page) for page in (changed_file_pages or []))
    review_comments_payload = "".join(json.dumps(page) for page in (review_comment_pages or []))
    reviews_payload = json.dumps(reviews or [])
    create_review_payload = json.dumps(create_review_response or {})
    resolve_payload = json.dumps({"data": {"resolveReviewThread": resolve_response or {}}})
    unresolve_payload = json.dumps({"data": {"unresolveReviewThread": unresolve_response or {}}})
    reply_payload = json.dumps({"data": {"addPullRequestReviewThreadReply": reply_response or {}}})
    add_comment_payload = json.dumps(add_comment_response or {})
    update_comment_payload = json.dumps(update_comment_response or {})
    add_reaction_payload = json.dumps(add_reaction_response or {})

    def fake_run(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        if calls is not None:
            calls.append(list(cmd))
        if inputs is not None:
            inputs.append(kwargs.get("input"))
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=_OWNER_REPO_OUTPUT, stderr="")
        if cmd[:3] == ["gh", "pr", "view"]:
            return subprocess.CompletedProcess(
                cmd,
                pr_view_returncode,
                stdout=pr_view_payload,
                stderr=pr_view_stderr,
            )
        if cmd[:3] == ["gh", "pr", "list"]:
            return subprocess.CompletedProcess(
                cmd,
                pr_list_returncode,
                stdout=pr_list_payload,
                stderr=pr_list_stderr,
            )
        if cmd[:3] == ["gh", "pr", "merge"]:
            return subprocess.CompletedProcess(
                cmd,
                merge_returncode,
                stdout=merge_stdout,
                stderr=merge_stderr,
            )
        if cmd[:3] == ["gh", "api", "graphql"]:
            joined = " ".join(cmd)
            if "unresolveReviewThread" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=unresolve_payload, stderr="")
            if "resolveReviewThread" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=resolve_payload, stderr="")
            if "addPullRequestReviewThreadReply" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=reply_payload, stderr="")
            assert "owner=dagster-io" in joined
            assert "repo=asdl" in joined
            assert "number=47" in joined
            return subprocess.CompletedProcess(cmd, 0, stdout=review_threads_payload, stderr="")
        if cmd[:2] == ["gh", "api"] and cmd[2].endswith("/reviews"):
            assert "--paginate" in cmd
            return subprocess.CompletedProcess(cmd, 0, stdout=reviews_payload, stderr="")
        if cmd[:2] == ["gh", "api"] and cmd[2].endswith("/files"):
            assert "--paginate" in cmd
            return subprocess.CompletedProcess(cmd, 0, stdout=changed_files_payload, stderr="")
        if cmd[:2] == ["gh", "api"] and cmd[2] == "repos/dagster-io/asdl/pulls/47/comments":
            assert "--paginate" in cmd
            return subprocess.CompletedProcess(cmd, 0, stdout=review_comments_payload, stderr="")
        if cmd[:2] == ["gh", "api"] and cmd[2] == "repos/dagster-io/asdl/issues/47/comments":
            assert "--paginate" in cmd
            return subprocess.CompletedProcess(
                cmd, 0, stdout=discussion_comments_payload, stderr=""
            )
        if cmd[:4] == ["gh", "api", "--method", "POST"]:
            path = cmd[4]
            if path.endswith("/reactions"):
                return subprocess.CompletedProcess(cmd, 0, stdout=add_reaction_payload, stderr="")
            if path.endswith("/reviews"):
                return subprocess.CompletedProcess(cmd, 0, stdout=create_review_payload, stderr="")
            if path.startswith("repos/") and path.endswith("/comments"):
                return subprocess.CompletedProcess(cmd, 0, stdout=add_comment_payload, stderr="")
        if cmd[:4] == ["gh", "api", "--method", "PATCH"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=update_comment_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    return fake_run


@pytest.mark.parametrize("state", ["OPEN", "MERGED", "CLOSED"])
def test_real_pr_gateway_returns_summary_with_head_ref_oid(
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(pr_view_response=_summary_response(state=state), calls=calls),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupMiss)
    assert not isinstance(result, PRGatewayFailure)
    assert result.number == 47
    assert result.state == state
    assert result.body == "PR body text"
    assert result.head_ref_oid == "abc123"
    assert calls == [
        ["gh", "pr", "view", "feature", "--json", _PR_SUMMARY_FIELDS],
    ]


def test_real_pr_gateway_search_prs_requests_and_populates_head_ref_oid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(pr_list_response=[_summary_response(state="MERGED")], calls=calls),
    )

    result = RealPRGateway().search_prs("Port", state="merged")

    assert not isinstance(result, PRGatewayFailure)
    assert len(result) == 1
    assert result[0].head_ref_oid == "abc123"
    assert calls == [
        [
            "gh",
            "pr",
            "list",
            "--state",
            "merged",
            "--search",
            "Port",
            "--json",
            _PR_SUMMARY_FIELDS,
        ]
    ]


def test_real_pr_gateway_targets_explicit_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(pr_view_response=_summary_response(), calls=calls),
    )

    result = RealPRGateway(repo="octo/demo").get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupMiss)
    assert calls == [
        [
            "gh",
            "pr",
            "view",
            "feature",
            "--json",
            _PR_SUMMARY_FIELDS,
            "-R",
            "octo/demo",
        ]
    ]


def test_real_pr_gateway_returns_lookup_miss_when_no_pr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            pr_view_returncode=1,
            pr_view_stderr="no pull requests found for branch 'feature'\n",
        ),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert isinstance(result, PRLookupMiss)
    assert result.returncode == 1
    assert "no pull requests found" in result.stderr


def test_real_pr_gateway_returns_gateway_failure_for_lookup_command_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(pr_view_returncode=4, pr_view_stderr="gh auth failed\n"),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert isinstance(result, PRGatewayFailure)
    assert result.returncode == 4
    assert result.stderr == "gh auth failed"


def test_real_pr_gateway_review_thread_query_parses_multiline_and_deleted_author(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    threads = [
        _make_thread(
            thread_id="PRRT_multi",
            is_resolved=False,
            line=32,
            start_line=27,
            author=None,
        )
    ]
    monkeypatch.setattr(real_gateway_helpers.subprocess, "run", _make_fake_run(threads=threads))

    result = RealPRGateway().get_review_threads(47)

    assert len(result) == 1
    assert result[0].id == "PRRT_multi"
    assert result[0].line == 32
    assert result[0].start_line == 27
    assert result[0].comments[0].author == ""
    assert result[0].comments[0].start_line == 27


def test_real_pr_gateway_discussion_comments_parse_pr_domain_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            discussion_comment_pages=[
                [
                    {
                        "id": 101,
                        "body": "First comment",
                        "user": {"login": "alice"},
                        "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-101",
                    },
                    {
                        "id": 202,
                        "body": "Ghost comment",
                        "user": None,
                        "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-202",
                    },
                ]
            ]
        ),
    )

    result = RealPRGateway().get_pr_discussion_comments(47)

    assert tuple(comment.id for comment in result) == (101, 202)
    assert isinstance(result[0], PRDiscussionComment)
    assert result[0].author == "alice"
    assert result[1].author == ""


def test_real_pr_gateway_changed_files_reviews_and_review_comments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            changed_file_pages=[[{"filename": "app.py", "status": "modified", "patch": "@@"}]],
            review_comment_pages=[
                [
                    {
                        "id": 301,
                        "body": "inline",
                        "user": {"login": "reviewer"},
                        "path": "app.py",
                        "line": 7,
                        "start_line": None,
                        "created_at": "2026-05-23T00:00:00Z",
                    }
                ]
            ],
            reviews=[
                {
                    "node_id": "PRR_1",
                    "user": {"login": "reviewer"},
                    "body": "approved",
                    "state": "APPROVED",
                    "submitted_at": "2026-05-23T00:00:00Z",
                },
                {
                    "node_id": "PRR_pending",
                    "user": {"login": "reviewer"},
                    "body": "pending",
                    "state": "PENDING",
                    "submitted_at": "2026-05-23T00:00:00Z",
                },
            ],
        ),
    )

    changed_files = RealPRGateway().get_pr_changed_files(47)
    review_comments = RealPRGateway().get_pr_review_comments(47)
    reviews = RealPRGateway().get_reviews(47)

    assert changed_files[0].path == "app.py"
    assert review_comments[0].author == "reviewer"
    assert tuple(review.id for review in reviews) == ("PRR_1",)


def test_real_pr_gateway_create_review_posts_json_and_returns_pr_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    inputs: list[str | None] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            create_review_response={
                "node_id": "PRR_abc",
                "user": {"login": "github-actions[bot]"},
                "state": "COMMENTED",
                "body": "",
                "submitted_at": "2026-04-30T00:00:00Z",
            },
            calls=calls,
            inputs=inputs,
        ),
    )

    result = RealPRGateway().create_pr_review(
        47,
        (
            PRInlineCommentInput(path="app.py", line=7, body="first"),
            PRInlineCommentInput(path="other.py", line=9, body="second"),
        ),
    )

    assert result == PRReview(
        id="PRR_abc",
        author="github-actions[bot]",
        state="COMMENTED",
        body="",
        submitted_at="2026-04-30T00:00:00Z",
    )
    review_calls = [
        call
        for call in calls
        if call[:4] == ["gh", "api", "--method", "POST"] and call[4].endswith("/reviews")
    ]
    assert review_calls == [
        [
            "gh",
            "api",
            "--method",
            "POST",
            "repos/dagster-io/asdl/pulls/47/reviews",
            "--input",
            "-",
        ]
    ]
    assert json.loads(inputs[-1] or "{}") == {
        "event": "COMMENT",
        "comments": [
            {"path": "app.py", "line": 7, "body": "first"},
            {"path": "other.py", "line": 9, "body": "second"},
        ],
    }


def test_real_pr_gateway_resolve_and_unresolve_parse_post_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            resolve_response={"thread": {"id": "PRRT_abc", "isResolved": True}},
            unresolve_response={"thread": {"id": "PRRT_abc", "isResolved": False}},
        ),
    )

    resolved = RealPRGateway().resolve_review_thread("PRRT_abc")
    unresolved = RealPRGateway().unresolve_review_thread("PRRT_abc")

    assert resolved == PRReviewThreadState(thread_id="PRRT_abc", is_resolved=True)
    assert unresolved == PRReviewThreadState(thread_id="PRRT_abc", is_resolved=False)


def test_real_pr_gateway_discussion_comment_mutations_and_reaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            add_comment_response={
                "id": 5555,
                "body": "Addressed",
                "user": {"login": "schrockn"},
                "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-5555",
            },
            update_comment_response={
                "id": 5555,
                "body": "Updated",
                "user": {"login": "schrockn"},
                "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-5555",
            },
            add_reaction_response={"id": 99, "content": "+1"},
            calls=calls,
        ),
    )

    created = RealPRGateway().add_pr_discussion_comment(47, "Addressed")
    updated = RealPRGateway().update_pr_discussion_comment(5555, "Updated")
    reaction = RealPRGateway().add_pr_discussion_comment_reaction(5555, "+1")

    assert created.body == "Addressed"
    assert updated.body == "Updated"
    assert reaction.id == 99
    assert reaction.comment_id == 5555
    post_calls = [call for call in calls if call[:4] == ["gh", "api", "--method", "POST"]]
    assert post_calls[0][4] == "repos/dagster-io/asdl/issues/47/comments"
    assert post_calls[1][4] == "repos/dagster-io/asdl/issues/comments/5555/reactions"


def test_real_pr_gateway_merge_pr_returns_outcome_without_success_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(merge_stdout="enabled auto-merge\n", calls=calls),
    )

    result = RealPRGateway().merge_pr(
        48,
        match_head_commit="abc123",
        admin=True,
        auto=True,
    )

    assert result == PRMergeOutcome(number=48, auto=True)
    assert not hasattr(result, "stdout")
    assert calls == [
        [
            "gh",
            "pr",
            "merge",
            "48",
            "-s",
            "--match-head-commit",
            "abc123",
            "--admin",
            "--auto",
        ]
    ]


def test_real_pr_gateway_merge_pr_returns_gateway_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(merge_returncode=1, merge_stdout="debug\n", merge_stderr="head changed\n"),
    )

    result = RealPRGateway().merge_pr(
        48,
        match_head_commit="abc123",
        admin=False,
        auto=False,
    )

    assert isinstance(result, PRGatewayFailure)
    assert result.returncode == 1
    assert result.stderr == "head changed"
    assert result.stdout == "debug"


def test_real_pr_gateway_merge_pr_handles_missing_gh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("gh: not found")

    monkeypatch.setattr(real_gateway_helpers.subprocess, "run", fake_run)

    result = RealPRGateway().merge_pr(
        48,
        match_head_commit="abc123",
        admin=False,
        auto=False,
    )

    assert isinstance(result, PRGatewayFailure)
    assert result.returncode == 127
    assert "gh: not found" in result.stderr
