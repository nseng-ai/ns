"""Scenario tests for the composite ``pr-address`` operations."""

from __future__ import annotations

import json
import subprocess

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import IssueComment, PRReview, PRReviewComment, PRReviewThread, PRSummary
from twerk_pr_address.cli.main import build_cli
from twerk_pr_address.cli.pr_address import local_git
from twerk_pr_address.cli.pr_address.reply_formatting import PRE_EXISTING_REPLY, RESOLUTION_MARKER


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _invoke_json(
    cli_group: ClinkrGroup,
    op: str,
    payload: dict,
    fake: FakeIssueGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "json", op],
        input=json.dumps(payload),
        obj={"gh_issue_gateway": fake},
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def test_prepare_run_reopens_contested_threads_and_normalizes_feedback(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeIssueGateway(
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
                    is_resolved=False,
                    is_outdated=False,
                    comments=(
                        PRReviewComment(
                            id=1,
                            body="Please update this helper.",
                            author="reviewer",
                            path="src/live.py",
                            line=10,
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
                            author="fake-user",
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
                IssueComment(
                    id=9001,
                    body="Please update the summary too.",
                    author="reviewer",
                    url="https://example.com/comment/9001",
                )
            ]
        },
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="feature\n", stderr="")
        if cmd == ["git", "diff", "--name-status", "-M", "-C", "origin/master...HEAD"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="R100\tsrc/old.py\tsrc/new.py\nM\tsrc/ignored.py\n",
                stderr="",
            )
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    exit_code, output = _invoke_json(cli_group, "prepare-run", {}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["found"] is True
    assert output["current_branch"] == "feature"
    assert output["number"] == 42
    assert output["reopened_thread_ids"] == ["PRRT_contested"]
    assert fake._unresolved_thread_ids == ["PRRT_contested"]
    assert [thread["id"] for thread in output["review_threads"]] == ["PRRT_live", "PRRT_contested"]
    assert output["review_threads"][1]["is_resolved"] is False
    assert len(output["reviews"]) == 1
    assert len(output["discussion_comments"]) == 1
    assert output["restructured_files"] == [
        {
            "status": "R",
            "old_path": "src/old.py",
            "new_path": "src/new.py",
            "similarity": 100,
        }
    ]
    assert output["warnings"] == []


def test_prepare_run_include_all_threads_keeps_still_resolved_threads(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeIssueGateway(
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

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="feature\n", stderr="")
        if cmd == ["git", "diff", "--name-status", "-M", "-C", "origin/master...HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    exit_code, output = _invoke_json(
        cli_group,
        "prepare-run",
        {"include_all_threads": True},
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert [thread["id"] for thread in output["review_threads"]] == ["PRRT_live", "PRRT_manual"]
    assert output["review_threads"][1]["is_resolved"] is True


def test_prepare_run_returns_found_false_when_branch_has_no_pr(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeIssueGateway()

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="feature\n", stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    exit_code, output = _invoke_json(cli_group, "prepare-run", {}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["found"] is False
    assert output["current_branch"] == "feature"
    assert output["error"] == "no PR found"


def test_prepare_run_detached_head_returns_command_error(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeIssueGateway()

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "HEAD"]:
            return subprocess.CompletedProcess(
                cmd,
                128,
                stdout="",
                stderr="fatal: ref HEAD is not a symbolic ref",
            )
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    exit_code, output = _invoke_json(cli_group, "prepare-run", {}, fake)

    assert exit_code == 1
    assert output["success"] is False
    assert output["error_type"] == "detached_head"
    assert "checked-out branch" in output["message"]


def test_prepare_run_warns_when_restructured_file_detection_fails(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeIssueGateway(
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

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="feature\n", stderr="")
        if cmd == ["git", "diff", "--name-status", "-M", "-C", "origin/master...HEAD"]:
            return subprocess.CompletedProcess(
                cmd,
                128,
                stdout="",
                stderr="fatal: bad revision 'origin/master...HEAD'",
            )
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    exit_code, output = _invoke_json(cli_group, "prepare-run", {}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["restructured_files"] == []
    assert output["warnings"] == [
        "Failed to detect restructured files against origin/master: "
        "fatal: bad revision 'origin/master...HEAD'"
    ]


def test_resolve_thread_with_reply_fixed_uses_canonical_format(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "resolve-thread-with-reply",
        {
            "thread_id": "PRRT_abc",
            "mode": "fixed",
            "message": "Use the LBYL guard here.",
            "commit_sha": "abc1234",
        },
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["thread_id"] == "PRRT_abc"
    assert fake._resolved_thread_ids == ["PRRT_abc"]
    assert len(fake._thread_replies) == 1
    assert fake._thread_replies[0][0] == "PRRT_abc"
    assert "Fixed in commit abc1234: Use the LBYL guard here." in output["body"]
    assert RESOLUTION_MARKER in output["body"]
    assert "Addressed via _pr-address_ at " in output["body"]


def test_resolve_thread_with_reply_pre_existing_uses_standard_message(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "resolve-thread-with-reply",
        {
            "thread_id": "PRRT_old",
            "mode": "pre_existing",
            "message": None,
            "commit_sha": None,
        },
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["body"].startswith(PRE_EXISTING_REPLY)
    assert RESOLUTION_MARKER in output["body"]


def test_reply_to_review_posts_formatted_summary(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "reply-to-review",
        {
            "pr_number": 42,
            "review_author": "reviewer",
            "summary_markdown": "- Updated the helper flow\n- Added coverage",
        },
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert fake._comments == [(42, output["body"])]
    assert output["body"].startswith("Addressed review feedback from @reviewer:")
    assert "- Updated the helper flow" in output["body"]
    assert "_Addressed via pr-address at " in output["body"]


def test_reply_to_discussion_quotes_original_and_adds_reaction(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "reply-to-discussion",
        {
            "pr_number": 42,
            "comment_id": 9001,
            "comment_author": "reviewer",
            "original_body": "Can you update this?\nIt still reads oddly.",
            "response": "Done in the latest commit.",
        },
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["reaction_added"] is True
    assert fake._reactions == [(9001, "+1")]
    assert fake._comments == [(42, output["body"])]
    assert "> @reviewer wrote:" in output["body"]
    assert "> Can you update this?" in output["body"]
    assert "> It still reads oddly." in output["body"]
    assert "Done in the latest commit." in output["body"]


def test_reply_to_discussion_warns_but_succeeds_when_reaction_fails(
    cli_group: ClinkrGroup,
) -> None:
    class FailingReactionGateway(FakeIssueGateway):
        def add_reaction(self, comment_id: int, reaction: str):  # type: ignore[override]
            raise RuntimeError("reaction endpoint unavailable")

    fake = FailingReactionGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "reply-to-discussion",
        {
            "pr_number": 42,
            "comment_id": 9001,
            "comment_author": "reviewer",
            "original_body": "Can you update this?",
            "response": "Done in the latest commit.",
        },
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["reaction_added"] is False
    assert output["warning"] == (
        "Failed to add reaction to comment 9001: reaction endpoint unavailable"
    )


def test_reply_to_review_rejects_empty_summary(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "reply-to-review",
        {
            "pr_number": 42,
            "review_author": "reviewer",
            "summary_markdown": "   \n  ",
        },
        fake,
    )

    assert exit_code == 1
    assert output["success"] is False
    assert output["error_type"] == "invalid_request"
    assert "summary_markdown" in output["message"]
    assert fake._comments == []


def test_reply_to_discussion_rejects_empty_response(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "reply-to-discussion",
        {
            "pr_number": 42,
            "comment_id": 9001,
            "comment_author": "reviewer",
            "original_body": "Can you update this?",
            "response": "",
        },
        fake,
    )

    assert exit_code == 1
    assert output["success"] is False
    assert output["error_type"] == "invalid_request"
    assert "response" in output["message"]
    assert fake._comments == []


def test_resolve_thread_with_reply_fixed_requires_message(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "resolve-thread-with-reply",
        {
            "thread_id": "PRRT_abc",
            "mode": "fixed",
            "message": None,
            "commit_sha": "abc1234",
        },
        fake,
    )

    assert exit_code == 1
    assert output["success"] is False
    assert output["error_type"] == "invalid_request"
    assert "message" in output["message"]
    assert fake._resolved_thread_ids == []


def test_resolve_thread_with_reply_fixed_requires_commit_sha(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "resolve-thread-with-reply",
        {
            "thread_id": "PRRT_abc",
            "mode": "fixed",
            "message": "Use the LBYL guard.",
            "commit_sha": "   ",
        },
        fake,
    )

    assert exit_code == 1
    assert output["success"] is False
    assert output["error_type"] == "invalid_request"
    assert "commit_sha" in output["message"]
    assert fake._resolved_thread_ids == []


def test_resolve_thread_with_reply_explained_requires_message(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "resolve-thread-with-reply",
        {
            "thread_id": "PRRT_abc",
            "mode": "explained",
            "message": "",
            "commit_sha": None,
        },
        fake,
    )

    assert exit_code == 1
    assert output["success"] is False
    assert output["error_type"] == "invalid_request"
    assert "message" in output["message"]
    assert fake._resolved_thread_ids == []
