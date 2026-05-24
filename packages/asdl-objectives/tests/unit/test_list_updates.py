from __future__ import annotations

import pytest

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathTouch
from asdl_objectives.list_updates import (
    ObjectiveTouchCandidate,
    attribute_latest_objective_update,
    latest_touch_candidate,
    touch_updated_iso,
)


def test_attribute_latest_objective_update_no_candidates_returns_empty_attribution() -> None:
    attribution = attribute_latest_objective_update(FakeGitGateway(), ())

    assert attribution.latest_update_iso is None
    assert attribution.latest_work_branch is None


def test_attribute_latest_update_single_work_candidate_sets_update_and_work_branch() -> None:
    attribution = _attribute((_candidate("feat/a", "2026-05-20T10:00:00Z"),))

    assert attribution.latest_update_iso == "2026-05-20T10:00:00Z"
    assert attribution.latest_work_branch == "feat/a"


def test_attribute_latest_objective_update_single_base_candidate_has_no_work_branch() -> None:
    attribution = _attribute((_candidate("master", "2026-05-20T10:00:00Z", is_work=False),))

    assert attribution.latest_update_iso == "2026-05-20T10:00:00Z"
    assert attribution.latest_work_branch is None


def test_attribute_latest_objective_update_newer_base_beats_older_work_candidate() -> None:
    attribution = _attribute(
        (
            _candidate("master", "2026-05-20T12:00:00Z", oid="base", is_work=False),
            _candidate("feat/a", "2026-05-20T10:00:00Z", oid="work"),
        )
    )

    assert attribution.latest_update_iso == "2026-05-20T12:00:00Z"
    assert attribution.latest_work_branch is None


def test_attribute_latest_objective_update_newer_work_beats_older_base_candidate() -> None:
    attribution = _attribute(
        (
            _candidate("master", "2026-05-20T10:00:00Z", oid="base", is_work=False),
            _candidate("feat/a", "2026-05-20T12:00:00Z", oid="work"),
        )
    )

    assert attribution.latest_update_iso == "2026-05-20T12:00:00Z"
    assert attribution.latest_work_branch == "feat/a"


def test_latest_touch_candidate_ignores_invalid_timestamps_when_valid_timestamps_exist() -> None:
    latest = latest_touch_candidate(
        (
            _candidate("refs-low", "not-a-date", ref_name="refs/heads/a"),
            _candidate("refs-high", "2026-05-20T12:00:00Z", ref_name="refs/heads/z"),
        )
    )

    assert latest is not None
    assert latest.branch == "refs-high"


def test_latest_touch_candidate_falls_back_to_ref_name_when_all_timestamps_are_invalid() -> None:
    latest = latest_touch_candidate(
        (
            _candidate("feat/z", "not-a-date", ref_name="refs/heads/z"),
            _candidate("feat/a", "also-not-a-date", ref_name="refs/heads/a"),
        )
    )

    assert latest is not None
    assert latest.branch == "feat/a"


@pytest.mark.parametrize(
    "iso_timestamp",
    [
        "2026-05-20T10:00:00Z",
        "2026-05-20T06:00:00-04:00",
        "2026-05-20T10:00:00",
    ],
)
def test_touch_updated_iso_accepts_z_offset_and_naive_timestamps(iso_timestamp: str) -> None:
    assert touch_updated_iso(PathTouch(oid="oid", committed_iso=iso_timestamp)) == iso_timestamp


def test_latest_touch_candidate_treats_naive_timestamps_as_utc() -> None:
    latest = latest_touch_candidate(
        (
            _candidate("naive", "2026-05-20T12:00:00"),
            _candidate("offset", "2026-05-20T11:00:00+00:00"),
        )
    )

    assert latest is not None
    assert latest.branch == "naive"


def test_latest_touch_candidate_ties_by_ref_name_for_same_timestamp() -> None:
    latest = latest_touch_candidate(
        (
            _candidate("feat/z", "2026-05-20T10:00:00Z", ref_name="refs/heads/z"),
            _candidate("feat/a", "2026-05-20T10:00:00Z", ref_name="refs/heads/a"),
        )
    )

    assert latest is not None
    assert latest.branch == "feat/a"


def test_same_oid_on_multiple_work_branches_uses_nearest_branch() -> None:
    attribution = _attribute(
        (
            _candidate("feat/a", "2026-05-20T10:00:00Z", oid="shared"),
            _candidate("feat/b", "2026-05-20T10:00:00Z", oid="shared"),
        ),
        commit_count_by_range={
            "shared..feat/a": 4,
            "shared..feat/b": 1,
        },
    )

    assert attribution.latest_work_branch == "feat/b"


def test_same_oid_and_distance_uses_lexicographic_branch() -> None:
    attribution = _attribute(
        (
            _candidate("feat/b", "2026-05-20T10:00:00Z", oid="shared"),
            _candidate("feat/a", "2026-05-20T10:00:00Z", oid="shared"),
        ),
        commit_count_by_range={
            "shared..feat/a": 2,
            "shared..feat/b": 2,
        },
    )

    assert attribution.latest_work_branch == "feat/a"


def test_attribute_latest_objective_update_distance_failure_ranks_after_valid_distance() -> None:
    attribution = _attribute(
        (
            _candidate("feat/a", "2026-05-20T10:00:00Z", oid="shared"),
            _candidate("feat/b", "2026-05-20T10:00:00Z", oid="shared"),
        ),
        commit_count_by_range={
            "shared..feat/a": GitCommandFailure(message="fatal", returncode=128),
            "shared..feat/b": 9,
        },
    )

    assert attribution.latest_work_branch == "feat/b"


def test_base_latest_touch_with_same_oid_on_work_branch_chooses_work_branch() -> None:
    attribution = _attribute(
        (
            _candidate("master", "2026-05-20T12:00:00Z", oid="shared", is_work=False),
            _candidate("feat/a", "2026-05-20T10:00:00Z", oid="shared"),
        )
    )

    assert attribution.latest_update_iso == "2026-05-20T12:00:00Z"
    assert attribution.latest_work_branch == "feat/a"


def test_touch_updated_iso_returns_none_for_invalid_timestamp() -> None:
    assert touch_updated_iso(PathTouch(oid="oid", committed_iso="not-a-date")) is None


def _attribute(
    candidates: tuple[ObjectiveTouchCandidate, ...],
    *,
    commit_count_by_range: dict[str, int | GitCommandFailure] | None = None,
):
    return attribute_latest_objective_update(
        FakeGitGateway(commit_count_by_range=commit_count_by_range),
        candidates,
    )


def _candidate(
    branch: str,
    committed_iso: str,
    *,
    oid: str | None = None,
    is_work: bool = True,
    ref_name: str | None = None,
) -> ObjectiveTouchCandidate:
    return ObjectiveTouchCandidate(
        branch=branch,
        ref_name=ref_name or f"refs/heads/{branch}",
        touch=PathTouch(oid=oid or f"{branch}-oid", committed_iso=committed_iso),
        is_work_branch=is_work,
    )
