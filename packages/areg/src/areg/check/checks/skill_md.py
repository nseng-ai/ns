from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from areg.check.base import SkillCheck
from areg.check.frontmatter import parse_skill_frontmatter
from areg.check.models import (
    SUPPORTED_SOURCE_TYPES,
    CheckContext,
    IssueKind,
    SkillIssue,
    SkillMeta,
    SourceType,
)

_MAX_SKILL_DESCRIPTION_LENGTH = 1024


def _skill_md_path(skill: SkillMeta, project_dir: Path) -> Path:
    if skill.source_type == "local":
        return project_dir / "skills" / skill.name / "SKILL.md"
    return project_dir / ".agents" / "skills" / skill.name / "SKILL.md"


class SkillMdCheck(SkillCheck):
    name: ClassVar[str] = "skill_md"
    source_types: ClassVar[frozenset[SourceType]] = SUPPORTED_SOURCE_TYPES

    def run(self, ctx: CheckContext, skill: SkillMeta) -> list[SkillIssue]:
        skill_md = _skill_md_path(skill, ctx.project_dir)
        relative_path = skill_md.relative_to(ctx.project_dir)

        if not skill_md.is_file():
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.INVALID_SKILL_MD,
                    f"{relative_path} does not exist",
                )
            ]

        try:
            frontmatter = parse_skill_frontmatter(skill_md)
        except ValueError as e:
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.INVALID_SKILL_MD,
                    f"{relative_path} invalid frontmatter: {e}",
                )
            ]

        description = frontmatter.get("description")
        if description is None:
            return []

        if len(description) > _MAX_SKILL_DESCRIPTION_LENGTH:
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.INVALID_SKILL_MD,
                    f"{relative_path} invalid description: exceeds maximum length of "
                    f"{_MAX_SKILL_DESCRIPTION_LENGTH} characters (got {len(description)})",
                )
            ]

        return []
