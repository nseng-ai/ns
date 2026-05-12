"""First read-only live conformance slice for PR gateway lookup."""

from __future__ import annotations

import pytest

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRLookupError
from live_conformance.github.fixtures import PR_BASIC_LOOKUP

pytestmark = pytest.mark.live_github


def test_pr_gateway_lookup_by_branch_matches_persistent_fixture(
    pr_gateway: PRGateway,
) -> None:
    result = pr_gateway.get_pr_for_branch(PR_BASIC_LOOKUP.head_branch)

    if isinstance(result, PRLookupError):
        pytest.fail(
            "GitHub conformance setup failure: persistent PR fixture "
            f"{PR_BASIC_LOOKUP.name!r} was not found by branch "
            f"{PR_BASIC_LOOKUP.head_branch!r}: {result.stderr}"
        )
    assert result.number == PR_BASIC_LOOKUP.number
    assert result.head_ref_name == PR_BASIC_LOOKUP.head_branch
    assert result.state == PR_BASIC_LOOKUP.expected_state
    assert result.title.startswith(PR_BASIC_LOOKUP.expected_title_prefix)
