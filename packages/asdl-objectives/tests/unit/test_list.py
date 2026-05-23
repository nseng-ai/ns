from __future__ import annotations

from asdl_objectives.list import _open_objective_slugs_from_paths


def test_open_objective_slugs_from_paths_ignores_gitkeep_and_nested_closed_marker() -> None:
    paths = (
        ".asdl/objectives/.gitkeep",
        ".asdl/objectives/open/objective.md",
        ".asdl/objectives/open/updates/closed.md",
        ".asdl/objectives/closed/objective.md",
        ".asdl/objectives/closed/closed.md",
    )

    assert _open_objective_slugs_from_paths(paths) == ("open",)
