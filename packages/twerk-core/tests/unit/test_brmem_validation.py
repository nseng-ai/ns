from __future__ import annotations

from twerk_core.brmem.validation import first_failure


def test_first_failure_returns_none_when_all_checks_pass() -> None:
    assert (
        first_failure(
            ("invalid_namespace", None),
            ("invalid_key", None),
            ("invalid_branch_name", None),
        )
        is None
    )


def test_first_failure_returns_single_failure_unchanged() -> None:
    result = first_failure(
        ("invalid_namespace", "Invalid namespace 'brs': 'brs' is a reserved namespace"),
        ("invalid_key", None),
        ("invalid_branch_name", None),
    )

    assert result == (
        "invalid_namespace",
        "Invalid namespace 'brs': 'brs' is a reserved namespace",
    )


def test_first_failure_collects_multiple_into_invalid_request() -> None:
    result = first_failure(
        ("invalid_namespace", "Invalid namespace 'brs': 'brs' is a reserved namespace"),
        ("invalid_key", "Invalid key '../escape': key must not contain '..' segment"),
        (
            "invalid_branch_name",
            "Invalid branch name 'feat---x': branch names containing '---' "
            "cannot be encoded into refs/brmem",
        ),
    )

    assert result == (
        "invalid_request",
        "\n".join(
            [
                "Invalid brmem request:",
                "- Invalid namespace 'brs': 'brs' is a reserved namespace",
                "- Invalid key '../escape': key must not contain '..' segment",
                (
                    "- Invalid branch name 'feat---x': branch names containing '---' "
                    "cannot be encoded into refs/brmem"
                ),
            ]
        ),
    )
