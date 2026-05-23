from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

MODULE_SEPARATOR_PATTERN = re.compile(r"[^A-Za-z0-9]+")


@dataclass(frozen=True)
class ClaimProjectSpec:
    package_name: str
    module_name: str
    description: str
    version: str


def module_name_from_package(package_name: str) -> str:
    module_name = MODULE_SEPARATOR_PATTERN.sub("_", package_name).strip("_").lower()
    if module_name == "":
        return "pkg"
    if module_name[0].isdigit():
        return f"pkg_{module_name}"
    return module_name


def render_claim_pyproject(spec: ClaimProjectSpec) -> str:
    package_path = f"src/{spec.module_name}"
    return f"""[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = {_format_toml_string(spec.package_name)}
version = {_format_toml_string(spec.version)}
description = {_format_toml_string(spec.description)}
readme = {{text = "This package name is claimed.", content-type = "text/plain"}}
requires-python = ">=3.11"

[tool.hatch.build.targets.wheel]
packages = [{_format_toml_string(package_path)}]
"""


def render_claim_init_py(version: str) -> str:
    return f"""\"\"\"Claimed package name.\"\"\"

__version__ = {_format_toml_string(version)}
"""


def write_claim_project_files(project_dir: Path, spec: ClaimProjectSpec) -> None:
    module_dir = project_dir / "src" / spec.module_name
    if module_dir.exists():
        raise FileExistsError(f"module directory already exists: {module_dir}")

    module_dir.mkdir(parents=True)
    (project_dir / "pyproject.toml").write_text(render_claim_pyproject(spec), encoding="utf-8")
    (module_dir / "__init__.py").write_text(render_claim_init_py(spec.version), encoding="utf-8")


def _format_toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)
