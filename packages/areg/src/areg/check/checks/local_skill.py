from __future__ import annotations

import os
from typing import ClassVar

from areg.check.base import SkillCheck
from areg.check.models import CheckContext, IssueKind, SkillIssue, SkillMeta, SourceType


class LocalSkillStructureCheck(SkillCheck):
    name: ClassVar[str] = "local_skill_structure"
    source_types: ClassVar[frozenset[SourceType]] = frozenset({"local"})

    def run(self, ctx: CheckContext, skill: SkillMeta) -> list[SkillIssue]:
        issues: list[SkillIssue] = []
        name = skill.name
        project_dir = ctx.project_dir
        skills_path = project_dir / "skills" / name
        agents_path = project_dir / ".agents" / "skills" / name
        claude_path = project_dir / ".claude" / "skills" / name
        expected_source = f"skills/{name}"

        if skill.source != expected_source:
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.INVALID_LOCAL_LOCK_SOURCE,
                    f"Local skill lockfile source must be {expected_source!r},"
                    f" found {skill.source!r}",
                )
            )

        if not skills_path.exists():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.MISSING_SKILLS_DIR,
                    f"Local skill missing canonical source: skills/{name}/ does not exist",
                )
            )
        elif skills_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.SKILLS_DIR_IS_SYMLINK,
                    f"skills/{name} is a symlink but should be a real directory (canonical source)",
                )
            )

        expected_agents_target = f"../../skills/{name}"
        if not agents_path.exists() and not agents_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.AGENTS_MISSING,
                    f".agents/skills/{name} does not exist",
                )
            )
        elif not agents_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.AGENTS_NOT_SYMLINK,
                    f".agents/skills/{name} is a real directory,"
                    f" expected symlink to {expected_agents_target}",
                )
            )
        else:
            actual_target = os.readlink(agents_path)
            if actual_target != expected_agents_target:
                issues.append(
                    SkillIssue(
                        name,
                        IssueKind.AGENTS_WRONG_TARGET,
                        f".agents/skills/{name} symlink points to {actual_target}, "
                        f"expected {expected_agents_target}",
                    )
                )

        expected_claude_target = f"../../.agents/skills/{name}"
        if not claude_path.exists() and not claude_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.CLAUDE_MISSING,
                    f".claude/skills/{name} does not exist",
                )
            )
        elif not claude_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.CLAUDE_NOT_SYMLINK,
                    f".claude/skills/{name} is a real directory,"
                    f" expected symlink to {expected_claude_target}",
                )
            )
        else:
            actual_target = os.readlink(claude_path)
            if actual_target != expected_claude_target:
                issues.append(
                    SkillIssue(
                        name,
                        IssueKind.CLAUDE_WRONG_TARGET,
                        f".claude/skills/{name} symlink points to {actual_target}, "
                        f"expected {expected_claude_target}",
                    )
                )

        return issues
