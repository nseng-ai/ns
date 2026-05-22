from __future__ import annotations

from pathlib import Path

import pytest

from packagechk.claim import (
    ClaimProjectSpec,
    module_name_from_package,
    render_claim_init_py,
    render_claim_pyproject,
    write_claim_project_files,
)


def test_module_name_from_package_replaces_pypi_separators() -> None:
    assert module_name_from_package("my-package.name") == "my_package_name"


def test_module_name_from_package_prefixes_numeric_names() -> None:
    assert module_name_from_package("123package") == "pkg_123package"


def test_render_claim_pyproject_includes_placeholder_metadata() -> None:
    spec = ClaimProjectSpec(
        package_name="sample-name",
        module_name="sample_name",
        description="Reserved package name",
        version="0.0.1",
    )

    pyproject = render_claim_pyproject(spec)

    assert 'requires = ["hatchling"]' in pyproject
    assert 'build-backend = "hatchling.build"' in pyproject
    assert 'name = "sample-name"' in pyproject
    assert 'version = "0.0.1"' in pyproject
    assert 'description = "Reserved package name"' in pyproject
    readme_line = 'readme = {text = "This package name is claimed.", content-type = "text/plain"}'
    assert readme_line in pyproject
    assert 'packages = ["src/sample_name"]' in pyproject


def test_render_claim_pyproject_escapes_toml_strings() -> None:
    spec = ClaimProjectSpec(
        package_name="sample-name",
        module_name="sample_name",
        description='Reserved "name" \\ path',
        version="0.0.1",
    )

    pyproject = render_claim_pyproject(spec)

    assert 'description = "Reserved \\"name\\" \\\\ path"' in pyproject


def test_render_claim_init_py_includes_version() -> None:
    assert render_claim_init_py("0.0.1") == '"""Claimed package name."""\n\n__version__ = "0.0.1"\n'


def test_write_claim_project_files_creates_expected_files(tmp_path: Path) -> None:
    spec = ClaimProjectSpec(
        package_name="sample-name",
        module_name="sample_name",
        description="Reserved package name",
        version="0.0.1",
    )

    write_claim_project_files(tmp_path, spec)

    assert (tmp_path / "pyproject.toml").read_text(encoding="utf-8") == render_claim_pyproject(spec)
    assert (tmp_path / "src" / "sample_name" / "__init__.py").read_text(
        encoding="utf-8"
    ) == render_claim_init_py("0.0.1")


def test_write_claim_project_files_refuses_to_overwrite_existing_module_dir(tmp_path: Path) -> None:
    spec = ClaimProjectSpec(
        package_name="sample-name",
        module_name="sample_name",
        description="Reserved package name",
        version="0.0.1",
    )
    (tmp_path / "src" / "sample_name").mkdir(parents=True)

    with pytest.raises(FileExistsError, match="module directory already exists"):
        write_claim_project_files(tmp_path, spec)
