from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import click

from areg.check.models import (
    SUPPORTED_SOURCE_TYPES,
    CheckContext,
    SkillMeta,
    SourceType,
)


def read_lockfile(project_dir: Path) -> dict[str, dict]:
    lockfile = project_dir / "skills-lock.json"
    if not lockfile.is_file():
        raise click.ClickException(
            f"skills-lock.json not found in {project_dir}. Is this a areg project?"
        )
    try:
        data = json.loads(lockfile.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise click.ClickException(f"Invalid JSON in skills-lock.json: {e}") from e
    return data.get("skills", {})


def locally_excluded_skills(project_dir: Path) -> frozenset[str]:
    """Skill names installed via local.just and excluded from git tracking."""
    exclude_file = project_dir / ".git" / "info" / "exclude"
    if not exclude_file.is_file():
        return frozenset()
    prefixes = (".agents/skills/", ".claude/skills/")
    excluded: set[str] = set()
    for raw_line in exclude_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        for prefix in prefixes:
            if line.startswith(prefix):
                excluded.add(line[len(prefix) :])
    return frozenset(excluded)


def _parse_skill_meta(name: str, raw: dict) -> SkillMeta | None:
    source_type = raw.get("sourceType")
    if source_type not in SUPPORTED_SOURCE_TYPES:
        return None
    source = raw.get("source", "")
    return SkillMeta(name=name, source=str(source), source_type=cast(SourceType, source_type))


def build_context(project_dir: Path) -> CheckContext:
    lockfile_skills = read_lockfile(project_dir)
    skills: list[SkillMeta] = []
    for name in sorted(lockfile_skills.keys()):
        meta = _parse_skill_meta(name, lockfile_skills[name])
        if meta is not None:
            skills.append(meta)
    return CheckContext(
        project_dir=project_dir,
        skills=tuple(skills),
        lockfile_names=frozenset(lockfile_skills.keys()),
        excluded_skills=locally_excluded_skills(project_dir),
    )
