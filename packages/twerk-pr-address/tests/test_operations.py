"""Tests for clinkr operations via CliRunner with FakePRAddressGitHub."""

import json

import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup, discover_group
from twerk_core.gh.types import (
    GhIssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
)
from twerk_pr_address.testing import FakePRAddressGitHub


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return discover_group("twerk_pr_address.cli.pr_address")


def _invoke(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRAddressGitHub,
) -> tuple[int, dict]:
    runner = CliRunner()
    result = runner.invoke(cli_group, args, obj={"pr_address_gateway": fake})
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


# -- get-review-comments --


def test_get_review_comments_returns_unresolved(cli_group: ClinkrGroup) -> None:
    unresolved = PRReviewThread(
        id="PRRT_1",
        path="file.py",
        line=10,
        is_resolved=False,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=1,
                body="Fix this",
                author="reviewer",
                path="file.py",
                line=10,
                created_at="2025-01-01T00:00:00Z",
            ),
        ),
    )
    resolved = PRReviewThread(
        id="PRRT_2",
        path="other.py",
        line=20,
        is_resolved=True,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=2,
                body="Done",
                author="reviewer",
                path="other.py",
                line=20,
                created_at="2025-01-01T00:00:00Z",
            ),
        ),
    )
    fake = FakePRAddressGitHub(pr_review_threads={42: [unresolved, resolved]})

    exit_code, output = _invoke(cli_group, ["get-review-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 1
    assert output["threads"][0]["id"] == "PRRT_1"


def test_get_review_comments_include_resolved(cli_group: ClinkrGroup) -> None:
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="a.py",
            line=1,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="x",
                    author="a",
                    path="a.py",
                    line=1,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
        PRReviewThread(
            id="PRRT_2",
            path="b.py",
            line=2,
            is_resolved=True,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=2,
                    body="y",
                    author="b",
                    path="b.py",
                    line=2,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]
    fake = FakePRAddressGitHub(pr_review_threads={42: threads})

    exit_code, output = _invoke(
        cli_group, ["get-review-comments", "42", "--include-resolved"], fake
    )

    assert exit_code == 0
    assert output["count"] == 2


def test_get_review_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRAddressGitHub()

    exit_code, output = _invoke(cli_group, ["get-review-comments", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0
    assert output["threads"] == []


# -- get-discussion-comments --


def test_get_discussion_comments_returns_comments(cli_group: ClinkrGroup) -> None:
    comments = [
        GhIssueComment(id=1, body="Nice work", author="alice", url="https://example.com/1"),
        GhIssueComment(id=2, body="Fix the typo", author="bob", url="https://example.com/2"),
    ]
    fake = FakePRAddressGitHub(pr_discussion_comments={42: comments})

    exit_code, output = _invoke(cli_group, ["get-discussion-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 2
    assert output["comments"][0]["author"] == "alice"


def test_get_discussion_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRAddressGitHub()

    exit_code, output = _invoke(cli_group, ["get-discussion-comments", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0


# -- get-feedback --


def test_get_feedback_full_scenario(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_1",
            author="reviewer",
            body="Fix this",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_2",
            author="reviewer",
            body="LGTM",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    ]
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="file.py",
            line=10,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="Add tests",
                    author="reviewer",
                    path="file.py",
                    line=10,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]
    comments = [
        GhIssueComment(
            id=1,
            author="Graphite Automations",
            body="Stack info",
            url="https://example.com/1",
        ),
    ]
    fake = FakePRAddressGitHub(
        pr_reviews={42: reviews},
        pr_review_threads={42: threads},
        pr_discussion_comments={42: comments},
    )

    exit_code, output = _invoke(cli_group, ["get-feedback", "42"], fake)

    assert exit_code == 0
    assert output["pr_number"] == 42
    # All reviews pass through unfiltered — including APPROVED.
    assert len(output["reviews"]) == 2
    assert {r["id"] for r in output["reviews"]} == {"PRR_1", "PRR_2"}
    assert {r["state"] for r in output["reviews"]} == {"CHANGES_REQUESTED", "APPROVED"}
    # Threads pass through as full PRReviewThread records with nested comments.
    assert len(output["review_threads"]) == 1
    assert output["review_threads"][0]["id"] == "PRRT_1"
    assert output["review_threads"][0]["path"] == "file.py"
    assert len(output["review_threads"][0]["comments"]) == 1
    # Discussion comments pass through as full IssueComment records — including
    # bot/Graphite comments that used to be pre-classified as informational.
    assert len(output["discussion_comments"]) == 1
    assert output["discussion_comments"][0]["author"] == "Graphite Automations"
    assert output["discussion_comments"][0]["body"] == "Stack info"


def test_get_feedback_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRAddressGitHub()

    exit_code, output = _invoke(cli_group, ["get-feedback", "99"], fake)

    assert exit_code == 0
    assert output["pr_number"] == 99
    assert output["reviews"] == []
    assert output["review_threads"] == []
    assert output["discussion_comments"] == []


def test_get_feedback_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRAddressGitHub()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["json", "get-feedback"],
        input='{"pr_number": 99}',
        obj={"pr_address_gateway": fake},
    )

    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["success"] is True
    assert output["pr_number"] == 99
