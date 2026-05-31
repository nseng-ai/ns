from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from areg.check.base import ProjectCheck
from areg.check.models import CheckContext, IssueKind, SkillIssue


def _list_subdirs(path: Path) -> set[str]:
    if not path.is_dir():
        return set()
    return {p.name for p in path.iterdir() if p.name != ".DS_Store"}


class OrphansCheck(ProjectCheck):
    name: ClassVar[str] = "orphans"

    def run(self, ctx: CheckContext) -> list[SkillIssue]:
        issues: list[SkillIssue] = []
        lock_names = ctx.lockfile_names
        excluded = ctx.excluded_skills
        project_dir = ctx.project_dir

        for name in sorted(_list_subdirs(project_dir / "skills") - lock_names - excluded):
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.ORPHAN_IN_SKILLS,
                    f"Orphaned directory skills/{name}/ has no entry in skills-lock.json",
                )
            )

        for name in sorted(
            _list_subdirs(project_dir / ".agents" / "skills") - lock_names - excluded
        ):
            issues.append(
                SkillIssue(
                    name,
                    IssueKind.ORPHAN_IN_AGENTS,
                    f"Orphaned directory .agents/skills/{name}/ has no entry in skills-lock.json",
                )
            )

        for name in sorted(lock_names):
            skills_path = project_dir / "skills" / name
            agents_path = project_dir / ".agents" / "skills" / name
            claude_path = project_dir / ".claude" / "skills" / name
            skills_exists = skills_path.exists() or skills_path.is_symlink()
            agents_exists = agents_path.exists() or agents_path.is_symlink()
            claude_exists = claude_path.exists() or claude_path.is_symlink()
            if not skills_exists and not agents_exists and not claude_exists:
                issues.append(
                    SkillIssue(
                        name,
                        IssueKind.DANGLING_LOCKFILE,
                        f"Dangling lockfile entry: no directories found on disk for {name}",
                    )
                )

        return issues
