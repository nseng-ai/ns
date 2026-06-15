from __future__ import annotations

from typing import ClassVar

from areg.check.base import SkillCheck
from areg.check.frontmatter import parse_skill_frontmatter
from areg.check.models import CheckContext, IssueKind, SkillIssue, SkillMeta, SourceType
from areg.command_conversion import pi_skill_exclusion_present, verify_pi_replacement
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

        issues: list[SkillIssue] = []
        if state.status is InvokeOnlyStatus.FLAG_WITHOUT_SIDECAR:
            issues.append(
                SkillIssue(
                    skill.name,
                    IssueKind.INVOKE_ONLY_MISSING_OPENAI_POLICY,
                    f"{relative_sidecar} missing for invoke-only skill",
                )
            )
        if state.status is InvokeOnlyStatus.SIDECAR_WITHOUT_FLAG:
            issues.append(
                SkillIssue(
                    skill.name,
                    IssueKind.OPENAI_POLICY_WITHOUT_INVOKE_ONLY,
                    f"{relative_sidecar} exists but SKILL.md does not set "
                    "disable-model-invocation: true",
                )
            )

        pi_excluded = pi_skill_exclusion_present(ctx.project_dir, skill.name)
        replacement = verify_pi_replacement(ctx.project_dir, skill.name)
        if pi_excluded and not replacement.verified:
            expected = (
                f"/{replacement.surface}"
                if replacement.surface is not None
                else "a derived command"
            )
            issues.append(
                SkillIssue(
                    skill.name,
                    IssueKind.COMMAND_CONVERTED_MISSING_PI_REPLACEMENT,
                    "Pi skill is excluded but no verified replacement command exists; "
                    f"expected {expected}",
                )
            )
        return issues
