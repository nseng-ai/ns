"""Tests for GH facade."""

from twerk_core.gh.facade import GH
from twerk_core.gh.testing import FakeGhIssueGateway, FakePRGateway, make_fake_gh
from twerk_core.gh.types import GhIssue, PRReviewComment, PRReviewThread


def test_facade_delegates_to_pr_gateway() -> None:
    thread = PRReviewThread(
        id="PRRT_1",
        path="f.py",
        line=1,
        is_resolved=False,
        is_outdated=False,
        comments=(
            PRReviewComment(id=1, body="fix", author="rev", path="f.py", line=1, created_at=""),
        ),
    )
    fake_pr = FakePRGateway(review_threads={42: [thread]})
    gh = GH(pr=fake_pr, issue=FakeGhIssueGateway())

    result = gh.pr.get_review_threads(42)
    assert len(result) == 1
    assert result[0].id == "PRRT_1"


def test_facade_delegates_to_issue_gateway() -> None:
    issue = GhIssue(number=7, title="Pluggy", state="open", updated_at="")
    fake_issue = FakeGhIssueGateway(issues=(issue,))
    gh = GH(pr=FakePRGateway(), issue=fake_issue)

    result = gh.issue.list()
    assert result == (issue,)


def test_make_fake_gh_creates_defaults() -> None:
    gh = make_fake_gh()
    assert gh.pr.get_review_threads(1) == ()
    assert gh.issue.list() == ()


def test_make_fake_gh_accepts_custom_pr() -> None:
    fake_pr = FakePRGateway(numbers_by_branch={"main": 1})
    gh = make_fake_gh(pr=fake_pr)
    assert gh.pr.get_number_for_branch("main") == 1


def test_make_fake_gh_accepts_custom_issue() -> None:
    fake_issue = FakeGhIssueGateway(
        issues=(GhIssue(number=1, title="x", state="open", updated_at=""),)
    )
    gh = make_fake_gh(issue=fake_issue)
    assert tuple(i.number for i in gh.issue.list()) == (1,)
