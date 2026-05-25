from __future__ import annotations

import pytest

from asdl_objectives.objective_paths import (
    active_objective_record_path,
    archived_objective_record_path,
    is_valid_objective_slug,
)


@pytest.mark.parametrize("slug", ("alpha", "objective-archive-move-command", "foo.bar"))
def test_is_valid_objective_slug_accepts_single_slug(slug: str) -> None:
    assert is_valid_objective_slug(slug) is True


@pytest.mark.parametrize("slug", ("", ".", "..", "foo/bar", ".asdl/objectives/foo", "foo\\bar"))
def test_is_valid_objective_slug_rejects_path_shaped_slug(slug: str) -> None:
    assert is_valid_objective_slug(slug) is False


def test_active_objective_record_path_constructs_relative_path() -> None:
    assert active_objective_record_path("alpha").as_posix() == ".asdl/objectives/alpha"


def test_archived_objective_record_path_constructs_relative_path() -> None:
    assert archived_objective_record_path("alpha").as_posix() == ".asdl/objective-archive/alpha"
