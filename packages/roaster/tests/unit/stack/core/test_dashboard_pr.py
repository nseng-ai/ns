from __future__ import annotations

from roaster.stack.core.dashboard_pr import stack_dashboard_pr_number, stack_dashboard_pr_url


def test_stack_dashboard_pr_helpers_accept_numbers_urls_and_invalid_values() -> None:
    assert stack_dashboard_pr_number("123") == 123
    assert stack_dashboard_pr_number("https://github.com/acme/widgets/issues/456") == 456
    assert stack_dashboard_pr_number("not-a-pr") is None
    assert stack_dashboard_pr_number(None) is None
    assert stack_dashboard_pr_url("https://github.com/acme/widgets/pull/123") == (
        "https://github.com/acme/widgets/pull/123"
    )
    assert stack_dashboard_pr_url("123") is None
