from __future__ import annotations

import pytest

from asdl_objectives.list_inventory import ObjectiveBranchInventory, ObjectiveRecordStatus
from asdl_objectives.list_status import (
    ObjectiveStatus,
    ObjectiveStatusFilter,
    ObjectiveStatusProjectionEntry,
    matches_status_filter,
    project_objective_statuses,
    select_status_source,
)


def test_select_status_source_base_mode_selects_base_branch() -> None:
    selection = select_status_source(
        base_branch="master",
        filter_current=False,
        current_branch="feat/current",
    )

    assert selection.status_source == "base"
    assert selection.status_source_branch == "master"
    assert selection.current_branch is None
    assert selection.filtered_to_current is False


def test_select_status_source_current_mode_selects_current_branch() -> None:
    selection = select_status_source(
        base_branch="master",
        filter_current=True,
        current_branch="feat/current",
    )

    assert selection.status_source == "current"
    assert selection.status_source_branch == "feat/current"
    assert selection.current_branch == "feat/current"
    assert selection.filtered_to_current is True


def test_project_objective_statuses_current_mode_detached_head_returns_empty_projection() -> None:
    source = select_status_source(base_branch="master", filter_current=True, current_branch=None)

    projection = project_objective_statuses(
        _inventory({"feat/a": {"alpha": "open"}}),
        local_branches=("master", "feat/a"),
        base_branch="master",
        source=source,
        status_filter="active",
    )

    assert projection.source == source
    assert projection.entries == ()


def test_project_objective_statuses_base_open_record_projects_open() -> None:
    entries = _project({"master": {"alpha": "open"}})

    assert _entry_statuses(entries) == (("alpha", "open", True, "open"),)


def test_project_objective_statuses_base_closed_record_projects_closed() -> None:
    entries = _project({"master": {"alpha": "closed"}})

    assert _entry_statuses(entries) == (("alpha", "closed", True, "closed"),)


def test_project_objective_statuses_work_only_record_projects_in_flight() -> None:
    entries = _project({"feat/a": {"alpha": "open"}}, local_branches=("master", "feat/a"))

    assert _entry_statuses(entries) == (("alpha", "in-flight", False, None),)


def test_project_objective_statuses_base_open_wins_over_closed_work_branch() -> None:
    entries = _project(
        {
            "master": {"alpha": "open"},
            "feat/a": {"alpha": "closed"},
        },
        local_branches=("master", "feat/a"),
    )

    assert _entry_statuses(entries) == (("alpha", "open", True, "open"),)


def test_project_objective_statuses_base_closed_wins_over_open_work_branch() -> None:
    entries = _project(
        {
            "master": {"alpha": "closed"},
            "feat/a": {"alpha": "open"},
        },
        local_branches=("master", "feat/a"),
    )

    assert _entry_statuses(entries) == (("alpha", "closed", True, "closed"),)


def test_project_objective_statuses_current_mode_includes_only_current_branch_records() -> None:
    entries = _project(
        {
            "feat/current": {"alpha": "open"},
            "feat/other": {"beta": "open"},
        },
        local_branches=("master", "feat/current", "feat/other"),
        filter_current=True,
        current_branch="feat/current",
    )

    assert _entry_statuses(entries) == (("alpha", "open", True, "open"),)


def test_current_mode_excludes_work_only_records_on_other_branches() -> None:
    entries = _project(
        {"feat/other": {"beta": "open"}},
        local_branches=("master", "feat/current", "feat/other"),
        filter_current=True,
        current_branch="feat/current",
    )

    assert entries == ()


def test_project_objective_statuses_current_mode_uses_current_branch_closed_marker() -> None:
    entries = _project(
        {"feat/current": {"alpha": "closed"}},
        local_branches=("master", "feat/current"),
        filter_current=True,
        current_branch="feat/current",
    )

    assert _entry_statuses(entries) == (("alpha", "closed", True, "closed"),)


def test_project_objective_statuses_entries_are_slug_sorted() -> None:
    entries = _project(
        {"feat/a": {"zeta": "open", "alpha": "open"}},
        local_branches=("master", "feat/a"),
    )

    assert [entry.slug for entry in entries] == ["alpha", "zeta"]


def test_project_objective_statuses_active_filter_returns_open_and_in_flight() -> None:
    entries = _project(
        {
            "master": {"closed-one": "closed", "open-one": "open"},
            "feat/a": {"in-flight-one": "open"},
        },
        local_branches=("master", "feat/a"),
        status_filter="active",
    )

    assert _entry_statuses(entries) == (
        ("in-flight-one", "in-flight", False, None),
        ("open-one", "open", True, "open"),
    )


def test_project_objective_statuses_all_filter_includes_all_statuses() -> None:
    entries = _project(
        {
            "master": {"closed-one": "closed", "open-one": "open"},
            "feat/a": {"in-flight-one": "open"},
        },
        local_branches=("master", "feat/a"),
        status_filter="all",
    )

    assert [entry.status for entry in entries] == ["closed", "in-flight", "open"]


@pytest.mark.parametrize(
    ("status", "status_filter", "expected"),
    [
        ("open", "open", True),
        ("open", "closed", False),
        ("closed", "closed", True),
        ("in-flight", "in-flight", True),
        ("in-flight", "open", False),
        ("closed", "active", False),
        ("in-flight", "active", True),
        ("closed", "all", True),
    ],
)
def test_matches_status_filter_exact_filters_work(
    status: ObjectiveStatus,
    status_filter: ObjectiveStatusFilter,
    expected: bool,
) -> None:
    assert matches_status_filter(status, status_filter) is expected


def _inventory(
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]],
) -> ObjectiveBranchInventory:
    return ObjectiveBranchInventory(records_by_branch=records_by_branch)


def _project(
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]],
    *,
    local_branches: tuple[str, ...] = ("master",),
    base_branch: str = "master",
    filter_current: bool = False,
    current_branch: str | None = None,
    status_filter: ObjectiveStatusFilter = "all",
) -> tuple[ObjectiveStatusProjectionEntry, ...]:
    source = select_status_source(
        base_branch=base_branch,
        filter_current=filter_current,
        current_branch=current_branch,
    )
    return project_objective_statuses(
        _inventory(records_by_branch),
        local_branches=local_branches,
        base_branch=base_branch,
        source=source,
        status_filter=status_filter,
    ).entries


def _entry_statuses(
    entries: tuple[ObjectiveStatusProjectionEntry, ...],
) -> tuple[tuple[str, ObjectiveStatus, bool, ObjectiveRecordStatus | None], ...]:
    return tuple(
        (
            entry.slug,
            entry.status,
            entry.present_on_status_source,
            entry.status_source_record_status,
        )
        for entry in entries
    )
