"""Unit tests for prepare-run workflow policy."""

from pathlib import Path

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRReview,
    PRReviewComment,
    PRReviewState,
    PRReviewThread,
    PRReviewThreadState,
    PRSummary,
)
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile
from asdl_pr_address.cli.pr_address.prepare_run_workflow import (
    PreparedPrAddressRun,
    PrepareRunNoPr,
    PrepareRunPrLookupFailed,
    prepare_pr_address_run,
)
from asdl_pr_address.cli.pr_address.reply_formatting import RESOLUTION_MARKER


def _pr(number: int = 42) -> PRSummary:
    return PRSummary(
        number=number,
        title="Update helper surface",
        url=f"https://example.com/pr/{number}",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )


def _review(
    review_id: str,
    *,
    state: PRReviewState = "CHANGES_REQUESTED",
    body: str = "Please tighten the workflow.",
) -> PRReview:
    return PRReview(
        id=review_id,
        author="reviewer",
        body=body,
        state=state,
        submitted_at="2026-04-15T12:00:00Z",
    )


def _comment(comment_id: int, body: str, *, author: str = "reviewer") -> PRReviewComment:
    return PRReviewComment(
        id=comment_id,
        body=body,
        author=author,
        path="src/app.py",
        line=10,
        start_line=7,
        created_at=f"2026-04-15T12:0{comment_id}:00Z",
    )


def _thread(
    thread_id: str,
    *,
    is_resolved: bool = False,
    comments: tuple[PRReviewComment, ...] | None = None,
) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path="src/app.py",
        line=10,
        start_line=7,
        is_resolved=is_resolved,
        is_outdated=False,
        comments=comments if comments is not None else (_comment(1, "Please update this helper."),),
    )


def _discussion(comment_id: int = 9001) -> PRDiscussionComment:
    return PRDiscussionComment(
        id=comment_id,
        body="Top-level PR discussion.",
        author="reviewer",
        url=f"https://example.com/pr/42#issuecomment-{comment_id}",
    )


def _git_for_feature(
    *,
    files_result: tuple[RestructuredFile, ...] | GitCommandFailure = (),
) -> FakeGitGateway:
    return FakeGitGateway(
        current_branch_by_path={Path.cwd(): "feature"},
        restructured_files_by_key={(Path.cwd(), "master"): files_result},
    )


class _FailingUnresolvePRGateway(FakePRGateway):
    def unresolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        raise RuntimeError("boom")


def test_prepare_pr_address_run_reopens_contested_threads_and_normalizes_feedback() -> None:
    review = _review("PRR_1")
    live_thread = _thread("PRRT_live")
    contested_thread = _thread(
        "PRRT_contested",
        is_resolved=True,
        comments=(
            _comment(2, f"Fixed.\n\n{RESOLUTION_MARKER}", author="github-actions[bot]"),
            _comment(3, "This still needs work."),
        ),
    )
    manual_thread = _thread("PRRT_manual", is_resolved=True)
    discussion = _discussion()
    restructured_file = RestructuredFile(
        status="R100",
        old_path="src/old.py",
        new_path="src/new.py",
        similarity=100,
    )
    fake = FakePRGateway(
        prs_by_branch={"feature": _pr()},
        reviews={42: (review,)},
        review_threads={42: (live_thread, contested_thread, manual_thread)},
        discussion_comments={42: (discussion,)},
    )

    outcome = prepare_pr_address_run(
        fake,
        _git_for_feature(files_result=(restructured_file,)),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, PreparedPrAddressRun)
    assert outcome.current_branch == "feature"
    assert outcome.number == 42
    assert outcome.reviews == (review,)
    assert outcome.discussion_comments == (discussion,)
    assert outcome.reopened_thread_ids == ("PRRT_contested",)
    assert fake.unresolved_thread_ids == ("PRRT_contested",)
    assert [thread.id for thread in outcome.review_threads] == ["PRRT_live", "PRRT_contested"]
    reopened_thread = outcome.review_threads[1]
    assert reopened_thread.is_resolved is False
    assert reopened_thread.start_line == 7
    assert outcome.restructured_files == (restructured_file,)
    assert outcome.warnings == ()


