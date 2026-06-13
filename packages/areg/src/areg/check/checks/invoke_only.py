from __future__ import annotations

from typing import ClassVar

from areg.check.base import SkillCheck
from areg.check.frontmatter import parse_skill_frontmatter
from areg.check.models import CheckContext, IssueKind, SkillIssue, SkillMeta, SourceType
from areg.invoke_only import (
    InvokeOnlyState,
    InvokeOnlyStatus,
    flag_set_in_frontmatter,
    openai_policy_path,
    skill_md_path,
)


class InvokeOnlyCheck(SkillCheck):
    name: ClassVar[str] = "invoke_only"
    source_types: ClassVar[frozenset[SourceType]] = frozenset({"local"})

    def run(self, ctx: CheckContext, skill: SkillMeta) -> list[SkillIssue]:
        skill_md = skill_md_path(ctx.project_dir, skill.name)
        if not skill_md.is_file():
            return []

        try:
            frontmatter = parse_skill_frontmatter(skill_md)
        except ValueError:
            return []

        sidecar = openai_policy_path(ctx.project_dir, skill.name)
        state = InvokeOnlyState(
            flag_enabled=flag_set_in_frontmatter(frontmatter),
            sidecar_exists=sidecar.is_file(),
        )
        relative_sidecar = sidecar.relative_to(ctx.project_dir)

        if state.status is InvokeOnlyStatus.FLAG_WITHOUT_SIDECAR:
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.INVOKE_ONLY_MISSING_OPENAI_POLICY,
                    f"{relative_sidecar} missing for invoke-only skill",
                )
            ]
        if state.status is InvokeOnlyStatus.SIDECAR_WITHOUT_FLAG:
            return [
                SkillIssue(
                    skill.name,
                    IssueKind.OPENAI_POLICY_WITHOUT_INVOKE_ONLY,
                    f"{relative_sidecar} exists but SKILL.md does not set "
                    "disable-model-invocation: true",
                )
            ]
        return []
