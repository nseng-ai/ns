from __future__ import annotations

import pytest

from roaster.models import ReviewApplicability
from roaster.review_applicability import path_matches_pattern, review_applies_to_paths


@pytest.mark.parametrize(
    ("pattern", "path"),
    [
        ("**/*.py", "app.py"),
        ("**/*.py", "packages/pkg/src/app.py"),
        ("**/tests/**/*.py", "tests/test_x.py"),
        ("**/tests/**/*.py", "packages/pkg/tests/unit/test_x.py"),
        ("**/*.ts", "ts/packages/pi-extensions/test/planned-branch-extension.test.ts"),
    ],
)
def test_path_matches_pattern_handles_double_star(pattern: str, path: str) -> None:
    assert path_matches_pattern(path, pattern)


@pytest.mark.parametrize(
    ("pattern", "path"),
    [
        ("**/*.py", "README.md"),
        ("**/tests/**/*.py", "packages/pkg/src/app.py"),
        ("*.py", "packages/pkg/src/app.py"),
        ("**/*.ts", "packages/pkg/src/app.tsx"),
    ],
)
def test_path_matches_pattern_rejects_non_matches(pattern: str, path: str) -> None:
    assert not path_matches_pattern(path, pattern)


def test_review_without_include_is_applicable_to_all_diffs() -> None:
    applicability = ReviewApplicability()

    assert review_applies_to_paths(applicability, ())
    assert review_applies_to_paths(applicability, ("README.md",))


def test_python_test_only_diff_does_not_apply_to_dignified_python() -> None:
    applicability = ReviewApplicability(
        include=("**/*.py",),
        exclude=("**/tests/**/*.py",),
    )

    assert not review_applies_to_paths(
        applicability,
        ("packages/asdl-core/tests/unit/prompts/test_resolver.py",),
    )


def test_python_source_diff_applies_to_dignified_python() -> None:
    applicability = ReviewApplicability(
        include=("**/*.py",),
        exclude=("**/tests/**/*.py",),
    )

    assert review_applies_to_paths(
        applicability,
        ("packages/asdl-core/src/asdl_core/project_config.py",),
    )


def test_included_path_still_applies_when_other_paths_are_excluded() -> None:
    applicability = ReviewApplicability(
        include=("**/*.py",),
        exclude=("**/tests/**/*.py",),
    )

    assert review_applies_to_paths(
        applicability,
        (
            "packages/asdl-core/tests/unit/prompts/test_resolver.py",
            "packages/asdl-core/src/asdl_core/project_config.py",
        ),
    )


def test_non_empty_include_with_no_changed_paths_is_not_applicable() -> None:
    applicability = ReviewApplicability(include=("**/*.py",))

    assert not review_applies_to_paths(applicability, ())
