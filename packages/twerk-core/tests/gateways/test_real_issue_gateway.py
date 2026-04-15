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

from twerk_core.gh import real_gateway_helpers, real_issue_gateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway
from twerk_core.gh.types import PRLookupError

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
    *,
    threads: list[dict[str, object]] | None = None,
    reviews: list[dict[str, object]] | None = None,
    discussion_comment_pages: list[list[dict[str, object]]] | None = None,
    resolve_response: dict[str, object] | None = None,
    unresolve_response: dict[str, object] | None = None,
    reply_response: dict[str, object] | None = None,
    add_comment_response: dict[str, object] | None = None,
    add_reaction_response: dict[str, object] | None = None,
    pr_view_response: dict[str, object] | None = None,
    pr_view_returncode: int = 0,
    calls: list[list[str]] | None = None,
) -> object:
    """Build a fake `subprocess.run` that dispatches on the command shape.

    Returns owner/repo JSON for `gh repo view ...` and a GraphQL payload for
    `gh api graphql ...`. Raises if the test harness sends any other command.

    Mutation dispatch order matters: the `unresolveReviewThread` query
    contains `resolveReviewThread` as a substring, so `unresolve` must be
    checked first.
    """
    review_threads_payload = json.dumps(
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
    reviews_payload = json.dumps(reviews or [])
    discussion_comments_payload = "".join(
        json.dumps(page) for page in (discussion_comment_pages or [])
    )
    resolve_payload = json.dumps({"data": {"resolveReviewThread": resolve_response or {}}})
    unresolve_payload = json.dumps({"data": {"unresolveReviewThread": unresolve_response or {}}})
    reply_payload = json.dumps({"data": {"addPullRequestReviewThreadReply": reply_response or {}}})
    add_comment_payload = json.dumps(add_comment_response or {})
    add_reaction_payload = json.dumps(add_reaction_response or {})
    pr_view_payload = json.dumps(pr_view_response) if pr_view_response else ""

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if calls is not None:
            calls.append(list(cmd))
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=_OWNER_REPO_OUTPUT, stderr="")
        if cmd[:3] == ["gh", "api", "graphql"]:
            assert "-F" in cmd
            joined = " ".join(cmd)
            # Mutations are checked first because they don't carry
            # owner/repo/number; queries do.
            if "unresolveReviewThread" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=unresolve_payload, stderr="")
            if "resolveReviewThread" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=resolve_payload, stderr="")
            if "addPullRequestReviewThreadReply" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=reply_payload, stderr="")
            # Queries: sanity-check that owner/repo/number are present.
            assert "owner=dagster-io" in joined
            assert "repo=twerk" in joined
            assert "number=47" in joined
            if "reviewThreads(first: 100)" in joined:
                return subprocess.CompletedProcess(cmd, 0, stdout=review_threads_payload, stderr="")
            raise AssertionError(f"unexpected GraphQL query: {joined}")
        if cmd[:2] == ["gh", "api"] and cmd[2].endswith("/reviews"):
            assert "--paginate" in cmd
            return subprocess.CompletedProcess(cmd, 0, stdout=reviews_payload, stderr="")
        if cmd[:2] == ["gh", "api"] and cmd[2] == "repos/dagster-io/twerk/issues/47/comments":
            assert "--paginate" in cmd
            return subprocess.CompletedProcess(
                cmd, 0, stdout=discussion_comments_payload, stderr=""
            )
        if cmd[:3] == ["gh", "pr", "view"]:
            return subprocess.CompletedProcess(
                cmd, pr_view_returncode, stdout=pr_view_payload, stderr=""
            )
        if cmd[:4] == ["gh", "api", "--method", "POST"]:
            # REST POST dispatch for add_comment / add_reaction. Match on
            # the path tail, not a substring, so the reactions endpoint
            # cannot collide with the plain comments endpoint.
            path = cmd[4]
            if path.endswith("/reactions"):
                return subprocess.CompletedProcess(cmd, 0, stdout=add_reaction_payload, stderr="")
            if path.startswith("repos/") and path.endswith("/comments"):
                return subprocess.CompletedProcess(cmd, 0, stdout=add_comment_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    return fake_run


def test_get_review_threads_default_filters_out_resolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    threads = [
        _make_thread(thread_id="PRRT_open", is_resolved=False),
        _make_thread(thread_id="PRRT_closed", is_resolved=True),
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads=threads))

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
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads=threads))

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
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads=threads))

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
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(threads=threads))

    result = RealIssueGateway().get_review_threads(47)

    assert len(result) == 1
    assert result[0].comments[0].author == ""


