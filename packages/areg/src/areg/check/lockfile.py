from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import click

from areg.check.models import (
    SUPPORTED_SOURCE_TYPES,
    LockfileSkill,
    SkillsLockfile,
    SourceType,
)


def read_lockfile(project_dir: Path) -> SkillsLockfile:
    lockfile = project_dir / "skills-lock.json"
    if not lockfile.is_file():
        raise click.ClickException(
            f"skills-lock.json not found in {project_dir}. Is this a areg project?"
        )
    try:
        data = json.loads(lockfile.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise click.ClickException(f"Invalid JSON in skills-lock.json: {e}") from e
    return parse_lockfile_data(data)


def parse_lockfile_data(data: object) -> SkillsLockfile:
    root = _require_object(data, "root")
    version = _parse_version(root)

    if "skills" not in root:
        _raise_invalid("$.skills is required and must be an object")
    skills_data = _require_object(root["skills"], "$.skills")

    skills = tuple(
        _parse_lockfile_skill(name, raw)
        for name, raw in sorted(skills_data.items(), key=lambda item: item[0])
    )
    return SkillsLockfile(version=version, skills=skills)


def _parse_version(root: dict[str, object]) -> int:
    if "version" not in root:
        _raise_invalid("$.version is required and must be 1")
    version = root["version"]
    if isinstance(version, bool) or not isinstance(version, int) or version != 1:
        _raise_invalid("$.version must be 1")
    return cast(int, version)


def _parse_lockfile_skill(name: str, raw: object) -> LockfileSkill:
    path = f"$.skills.{name}"
    data = _require_object(raw, path)
    return LockfileSkill(
        name=name,
        source=_require_string_field(data, "source", path),
        source_type=_parse_source_type(data, path),
        computed_hash=_require_string_field(data, "computedHash", path),
        skill_path=_parse_optional_string_field(data, "skillPath", path),
    )


def _parse_source_type(data: dict[str, object], path: str) -> SourceType:
    source_type = _require_string_field(data, "sourceType", path)
    if source_type not in SUPPORTED_SOURCE_TYPES:
        supported = ", ".join(sorted(SUPPORTED_SOURCE_TYPES))
        _raise_invalid(f"{path}.sourceType must be one of {supported}")
    return cast(SourceType, source_type)


def _require_object(value: object, path: str) -> dict[str, object]:
    if not isinstance(value, dict):
        _raise_invalid(f"{path} must be an object")
    mapping = cast(dict[object, object], value)
    for key in mapping:
        if not isinstance(key, str):
            _raise_invalid(f"{path} object keys must be strings")
    return cast(dict[str, object], mapping)


def _require_string_field(data: dict[str, object], field: str, path: str) -> str:
    if field not in data:
        _raise_invalid(f"{path}.{field} is required and must be a string")
    value = data[field]
    if not isinstance(value, str):
        _raise_invalid(f"{path}.{field} must be a string")
    return cast(str, value)


def _parse_optional_string_field(
    data: dict[str, object],
    field: str,
    path: str,
) -> str | None:
    if field not in data:
        return None
    value = data[field]
    if not isinstance(value, str):
        _raise_invalid(f"{path}.{field} must be a string")
    return cast(str, value)


def _raise_invalid(message: str) -> None:
    raise click.ClickException(f"Invalid skills-lock.json: {message}.")
