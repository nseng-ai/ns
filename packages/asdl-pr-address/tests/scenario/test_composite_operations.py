"""Scenario tests for the composite ``pr-address`` operations."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRLookupMiss,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
    Reaction,
)
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile
from asdl_pr_address.cli.main import build_cli
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.reply_formatting import PRE_EXISTING_REPLY, RESOLUTION_MARKER


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _invoke_json(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRGateway,
    *,
    git_gateway: FakeGitGateway | None = None,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = PrAddressCliContext(
        pr_gateway=fake,
        git_gateway=git_gateway if git_gateway is not None else FakeGitGateway(),
    )
    # The operation name comes first; `--format json` goes next (before any
    # positional arg that might start with `-`) so Click parses it as an
    # option rather than a positional.
    op_name, *rest = args
    result = runner.invoke(
        cli_group,
        ["exec", op_name, "--format", "json", *rest],
        obj=_obj(ctx),
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def test_prepare_run_reopens_contested_threads_and_normalizes_feedback(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway(
        prs_by_branch={
            "feature": PRSummary(
                number=42,
                title="Update helper surface",
                url="https://example.com/pr/42",
                head_ref_name="feature",
                base_ref_name="master",
                state="OPEN",
            )
        },
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body="Please tighten the workflow.",
                    state="CHANGES_REQUESTED",
                    submitted_at="2026-04-15T12:00:00Z",
                )
            ]
        },
        review_threads={
            42: [
                PRReviewThread(
                    id="PRRT_live",
                    path="src/live.py",
                    line=10,
                    start_line=7,
                    is_resolved=False,
                    is_outdated=False,
                    comments=(
                        PRReviewComment(
                            id=1,
                            body="Please update this helper.",
                            author="reviewer",
                            path="src/live.py",
                            line=10,
                            start_line=7,
                            created_at="2026-04-15T12:00:00Z",
                        ),
                    ),
                ),
                PRReviewThread(
                    id="PRRT_contested",
                    path="src/new.py",
                    line=11,
                    is_resolved=True,
                    is_outdated=False,
                    comments=(
                        PRReviewComment(
                            id=2,
                            body=f"Fixed already.\n{RESOLUTION_MARKER}",
                            author="github-actions[bot]",
                            path="src/new.py",
                            line=11,
                            created_at="2026-04-15T12:00:00Z",
                        ),
                        PRReviewComment(
                            id=3,
                            body="Please revisit this edge case.",
                            author="reviewer",
                            path="src/new.py",
                            line=11,
                            created_at="2026-04-15T12:05:00Z",
                        ),
                    ),
                ),
                PRReviewThread(
                    id="PRRT_manual",
                    path="src/old.py",
                    line=8,
                    is_resolved=True,
                    is_outdated=False,
                    comments=(
                        PRReviewComment(
                            id=4,
                            body="Looks good now.",
                            author="reviewer",
                            path="src/old.py",
                            line=8,
                            created_at="2026-04-15T12:00:00Z",
                        ),
                    ),
                ),
            ]
        },
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=9001,
                    body="Please update the summary too.",
                    author="reviewer",
                    url="https://example.com/comment/9001",
                )
            ]
        },
    )

    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "feature"},
        restructured_files_by_key={
            (Path.cwd(), "master"): (
                RestructuredFile(
                    status="R",
                    old_path="src/old.py",
                    new_path="src/new.py",
                    similarity=100,
                ),
            )
        },
    )

    exit_code, output = _invoke_json(cli_group, ["prepare-run"], fake, git_gateway=git_gateway)

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["found"] is True
    assert data["current_branch"] == "feature"
    assert data["number"] == 42
    assert data["reopened_thread_ids"] == ["PRRT_contested"]
    assert fake.unresolved_thread_ids == ("PRRT_contested",)
    assert [thread["id"] for thread in data["review_threads"]] == ["PRRT_live", "PRRT_contested"]
    assert data["review_threads"][1]["is_resolved"] is False
    # Multi-line threads preserve start_line through to the JSON output;
    # single-line threads report null.
    assert data["review_threads"][0]["line"] == 10
    assert data["review_threads"][0]["start_line"] == 7
    assert data["review_threads"][0]["comments"][0]["start_line"] == 7
    assert data["review_threads"][1]["start_line"] is None
    assert len(data["reviews"]) == 1
    assert len(data["discussion_comments"]) == 1
    assert data["restructured_files"] == [
        {
            "status": "R",
            "old_path": "src/old.py",
            "new_path": "src/new.py",
            "similarity": 100,
        }
    ]
    assert data["warnings"] == []


def test_prepare_run_include_all_threads_keeps_still_resolved_threads(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway(
        prs_by_branch={
            "feature": PRSummary(
                number=42,
                title="Update helper surface",
                url="https://example.com/pr/42",
                head_ref_name="feature",
                base_ref_name="master",
                state="OPEN",
            )
        },
        review_threads={
            42: [
                PRReviewThread(
                    id="PRRT_live",
                    path="src/live.py",
                    line=10,
                    is_resolved=False,
                    is_outdated=False,
                    comments=(),
                ),
                PRReviewThread(
                    id="PRRT_manual",
                    path="src/old.py",
                    line=8,
                    is_resolved=True,
                    is_outdated=False,
                    comments=(),
                ),
            ]
        },
    )

    git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): "feature"})

    exit_code, output = _invoke_json(
        cli_group,
        ["prepare-run", "--include-all-threads"],
        fake,
        git_gateway=git_gateway,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert [thread["id"] for thread in data["review_threads"]] == ["PRRT_live", "PRRT_manual"]
    assert data["review_threads"][1]["is_resolved"] is True


def test_prepare_run_filters_empty_reviews_by_default(
    cli_group: ClinkrGroup,
) -> None:
    reviews = [
        PRReview(
            id="PRR_noise_commented",
            author="reviewer",
            body="",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_noise_approved",
            author="reviewer",
            body="   ",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal",
            author="reviewer",
            body="",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    ]
    pr = PRSummary(
        number=42,
        title="t",
        url="u",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )

    fake_default = FakePRGateway(prs_by_branch={"feature": pr}, reviews={42: reviews})
    git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): "feature"})
    exit_default, out_default = _invoke_json(
        cli_group, ["prepare-run"], fake_default, git_gateway=git_gateway
    )
    assert exit_default == 0
    assert [r["id"] for r in out_default["data"]["reviews"]] == ["PRR_signal"]

    fake_all = FakePRGateway(prs_by_branch={"feature": pr}, reviews={42: reviews})
    exit_all, out_all = _invoke_json(
        cli_group,
        ["prepare-run", "--include-empty-reviews"],
        fake_all,
        git_gateway=git_gateway,
    )
    assert exit_all == 0
    assert [r["id"] for r in out_all["data"]["reviews"]] == [
        "PRR_noise_commented",
        "PRR_noise_approved",
        "PRR_signal",
    ]


def test_prepare_run_returns_found_false_when_branch_has_no_pr(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): "feature"})

    exit_code, output = _invoke_json(cli_group, ["prepare-run"], fake, git_gateway=git_gateway)

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["found"] is False
    assert data["current_branch"] == "feature"
    assert data["error"] == "no PR found"


class FailingLookupGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        return PRGatewayFailure(stderr="gh auth failed", returncode=4)


def test_prepare_run_lookup_failure_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    fake = FailingLookupGateway()
    git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): "feature"})

    exit_code, output = _invoke_json(cli_group, ["prepare-run"], fake, git_gateway=git_gateway)

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "pr_gateway_failure"
    assert "current branch 'feature'" in output["message"]
    assert "gh auth failed" in output["message"]


def test_prepare_run_detached_head_returns_command_error(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): DetachedHead()})

    exit_code, output = _invoke_json(cli_group, ["prepare-run"], fake, git_gateway=git_gateway)

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "detached_head"
    assert "prepare-run" in output["message"]
    assert "checked-out branch" in output["message"]


def test_prepare_run_warns_when_restructured_file_detection_fails(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway(
        prs_by_branch={
            "feature": PRSummary(
                number=42,
                title="Update helper surface",
                url="https://example.com/pr/42",
                head_ref_name="feature",
                base_ref_name="master",
                state="OPEN",
            )
        }
    )

    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "feature"},
        restructured_files_by_key={
            (Path.cwd(), "master"): GitCommandFailure(
                message="Failed to detect restructured files against origin/master: "
                "fatal: bad revision 'origin/master...HEAD'",
                returncode=128,
            )
        },
    )

    exit_code, output = _invoke_json(cli_group, ["prepare-run"], fake, git_gateway=git_gateway)

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["restructured_files"] == []
    assert data["warnings"] == [
        "Failed to detect restructured files against origin/master: "
        "fatal: bad revision 'origin/master...HEAD'"
    ]


def test_prepare_run_returns_git_failed_when_current_branch_lookup_fails(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    git_gateway = FakeGitGateway(
        current_branch_by_path={
            Path.cwd(): GitCommandFailure(message="fatal: not a git repository", returncode=128)
        }
    )

    exit_code, output = _invoke_json(cli_group, ["prepare-run"], fake, git_gateway=git_gateway)

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "git_failed"
    assert "not a git repository" in output["message"]


def test_resolve_thread_with_reply_fixed_uses_canonical_format(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        [
            "resolve-thread-with-reply",
            "PRRT_abc",
            "fixed",
            "Use the LBYL guard here.",
            "abc1234",
        ],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["thread_id"] == "PRRT_abc"
    assert data["is_resolved"] is True
    assert fake.resolved_thread_ids == ("PRRT_abc",)
    assert len(fake.thread_replies) == 1
    assert fake.thread_replies[0][0] == "PRRT_abc"
    assert "Fixed in commit abc1234: Use the LBYL guard here." in data["body"]
    assert RESOLUTION_MARKER in data["body"]
    assert "Addressed via _pr-address_ at " in data["body"]


def test_resolve_thread_with_reply_pre_existing_uses_standard_message(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["resolve-thread-with-reply", "PRRT_old", "pre_existing", "", ""],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["thread_id"] == "PRRT_old"
    assert data["is_resolved"] is True
    assert data["body"].startswith(PRE_EXISTING_REPLY)
    assert RESOLUTION_MARKER in data["body"]


def test_reply_to_review_posts_formatted_summary(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        [
            "reply-to-review",
            "42",
            "reviewer",
            "--",
            "- Updated the helper flow\n- Added coverage",
        ],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert fake.comments == ((42, data["body"]),)
    assert data["body"].startswith("Addressed review feedback from @reviewer:")
    assert "- Updated the helper flow" in data["body"]
    assert "_Addressed via pr-address at " in data["body"]


def test_reply_to_discussion_quotes_original_and_adds_reaction(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        [
            "reply-to-discussion",
            "42",
            "9001",
            "reviewer",
            "Can you update this?\nIt still reads oddly.",
            "Done in the latest commit.",
        ],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["reaction_added"] is True
    assert fake.reactions == ((9001, "+1"),)
    assert fake.comments == ((42, data["body"]),)
    assert "> @reviewer wrote:" in data["body"]
    assert "> Can you update this?" in data["body"]
    assert "> It still reads oddly." in data["body"]
    assert "Done in the latest commit." in data["body"]


def test_reply_to_discussion_warns_but_succeeds_when_reaction_fails(
    cli_group: ClinkrGroup,
) -> None:
    class FailingReactionGateway(FakePRGateway):
        def add_pr_discussion_comment_reaction(self, comment_id: int, reaction: str) -> Reaction:
            raise subprocess.CalledProcessError(
                returncode=1,
                cmd=["gh", "api", "-X", "POST"],
                stderr="rate limited",
            )

    fake = FailingReactionGateway()

    exit_code, output = _invoke_json(
        cli_group,
        [
            "reply-to-discussion",
            "42",
            "9001",
            "reviewer",
            "Can you update this?",
            "Done in the latest commit.",
        ],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["reaction_added"] is False
    assert data["warning"].startswith("Failed to add reaction to comment 9001: ")


def test_reply_to_review_rejects_empty_summary(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["reply-to-review", "42", "reviewer", "   \n  "],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "summary_markdown" in output["message"]
    assert fake.comments == ()


def test_reply_to_discussion_rejects_empty_response(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        [
            "reply-to-discussion",
            "42",
            "9001",
            "reviewer",
            "Can you update this?",
            "",
        ],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "response" in output["message"]
    assert fake.comments == ()


def test_resolve_thread_with_reply_fixed_requires_message(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["resolve-thread-with-reply", "PRRT_abc", "fixed", "", "abc1234"],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "message" in output["message"]
    assert fake.resolved_thread_ids == ()


def test_resolve_thread_with_reply_fixed_requires_commit_sha(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        [
            "resolve-thread-with-reply",
            "PRRT_abc",
            "fixed",
            "Use the LBYL guard.",
            "   ",
        ],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "commit_sha" in output["message"]
    assert fake.resolved_thread_ids == ()


def test_resolve_thread_with_reply_explained_requires_message(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["resolve-thread-with-reply", "PRRT_abc", "explained", "", ""],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "message" in output["message"]
    assert fake.resolved_thread_ids == ()