def test_get_reviews_returns_full_review_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews = [
        {
            "node_id": "PRR_changes",
            "user": {"login": "reviewer"},
            "body": "Please fix this",
            "state": "CHANGES_REQUESTED",
            "submitted_at": "2026-04-10T12:00:00Z",
        },
        {
            "node_id": "PRR_approved",
            "user": None,
            "body": "looks good",
            "state": "APPROVED",
            "submitted_at": "2026-04-10T13:00:00Z",
        },
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(reviews=reviews))

    result = RealIssueGateway().get_reviews(47)

    assert tuple(review.id for review in result) == ("PRR_changes", "PRR_approved")
    assert tuple(review.state for review in result) == ("CHANGES_REQUESTED", "APPROVED")
    assert result[0].author == "reviewer"
    assert result[1].author == ""


def test_get_reviews_filters_out_pending_and_dismissed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews = [
        {
            "node_id": "PRR_pending",
            "user": {"login": "reviewer"},
            "body": "",
            "state": "PENDING",
            "submitted_at": "2026-04-10T11:00:00Z",
        },
        {
            "node_id": "PRR_approved",
            "user": {"login": "reviewer"},
            "body": "lgtm",
            "state": "APPROVED",
            "submitted_at": "2026-04-10T12:00:00Z",
        },
        {
            "node_id": "PRR_dismissed",
            "user": {"login": "reviewer"},
            "body": "dismissed",
            "state": "DISMISSED",
            "submitted_at": "2026-04-10T13:00:00Z",
        },
    ]
    monkeypatch.setattr(real_issue_gateway.subprocess, "run", _make_fake_run(reviews=reviews))

    result = RealIssueGateway().get_reviews(47)

    assert tuple(review.id for review in result) == ("PRR_approved",)
    assert result[0].state == "APPROVED"


def test_resolve_review_thread_sends_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            resolve_response={"thread": {"id": "PRRT_abc", "isResolved": True}},
        ),
    )

    result = RealIssueGateway().resolve_review_thread("PRRT_abc")

    assert result.thread_id == "PRRT_abc"
    # The real gateway cannot distinguish idempotent mutation calls — always False.
    assert result.was_already_resolved is False


def test_resolve_review_thread_passes_thread_id_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            resolve_response={"thread": {"id": "PRRT_xyz", "isResolved": True}},
            calls=calls,
        ),
    )

    RealIssueGateway().resolve_review_thread("PRRT_xyz")

    # Exactly one subprocess call — no owner/repo preflight.
    assert len(calls) == 1
    joined = " ".join(calls[0])
    assert "threadId=PRRT_xyz" in joined
    assert "resolveReviewThread" in joined


def test_unresolve_review_thread_sends_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            unresolve_response={"thread": {"id": "PRRT_abc", "isResolved": False}},
        ),
    )

    result = RealIssueGateway().unresolve_review_thread("PRRT_abc")

    assert result.thread_id == "PRRT_abc"
    assert result.was_already_unresolved is False


def test_unresolve_review_thread_passes_thread_id_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            unresolve_response={"thread": {"id": "PRRT_xyz", "isResolved": False}},
            calls=calls,
        ),
    )

    RealIssueGateway().unresolve_review_thread("PRRT_xyz")

    assert len(calls) == 1
    joined = " ".join(calls[0])
    assert "threadId=PRRT_xyz" in joined
    assert "unresolveReviewThread" in joined


def test_add_review_thread_reply_returns_full_comment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            reply_response={
                "comment": {
                    "databaseId": 7777,
                    "body": "Fixed in commit abc1234.",
                    "author": {"login": "schrockn"},
                    "path": "src/foo.py",
                    # Server returns the aliased field — the gateway must map it.
                    "line": 42,
                    "createdAt": "2026-04-10T15:00:00Z",
                }
            }
        ),
    )

    comment = RealIssueGateway().add_review_thread_reply("PRRT_abc", "Fixed in commit abc1234.")

    assert comment.id == 7777
    assert comment.body == "Fixed in commit abc1234."
    assert comment.author == "schrockn"
    assert comment.path == "src/foo.py"
    assert comment.line == 42
    assert comment.created_at == "2026-04-10T15:00:00Z"


