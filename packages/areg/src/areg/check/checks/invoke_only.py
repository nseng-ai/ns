from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from areg.check.base import SkillCheck
from areg.check.frontmatter import parse_skill_frontmatter
from areg.check.models import CheckContext, IssueKind, SkillIssue, SkillMeta, SourceType


def _local_skill_md_path(skill: SkillMeta, project_dir: Path) -> Path:
    return project_dir / "skills" / skill.name / "SKILL.md"


def _openai_policy_path(skill: SkillMeta, project_dir: Path) -> Path:
    return project_dir / "skills" / skill.name / "agents" / "openai.yaml"


class InvokeOnlyCheck(SkillCheck):
    name: ClassVar[str] = "invoke_only"
    source_types: ClassVar[frozenset[SourceType]] = frozenset({"local"})

    def run(self, ctx: CheckContext, skill: SkillMeta) -> list[SkillIssue]:
        skill_md = _local_skill_md_path(skill, ctx.project_dir)
        if not skill_md.is_file():
            return []

        try:
            frontmatter = parse_skill_frontmatter(skill_md)
        except ValueError:
            return []

        flag_enabled = frontmatter.get("disable-model-invocation", "").lower() == "true"
        sidecar = _openai_policy_path(skill, ctx.project_dir)
        sidecar_exists = sidecar.is_file()
        relative_sidecar = sidecar.relative_to(ctx.project_dir)

        if flag_enabled and not sidecar_exists:
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.INVOKE_ONLY_MISSING_OPENAI_POLICY,
                    f"{relative_sidecar} missing for invoke-only skill",
                )
            ]
        if sidecar_exists and not flag_enabled:
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.OPENAI_POLICY_WITHOUT_INVOKE_ONLY,
                    f"{relative_sidecar} exists but SKILL.md does not set "
                    "disable-model-invocation: true",
                )
            ]
        return []
