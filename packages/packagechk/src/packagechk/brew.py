from __future__ import annotations

import re

BREW_FORMULA_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9@+._-]*$")


def brew_formula_validation_error(package_name: str) -> str | None:
    if not package_name:
        return "Homebrew formula name must not be empty"
    if BREW_FORMULA_NAME_PATTERN.fullmatch(package_name) is None:
        return (
            "Homebrew formula names must contain only lowercase letters, digits, '.', '_', '-', "
            "'+', or '@', and must start with a lowercase letter or digit"
        )
    return None
