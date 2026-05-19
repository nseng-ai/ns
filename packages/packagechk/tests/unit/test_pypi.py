from __future__ import annotations

import pytest

from packagechk.pypi import normalize_pypi_name, pypi_validation_error


@pytest.mark.parametrize(
    ("package_name", "normalized"),
    [
        ("Foo", "foo"),
        ("foo_bar", "foo-bar"),
        ("foo.bar", "foo-bar"),
        ("foo---bar", "foo-bar"),
        ("Foo._-Bar", "foo-bar"),
    ],
)
def test_normalize_pypi_name_applies_pep_503_style_normalization(
    package_name: str,
    normalized: str,
) -> None:
    assert normalize_pypi_name(package_name) == normalized


@pytest.mark.parametrize("package_name", ["sample", "sample-name", "sample.name", "sample_name"])
def test_pypi_validation_accepts_distribution_name_characters(package_name: str) -> None:
    assert pypi_validation_error(package_name) is None


@pytest.mark.parametrize("package_name", ["", "-bad", "bad-", ".bad", "bad!name"])
def test_pypi_validation_rejects_names_pypi_would_not_accept(package_name: str) -> None:
    assert pypi_validation_error(package_name) is not None
