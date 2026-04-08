"""Tests for pure classification functions."""

from __future__ import annotations

from twerk_pr_address.classify import (
    ClassificationResult,
    classify_impl,
    is_bot,
    is_known_informational_discussion,
    parse_name_status_output,
)
from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    RestructuredFile,
)

# -- is_bot --


def test_is_bot_with_bot_suffix() -> None:
    assert is_bot("github-actions[bot]") is True
    assert is_bot("dependabot[bot]") is True
    assert is_bot("renovate[bot]") is True


def test_is_bot_with_regular_user() -> None:
    assert is_bot("alice") is False
    assert is_bot("bob") is False
    assert is_bot("user-name") is False


def test_is_bot_with_bot_in_name_but_no_suffix() -> None:
    assert is_bot("bottiger") is False
    assert is_bot("robot") is False


# -- is_known_informational_discussion --


def test_graphite_automations_is_informational() -> None:
    assert is_known_informational_discussion("Graphite Automations", "Stack info") is True


def test_graphite_app_bot_is_informational() -> None:
    assert is_known_informational_discussion("graphite-app[bot]", "Stack updated") is True


def test_github_actions_ci_pattern_is_informational() -> None:
    assert is_known_informational_discussion("github-actions[bot]", "CI checks passed") is True
    assert (
        is_known_informational_discussion("github-actions[bot]", "Test results available") is True
    )
    assert is_known_informational_discussion("github-actions[bot]", "Build status: success") is True


def test_github_actions_non_ci_is_not_informational() -> None:
    assert is_known_informational_discussion("github-actions[bot]", "Something unrelated") is False


def test_regular_user_is_not_informational() -> None:
    assert is_known_informational_discussion("alice", "Please fix this") is False
    assert is_known_informational_discussion("bob", "Looks good!") is False


# -- parse_name_status_output --


def test_parse_empty_output() -> None:
    assert parse_name_status_output("") == ()
    assert parse_name_status_output("\n") == ()


def test_parse_rename_r100() -> None:
    result = parse_name_status_output("R100\told/path.py\tnew/path.py")
    assert len(result) == 1
    assert result[0] == RestructuredFile(
        status="R", old_path="old/path.py", new_path="new/path.py", similarity=100
    )


def test_parse_rename_partial_similarity() -> None:
    result = parse_name_status_output("R085\tsrc/old.py\tsrc/new.py")
    assert len(result) == 1
    assert result[0].status == "R"
    assert result[0].similarity == 85


def test_parse_copy() -> None:
    result = parse_name_status_output("C100\tbase.py\tcopy.py")
    assert len(result) == 1
    assert result[0] == RestructuredFile(
        status="C", old_path="base.py", new_path="copy.py", similarity=100
    )


def test_parse_mixed_statuses() -> None:
    output = "R100\told.py\tnew.py\nM\tmodified.py\nA\tadded.py\nD\tdeleted.py"
    result = parse_name_status_output(output)
    assert len(result) == 1
    assert result[0].status == "R"


def test_parse_multiple_renames() -> None:
    output = "R100\ta.py\tb.py\nR085\tc.py\td.py"
    result = parse_name_status_output(output)
    assert len(result) == 2
    assert result[0].similarity == 100
    assert result[1].similarity == 85


def test_parse_malformed_lines_skipped() -> None:
    output = "R100\told.py\tnew.py\nbadline\nR\tone_part"
    result = parse_name_status_output(output)
    assert len(result) == 1


# -- classify_impl --


