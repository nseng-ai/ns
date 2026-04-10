"""Tests for FakeGHIssueGateway."""

from twerk_core.gh.testing import FakeGHIssueGateway
from twerk_core.gh.types import GHIssue


def _make_issue(number: int, *, state: str = "open") -> GHIssue:
    return GHIssue(
        number=number,
        title=f"Issue {number}",
        state=state,
        updated_at="2026-04-08T12:00:00Z",
    )


def test_fake_issue_gateway_list_default_filters_open_only() -> None:
    fake = FakeGHIssueGateway(
        issues=(_make_issue(1, state="open"), _make_issue(2, state="closed")),
    )
    result = fake.list()
    assert tuple(i.number for i in result) == (1,)


def test_fake_issue_gateway_list_state_closed_filters_closed_only() -> None:
    fake = FakeGHIssueGateway(
        issues=(_make_issue(1, state="open"), _make_issue(2, state="closed")),
    )
    result = fake.list(state="closed")
    assert tuple(i.number for i in result) == (2,)


def test_fake_issue_gateway_list_state_all_returns_everything() -> None:
    issues = (_make_issue(1, state="open"), _make_issue(2, state="closed"))
    fake = FakeGHIssueGateway(issues=issues)
    assert fake.list(state="all") == issues


def test_fake_issue_gateway_list_label_argument_is_accepted_but_ignored() -> None:
    """The fake takes label for interface compatibility but does not filter on it.

    Tests seed the fake with the issues they want returned. Real callers
    rely on GHCliIssueGateway to apply label filtering server-side.
    """
    fake = FakeGHIssueGateway(issues=(_make_issue(1, state="open"),))
    assert fake.list(label="twerk-objective") == fake.list()


def test_fake_issue_gateway_list_empty_default() -> None:
    fake = FakeGHIssueGateway()
    assert fake.list() == ()
