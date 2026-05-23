from __future__ import annotations

from asdl_objectives.list import _objective_statuses_from_paths


def test_objective_statuses_from_paths_reports_statuses_sorted_by_slug() -> None:
    paths = (
        ".asdl/objectives/.gitkeep",
        ".asdl/objectives/zeta/objective.md",
        ".asdl/objectives/zeta/updates/closed.md",
        ".asdl/objectives/closed/objective.md",
        ".asdl/objectives/closed/closed.md",
        ".asdl/objectives/alpha/objective.md",
    )

    assert _objective_statuses_from_paths(paths) == (
        ("alpha", "open"),
        ("closed", "closed"),
        ("zeta", "open"),
    )
