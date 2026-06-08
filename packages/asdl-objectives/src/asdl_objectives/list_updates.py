"""Latest Objective update attribution for ``objective list``."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure, PathTouch


@dataclass(frozen=True)
class ObjectiveTouchCandidate:
    branch: str
    ref_name: str
    touch: PathTouch
    is_work_branch: bool


@dataclass(frozen=True)
class ObjectiveUpdateAttribution:
    latest_update_iso: str | None
    latest_work_branch: str | None


def touch_updated_iso(touch: PathTouch | None) -> str | None:
    if touch is None:
        return None
    if parse_iso_datetime(touch.committed_iso) is None:
        return None
    return touch.committed_iso


def latest_touch_candidate(
    candidates: tuple[ObjectiveTouchCandidate, ...],
) -> ObjectiveTouchCandidate | None:
    parsed_candidates: list[tuple[datetime, ObjectiveTouchCandidate]] = []
    for candidate in candidates:
        parsed_dt = parse_iso_datetime(candidate.touch.committed_iso)
        if parsed_dt is not None:
            parsed_candidates.append((parsed_dt, candidate))

    if parsed_candidates:
        latest_dt = max(parsed_dt for parsed_dt, _candidate in parsed_candidates)
        latest_candidates = [
            candidate for parsed_dt, candidate in parsed_candidates if parsed_dt == latest_dt
        ]
        return min(latest_candidates, key=lambda candidate: candidate.ref_name)

    if not candidates:
        return None
    return min(candidates, key=lambda candidate: candidate.ref_name)


def latest_work_branch(
    git: GitGateway,
    latest_touch: ObjectiveTouchCandidate | None,
    candidates: tuple[ObjectiveTouchCandidate, ...],
) -> str | None:
    if latest_touch is None:
        return None

    matching_work_candidates = [
        candidate
        for candidate in candidates
        if candidate.is_work_branch and candidate.touch.oid == latest_touch.touch.oid
    ]
    if not matching_work_candidates:
        return None

    return min(
        matching_work_candidates,
        key=lambda candidate: (_distance_from_touch(git, candidate), candidate.branch),
    ).branch


def attribute_latest_objective_update(
    git: GitGateway,
    candidates: tuple[ObjectiveTouchCandidate, ...],
) -> ObjectiveUpdateAttribution:
    latest_touch = latest_touch_candidate(candidates)
    latest_update_iso = touch_updated_iso(latest_touch.touch) if latest_touch is not None else None
    return ObjectiveUpdateAttribution(
        latest_update_iso=latest_update_iso,
        latest_work_branch=latest_work_branch(git, latest_touch, candidates),
    )


def _distance_from_touch(git: GitGateway, candidate: ObjectiveTouchCandidate) -> int:
    distance = git.count_commits_in_range(f"{candidate.touch.oid}..{candidate.branch}")
    if isinstance(distance, GitCommandFailure):
        return 1_000_000_000
    return distance


def parse_iso_datetime(iso_timestamp: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
