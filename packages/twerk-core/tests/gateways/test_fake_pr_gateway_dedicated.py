"""Tests for the dedicated FakePRGateway (separate from FakeIssueGateway)."""

from __future__ import annotations

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRSummary


def _make_pr(state: str) -> PRSummary:
    return PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/twerk/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state=state,  # type: ignore[arg-type]
    )


def test_fake_pr_gateway_returns_seeded_pr() -> None:
    pr = _make_pr("OPEN")
    fake = FakePRGateway(prs_by_branch={"feature": pr})

    assert fake.get_pr_for_branch("feature") == pr


def test_fake_pr_gateway_returns_error_when_missing() -> None:
    fake = FakePRGateway()

    result = fake.get_pr_for_branch("nonexistent")

    assert isinstance(result, PRLookupError)
    assert result.returncode == 1


def test_fake_pr_gateway_preserves_state_field() -> None:
    pr = _make_pr("MERGED")
    fake = FakePRGateway(prs_by_branch={"feature": pr})

    result = fake.get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.state == "MERGED"