def test_approved_review_is_informational() -> None:
    reviews = (
        PRReview(
            id="PRR_approved",
            author="reviewer",
            body="LGTM!",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    )
    result = classify_impl(reviews=reviews, threads=(), comments=(), restructured_files=())
    assert result.mechanical_informational_count == 1
    assert len(result.review_submissions) == 0


def test_changes_requested_is_actionable() -> None:
    reviews = (
        PRReview(
            id="PRR_changes",
            author="reviewer",
            body="Fix the auth flow",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    )
    result = classify_impl(reviews=reviews, threads=(), comments=(), restructured_files=())
    assert len(result.review_submissions) == 1
    assert result.review_submissions[0].classification == "actionable"
    assert result.review_submissions[0].id == "PRR_changes"


def test_commented_with_empty_body_is_informational() -> None:
    reviews = (
        PRReview(
            id="PRR_empty",
            author="reviewer",
            body="",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    )
    result = classify_impl(reviews=reviews, threads=(), comments=(), restructured_files=())
    assert result.mechanical_informational_count == 1
    assert len(result.review_submissions) == 0


def test_commented_with_body_needs_llm() -> None:
    reviews = (
        PRReview(
            id="PRR_body",
            author="reviewer",
            body="Consider refactoring this",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    )
    result = classify_impl(reviews=reviews, threads=(), comments=(), restructured_files=())
    assert len(result.review_submissions) == 1
    assert result.review_submissions[0].classification == "needs_llm"


def test_bot_detection_in_reviews() -> None:
    reviews = (
        PRReview(
            id="PRR_bot",
            author="coderabbit[bot]",
            body="Consider adding tests",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    )
    result = classify_impl(reviews=reviews, threads=(), comments=(), restructured_files=())
    assert result.review_submissions[0].is_bot is True


def test_pre_existing_candidate_bot_and_restructured() -> None:
    threads = (
        PRReviewThread(
            id="PRRT_bot",
            path="src/new.py",
            line=42,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="Add tests",
                    author="coderabbit[bot]",
                    path="src/new.py",
                    line=42,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    )
    restructured = (
        RestructuredFile(status="R", old_path="src/old.py", new_path="src/new.py", similarity=100),
    )
    result = classify_impl(
        reviews=(), threads=threads, comments=(), restructured_files=restructured
    )
    assert len(result.review_threads) == 1
    assert result.review_threads[0].pre_existing_candidate is True
    assert result.review_threads[0].is_bot is True


def test_not_pre_existing_human_or_non_restructured() -> None:
    threads = (
        # Human on restructured file
        PRReviewThread(
            id="PRRT_human",
            path="src/new.py",
            line=42,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="Fix this",
                    author="reviewer",
                    path="src/new.py",
                    line=42,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
        # Bot on non-restructured file
        PRReviewThread(
            id="PRRT_bot_normal",
            path="src/other.py",
            line=10,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=2,
                    body="Add tests",
                    author="bot[bot]",
                    path="src/other.py",
                    line=10,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    )
    restructured = (
        RestructuredFile(status="R", old_path="src/old.py", new_path="src/new.py", similarity=100),
    )
    result = classify_impl(
        reviews=(), threads=threads, comments=(), restructured_files=restructured
    )
    assert len(result.review_threads) == 2
    assert result.review_threads[0].pre_existing_candidate is False  # Human
    assert result.review_threads[1].pre_existing_candidate is False  # Bot on non-restructured


def test_threads_without_comments_are_skipped() -> None:
    threads = (
        PRReviewThread(
            id="PRRT_empty",
            path="file.py",
            line=1,
            is_resolved=False,
            is_outdated=False,
            comments=(),
        ),
    )
    result = classify_impl(reviews=(), threads=threads, comments=(), restructured_files=())
    assert len(result.review_threads) == 0


def test_known_informational_discussion() -> None:
    comments = (
        IssueComment(
            id=1,
            author="Graphite Automations",
            body="Stack updated",
            url="https://github.com/owner/repo/issues/123#issuecomment-1",
        ),
        IssueComment(
            id=2,
            author="github-actions[bot]",
            body="CI checks passed",
            url="https://github.com/owner/repo/issues/123#issuecomment-2",
        ),
    )
    result = classify_impl(reviews=(), threads=(), comments=comments, restructured_files=())
    assert result.mechanical_informational_count == 2
    assert len(result.discussion_comments) == 2
    assert result.discussion_comments[0].classification == "informational"
    assert result.discussion_comments[1].classification == "informational"


def test_unknown_discussion_needs_llm() -> None:
    comments = (
        IssueComment(
            id=1,
            author="reviewer",
            body="Please update the docs",
            url="https://github.com/owner/repo/issues/123#issuecomment-1",
        ),
    )
    result = classify_impl(reviews=(), threads=(), comments=comments, restructured_files=())
    assert len(result.discussion_comments) == 1
    assert result.discussion_comments[0].classification == "needs_llm"


def test_empty_inputs() -> None:
    result = classify_impl(reviews=(), threads=(), comments=(), restructured_files=())
    assert result.mechanical_informational_count == 0
    assert len(result.review_submissions) == 0
    assert len(result.review_threads) == 0
    assert len(result.discussion_comments) == 0


def test_body_preview_truncation() -> None:
    long_body = "x" * 300
    reviews = (
        PRReview(
            id="PRR_long",
            author="reviewer",
            body=long_body,
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    )
    result = classify_impl(reviews=reviews, threads=(), comments=(), restructured_files=())
    assert len(result.review_submissions[0].body_preview) == 200


def test_classification_result_to_json_dict() -> None:
    result = ClassificationResult(
        review_submissions=(),
        review_threads=(),
        discussion_comments=(),
        restructured_files=(),
        mechanical_informational_count=0,
    )
    json_dict = result.to_json_dict()
    assert json_dict["review_submissions"] == []
    assert json_dict["mechanical_informational_count"] == 0
