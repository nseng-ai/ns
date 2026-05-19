from __future__ import annotations

import pytest

from packagechk.npm import npm_validation_error


@pytest.mark.parametrize(
    "package_name",
    ["sample", "sample-name", "sample.name", "sample_name", "a123"],
)
def test_npm_validation_accepts_unscoped_lowercase_names(package_name: str) -> None:
    assert npm_validation_error(package_name) is None


@pytest.mark.parametrize(
    ("package_name", "message"),
    [
        ("", "must not be empty"),
        ("@scope/name", "scoped package names are not supported"),
        ("scope/name", "must not contain '/'"),
        ("Sample", "must be lowercase"),
        ("_bad", "must start"),
        (".bad", "must start"),
        ("bad name", "must contain only"),
        ("node_modules", "reserved"),
        ("a" * 215, "214 characters or fewer"),
    ],
)
def test_npm_validation_rejects_names_npm_would_not_accept(
    package_name: str,
    message: str,
) -> None:
    error = npm_validation_error(package_name)

    assert error is not None
    assert message in error
