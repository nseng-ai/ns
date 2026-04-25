"""Tests for the dedicated FakePRGateway (separate from FakeIssueGateway)."""

from __future__ import annotations

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary


def _make_pr(state: PRState) -> PRSummary:
    return PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/twerk/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state=state,
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


def test_fake_pr_gateway_default_merge_provenance_is_none() -> None:
    """Existing call sites that don't supply merge provenance get ``None`` back."""
    fake = FakePRGateway(prs_by_branch={"feature": _make_pr("OPEN")})

    result = fake.get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.merged_at is None
    assert result.merge_commit_oid is None


def test_fake_pr_gateway_round_trips_merge_provenance() -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/twerk/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state="MERGED",
        merged_at="2026-04-01T12:00:00Z",
        merge_commit_oid="deadbeef",
    )
    fake = FakePRGateway(prs_by_branch={"feature": pr})

    result = fake.get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.merged_at == "2026-04-01T12:00:00Z"
    assert result.merge_commit_oid == "deadbeef"
