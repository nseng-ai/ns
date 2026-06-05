from __future__ import annotations

from pathlib import Path

from areg.check.lockfile import read_lockfile
from areg.check.models import CheckContext, SkillMeta


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


def build_context(project_dir: Path) -> CheckContext:
    lockfile = read_lockfile(project_dir)
    skills = tuple(
        SkillMeta(name=entry.name, source=entry.source, source_type=entry.source_type)
        for entry in lockfile.skills
    )
    return CheckContext(
        project_dir=project_dir,
        skills=skills,
        lockfile_names=lockfile.names,
        excluded_skills=locally_excluded_skills(project_dir),
        lockfile_skills=lockfile.skills,
    )
