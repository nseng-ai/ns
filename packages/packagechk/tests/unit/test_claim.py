from __future__ import annotations

import json
from pathlib import Path

import pytest

from packagechk.claim import (
    ClaimProjectSpec,
    NpmClaimProjectSpec,
    module_name_from_package,
    render_claim_init_py,
    render_claim_pyproject,
    render_npm_index_js,
    render_npm_package_json,
    render_npm_readme,
    write_claim_project_files,
    write_npm_claim_project_files,
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


def test_render_npm_package_json_includes_required_fields() -> None:
    spec = NpmClaimProjectSpec(
        package_name="sample-name",
        description="Reserved package name",
        version="0.0.1",
        license="MIT",
    )

    rendered = render_npm_package_json(spec)
    manifest = json.loads(rendered)

    assert manifest == {
        "name": "sample-name",
        "version": "0.0.1",
        "description": "Reserved package name",
        "license": "MIT",
        "main": "index.js",
        "files": ["README.md", "index.js"],
    }
    assert rendered.endswith("\n")


def test_render_npm_readme_includes_package_name() -> None:
    spec = NpmClaimProjectSpec(
        package_name="sample-name",
        description="Reserved package name",
        version="0.0.1",
        license="MIT",
    )

    readme = render_npm_readme(spec)

    assert "# sample-name" in readme
    assert "This npm package name is claimed." in readme


def test_render_npm_index_js_returns_placeholder_comment() -> None:
    assert render_npm_index_js() == "// Claimed package name placeholder.\n"


def test_write_npm_claim_project_files_creates_expected_files(tmp_path: Path) -> None:
    spec = NpmClaimProjectSpec(
        package_name="sample-name",
        description="Reserved package name",
        version="0.0.1",
        license="MIT",
    )

    write_npm_claim_project_files(tmp_path, spec)

    assert (tmp_path / "package.json").read_text(encoding="utf-8") == render_npm_package_json(spec)
    assert (tmp_path / "README.md").read_text(encoding="utf-8") == render_npm_readme(spec)
    assert (tmp_path / "index.js").read_text(encoding="utf-8") == render_npm_index_js()


def test_write_npm_claim_project_files_refuses_to_overwrite_existing_package_json(
    tmp_path: Path,
) -> None:
    spec = NpmClaimProjectSpec(
        package_name="sample-name",
        description="Reserved package name",
        version="0.0.1",
        license="MIT",
    )
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")

    with pytest.raises(FileExistsError, match="package.json already exists"):
        write_npm_claim_project_files(tmp_path, spec)