def test_prepare_pr_address_run_include_all_threads_keeps_still_resolved_threads() -> None:
    live_thread = _thread("PRRT_live")
    resolved_thread = _thread("PRRT_resolved", is_resolved=True)
    fake = FakePRGateway(
        prs_by_branch={"feature": _pr()},
        review_threads={42: (live_thread, resolved_thread)},
    )

    outcome = prepare_pr_address_run(
        fake,
        _git_for_feature(),
        cwd=Path.cwd(),
        include_all_threads=True,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, PreparedPrAddressRun)
    assert [thread.id for thread in outcome.review_threads] == ["PRRT_live", "PRRT_resolved"]
    assert outcome.review_threads[1].is_resolved is True


def test_prepare_pr_address_run_filters_empty_reviews_by_default() -> None:
    empty_commented = _review("empty_commented", state="COMMENTED", body="")
    empty_approved = _review("empty_approved", state="APPROVED", body="   ")
    empty_changes_requested = _review("empty_changes_requested", state="CHANGES_REQUESTED", body="")
    reviews = (empty_commented, empty_approved, empty_changes_requested)

    default_fake = FakePRGateway(prs_by_branch={"feature": _pr()}, reviews={42: reviews})
    default_outcome = prepare_pr_address_run(
        default_fake,
        _git_for_feature(),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(default_outcome, PreparedPrAddressRun)
    assert default_outcome.reviews == (empty_changes_requested,)

    inclusive_fake = FakePRGateway(prs_by_branch={"feature": _pr()}, reviews={42: reviews})
    inclusive_outcome = prepare_pr_address_run(
        inclusive_fake,
        _git_for_feature(),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=True,
    )

    assert isinstance(inclusive_outcome, PreparedPrAddressRun)
    assert inclusive_outcome.reviews == reviews


def test_prepare_pr_address_run_returns_no_pr_for_lookup_miss() -> None:
    outcome = prepare_pr_address_run(
        FakePRGateway(),
        _git_for_feature(),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, PrepareRunNoPr)
    assert outcome.current_branch == "feature"
    assert outcome.error == "no PR found"
    assert outcome.returncode == 1


def test_prepare_pr_address_run_returns_pr_lookup_failure() -> None:
    failure = PRGatewayFailure(stderr="gh auth failed", returncode=4)
    outcome = prepare_pr_address_run(
        FakePRGateway(lookup_failure=failure),
        _git_for_feature(),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, PrepareRunPrLookupFailed)
    assert outcome.current_branch == "feature"
    assert outcome.failure == failure


def test_prepare_pr_address_run_returns_detached_head() -> None:
    outcome = prepare_pr_address_run(
        FakePRGateway(),
        FakeGitGateway(current_branch_by_path={Path.cwd(): DetachedHead()}),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, DetachedHead)


def test_prepare_pr_address_run_returns_git_failure_for_branch_lookup_failure() -> None:
    failure = GitCommandFailure(message="fatal: not a git repository", returncode=128)
    outcome = prepare_pr_address_run(
        FakePRGateway(),
        FakeGitGateway(current_branch_by_path={Path.cwd(): failure}),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert outcome == failure


def test_prepare_pr_address_run_warns_when_restructured_file_detection_fails() -> None:
    failure = GitCommandFailure(message="git diff failed", returncode=128)
    outcome = prepare_pr_address_run(
        FakePRGateway(prs_by_branch={"feature": _pr()}),
        _git_for_feature(files_result=failure),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, PreparedPrAddressRun)
    assert outcome.restructured_files == ()
    assert outcome.warnings == ("git diff failed",)


def test_prepare_pr_address_run_warns_when_reopen_contested_thread_fails() -> None:
    live_thread = _thread("PRRT_live")
    contested_thread = _thread(
        "PRRT_contested",
        is_resolved=True,
        comments=(
            _comment(2, f"Fixed.\n\n{RESOLUTION_MARKER}", author="github-actions[bot]"),
            _comment(3, "This still needs work."),
        ),
    )
    fake = _FailingUnresolvePRGateway(
        prs_by_branch={"feature": _pr()},
        review_threads={42: (live_thread, contested_thread)},
    )

    outcome = prepare_pr_address_run(
        fake,
        _git_for_feature(),
        cwd=Path.cwd(),
        include_all_threads=False,
        include_empty_reviews=False,
    )

    assert isinstance(outcome, PreparedPrAddressRun)
    assert outcome.warnings == ("Failed to reopen contested thread PRRT_contested: boom",)
    assert outcome.reopened_thread_ids == ()
    assert fake.unresolved_thread_ids == ()
    assert [thread.id for thread in outcome.review_threads] == ["PRRT_live"]
