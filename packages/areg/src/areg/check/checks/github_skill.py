from __future__ import annotations

import os
from typing import ClassVar

from areg.check.base import SkillCheck
from areg.check.models import CheckContext, IssueKind, SkillIssue, SkillMeta, SourceType


class GitHubSkillStructureCheck(SkillCheck):
    name: ClassVar[str] = "github_skill_structure"
    source_types: ClassVar[frozenset[SourceType]] = frozenset({"github", "git", "gitlab"})

    def run(self, ctx: CheckContext, skill: SkillMeta) -> list[SkillIssue]:
        issues: list[SkillIssue] = []
        name = skill.name
        project_dir = ctx.project_dir
        skills_path = project_dir / "skills" / name
        agents_path = project_dir / ".agents" / "skills" / name
        claude_path = project_dir / ".claude" / "skills" / name

        if not agents_path.exists():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.AGENTS_NOT_REAL_DIR,
                    f".agents/skills/{name}/ does not exist",
                )
            )
        elif agents_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.AGENTS_NOT_REAL_DIR,
                    f".agents/skills/{name} is a symlink but should be a real directory (vendored)",
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

        if skills_path.exists() or skills_path.is_symlink():
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.UNEXPECTED_SKILLS_DIR,
                    f"GitHub-sourced skill should not have skills/{name}/ entry",
                )
            )

        return issues