def test_add_review_thread_reply_handles_deleted_author(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`author` is null when the replying account has been deleted."""
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            reply_response={
                "comment": {
                    "databaseId": 8888,
                    "body": "ghost reply",
                    "author": None,
                    "path": "src/foo.py",
                    "line": None,
                    "createdAt": "2026-04-10T15:00:00Z",
                }
            }
        ),
    )

    comment = RealIssueGateway().add_review_thread_reply("PRRT_abc", "ghost reply")

    assert comment.author == ""
    assert comment.line is None


def test_get_discussion_comments_flattens_paginated_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    discussion_comment_pages = [
        [
            {
                "id": 101,
                "body": "First comment",
                "user": {"login": "alice"},
                "html_url": "https://github.com/dagster-io/twerk/pull/47#issuecomment-101",
            }
        ],
        [
            {
                "id": 202,
                "body": "Second comment",
                "user": None,
                "html_url": "https://github.com/dagster-io/twerk/pull/47#issuecomment-202",
            }
        ],
    ]
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(discussion_comment_pages=discussion_comment_pages),
    )

    result = RealIssueGateway().get_discussion_comments(47)

    assert tuple(comment.id for comment in result) == (101, 202)
    assert result[0].author == "alice"
    assert result[1].author == ""


def test_add_comment_posts_body_and_returns_issue_comment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            add_comment_response={
                "id": 5555,
                "body": "Addressed",
                "user": {"login": "schrockn"},
                "html_url": "https://github.com/dagster-io/twerk/pull/47#issuecomment-5555",
            },
            calls=calls,
        ),
    )

    comment = RealIssueGateway().add_comment(47, "Addressed")

    assert comment.id == 5555
    assert comment.body == "Addressed"
    assert comment.author == "schrockn"
    assert comment.url == "https://github.com/dagster-io/twerk/pull/47#issuecomment-5555"

    # Walk past the owner/repo preflight call to the POST invocation.
    post_calls = [c for c in calls if c[:4] == ["gh", "api", "--method", "POST"]]
    assert len(post_calls) == 1
    post_cmd = post_calls[0]
    assert post_cmd[4] == "repos/dagster-io/twerk/issues/47/comments"
    assert "body=Addressed" in post_cmd


def test_add_comment_handles_deleted_author(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`user` is null when the commenting account has been deleted."""
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            add_comment_response={
                "id": 6666,
                "body": "ghost comment",
                "user": None,
                "html_url": "https://github.com/dagster-io/twerk/pull/47#issuecomment-6666",
            }
        ),
    )

    comment = RealIssueGateway().add_comment(47, "ghost comment")

    assert comment.author == ""
    assert comment.id == 6666


def test_add_reaction_posts_content_and_returns_reaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            add_reaction_response={"id": 12345, "content": "+1"},
            calls=calls,
        ),
    )

    reaction = RealIssueGateway().add_reaction(5555, "+1")

    assert reaction.id == 12345
    # `comment_id` is echoed from the argument, not re-derived from the response.
    assert reaction.comment_id == 5555
    assert reaction.content == "+1"

    post_calls = [c for c in calls if c[:4] == ["gh", "api", "--method", "POST"]]
    assert len(post_calls) == 1
    post_cmd = post_calls[0]
    # GitHub's reactions preview requires the explicit Accept header.
    assert "-H" in post_cmd
    accept_index = post_cmd.index("-H") + 1
    assert post_cmd[accept_index] == "Accept: application/vnd.github+json"
    assert "content=+1" in post_cmd


def test_add_reaction_targets_comment_id_in_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        real_issue_gateway.subprocess,
        "run",
        _make_fake_run(
            add_reaction_response={"id": 99, "content": "heart"},
            calls=calls,
        ),
    )

    RealIssueGateway().add_reaction(99999, "heart")

    post_calls = [c for c in calls if c[:4] == ["gh", "api", "--method", "POST"]]
    assert len(post_calls) == 1
    assert post_calls[0][4] == "repos/dagster-io/twerk/issues/comments/99999/reactions"


# -- get_pr_for_branch --


@pytest.mark.parametrize("state", ["OPEN", "MERGED", "CLOSED"])
def test_get_pr_for_branch_returns_summary(
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            pr_view_response={
                "number": 47,
                "title": "Port pr-address skill",
                "url": "https://github.com/dagster-io/twerk/pull/47",
                "headRefName": "twerk-pr-address-skill",
                "baseRefName": "master",
                "state": state,
            },
        ),
    )

    result = RealIssueGateway().get_pr_for_branch("twerk-pr-address-skill")

    assert result is not None
    assert not isinstance(result, PRLookupError)
    assert result.number == 47
    assert result.title == "Port pr-address skill"
    assert result.url == "https://github.com/dagster-io/twerk/pull/47"
    assert result.head_ref_name == "twerk-pr-address-skill"
    assert result.base_ref_name == "master"
    assert result.state == state


def test_get_pr_for_branch_returns_error_when_no_pr(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(pr_view_returncode=1),
    )

    result = RealIssueGateway().get_pr_for_branch("no-pr-branch")

    assert isinstance(result, PRLookupError)
    assert result.returncode == 1
