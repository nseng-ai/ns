from __future__ import annotations

import re

PYPI_NAME_PATTERN = re.compile(r"^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9])$")
PYPI_NORMALIZATION_PATTERN = re.compile(r"[-_.]+")


def normalize_pypi_name(package_name: str) -> str:
    return PYPI_NORMALIZATION_PATTERN.sub("-", package_name).lower()


def pypi_validation_error(package_name: str) -> str | None:
    if not package_name:
        return "PyPI package name must not be empty"
    if PYPI_NAME_PATTERN.fullmatch(package_name) is None:
        return (
            "PyPI package names must contain only ASCII letters, digits, '.', '_', or '-', "
            "and must start and end with a letter or digit"
        )
    return None
