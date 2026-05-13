from __future__ import annotations

import pytest

from asdl_core.git.types import GitPathChange
from asdl_initiatives.exec.tracking_gate_facts import (
    InvalidInitiativeSelection,
    NormalizedInitiativeSelection,
    classify_git_path_change,
    normalize_initiative_selection,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "initiative-cli-pushdown",
            NormalizedInitiativeSelection(
                slug="initiative-cli-pushdown",
                path=".asdl/initiatives/initiative-cli-pushdown",
            ),
        ),
        (
            ".asdl/initiatives/initiative-cli-pushdown",
            NormalizedInitiativeSelection(
                slug="initiative-cli-pushdown",
                path=".asdl/initiatives/initiative-cli-pushdown",
            ),
        ),
        (
            ".asdl/initiatives/initiative-cli-pushdown/updates/001.md",
            NormalizedInitiativeSelection(
                slug="initiative-cli-pushdown",
                path=".asdl/initiatives/initiative-cli-pushdown",
            ),
        ),
    ],
)
def test_normalize_initiative_selection_accepts_slug_and_record_paths(
    raw: str,
    expected: NormalizedInitiativeSelection,
) -> None:
    assert normalize_initiative_selection(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        ".",
        "..",
        "docs/plan.md",
        ".asdl/objectives/foo",
        ".asdl/initiatives",
        "foo/bar",
        "/tmp/repo/.asdl/initiatives/foo",
        ".asdl/initiatives/foo/../bar",
        r".asdl\initiatives\foo",
    ],
)
def test_normalize_initiative_selection_rejects_paths_outside_initiatives(raw: str) -> None:
    result = normalize_initiative_selection(raw)

    assert isinstance(result, InvalidInitiativeSelection)


def test_classify_git_path_change_selected_initiative() -> None:
    classification = classify_git_path_change(
        GitPathChange(status="M", path=".asdl/initiatives/alpha/roadmap.md"),
        "alpha",
    )

    assert classification.bucket == "selected_initiative"
    assert classification.initiative_slugs == ("alpha",)


def test_classify_git_path_change_other_initiative() -> None:
    classification = classify_git_path_change(
        GitPathChange(status="M", path=".asdl/initiatives/beta/initiative.md"),
        "alpha",
    )

    assert classification.bucket == "other_initiatives"
    assert classification.initiative_slugs == ("beta",)


@pytest.mark.parametrize(
    "path",
    (
        "packages/asdl/example.py",
        ".asdl/initiatives/.gitkeep",
        ".asdl/initiatives/not-a-record.md",
    ),
)
def test_classify_git_path_change_non_initiative(path: str) -> None:
    classification = classify_git_path_change(
        GitPathChange(status="M", path=path),
        "alpha",
    )

    assert classification.bucket == "non_initiative"
    assert classification.initiative_slugs == ()


def test_classify_git_path_change_uses_old_and_new_paths_for_renames() -> None:
    classification = classify_git_path_change(
        GitPathChange(
            status="R100",
            path=".asdl/initiatives/beta/roadmap.md",
            old_path=".asdl/initiatives/alpha/roadmap.md",
        ),
        "alpha",
    )

    assert classification.bucket == "selected_initiative"
    assert classification.initiative_slugs == ("beta", "alpha")
