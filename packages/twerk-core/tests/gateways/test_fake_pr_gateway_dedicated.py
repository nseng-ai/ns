"""Tests for the dedicated FakePRGateway."""

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRSummary


def test_fake_pr_gateway_returns_seeded_prs() -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/twerk/pull/42",
        head_ref_name="feature",
        head_ref_oid="abc123",
        base_ref_name="main",
        state="OPEN",
    )
    fake = FakePRGateway(prs_by_branch_state={("feature", "all"): (pr,)})

    assert fake.find_prs_for_branch("feature", state="all") == (pr,)
    assert fake.find_prs_for_branch("feature", state="open") == ()


def test_fake_pr_gateway_returns_seeded_errors() -> None:
    error = PRLookupError(stderr="gh broke", returncode=2)
    fake = FakePRGateway(errors_by_branch_state={("feature", "all"): error})

    assert fake.find_prs_for_branch("feature", state="all") == error
