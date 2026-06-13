from __future__ import annotations

import pytest

from packagechk.brew import brew_formula_validation_error


@pytest.mark.parametrize("package_name", ["wget", "node@22", "gtk+3", "sample-name"])
def test_brew_formula_validation_accepts_formula_tokens(package_name: str) -> None:
    assert brew_formula_validation_error(package_name) is None


@pytest.mark.parametrize("package_name", ["", "Bad-Name", "homebrew/core/wget", "bad name"])
def test_brew_formula_validation_rejects_invalid_formula_tokens(package_name: str) -> None:
    assert brew_formula_validation_error(package_name) is not None
