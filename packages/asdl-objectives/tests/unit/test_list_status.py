from __future__ import annotations

from typing import get_args

import pytest

from asdl_objectives.list_status import (
    ObjectiveStatus,
    ObjectiveStatusFilter,
    matches_status_filter,
)


@pytest.mark.parametrize(
    ("status", "status_filter", "expected"),
    [
        ("open", "active", True),
        ("closed", "active", False),
        ("open", "all", True),
        ("closed", "all", True),
        ("open", "open", True),
        ("closed", "open", False),
        ("closed", "closed", True),
        ("open", "closed", False),
    ],
)
def test_matches_status_filter_checkout_local_statuses(
    status: ObjectiveStatus,
    status_filter: ObjectiveStatusFilter,
    expected: bool,
) -> None:
    assert matches_status_filter(status, status_filter) is expected


def test_in_flight_is_not_a_checkout_local_status_or_filter() -> None:
    assert "in-flight" not in get_args(ObjectiveStatus)
    assert "in-flight" not in get_args(ObjectiveStatusFilter)
