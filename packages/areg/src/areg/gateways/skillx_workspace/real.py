"""Production transient workspace installer for skillx."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from areg.gateways.npx_skills.gateway import NpxSkills, NpxSkillsError
from areg.gateways.skillx_workspace.gateway import (
    SkillxInstalledSkill,
    SkillxWorkspace,
    SkillxWorkspaceError,
    SkillxWorkspaceInstaller,
)


class RealSkillxWorkspaceInstaller(SkillxWorkspaceInstaller):
    """Prepare real temp directories by invoking ``npx skills add``."""

    def __init__(self, *, npx_skills: NpxSkills) -> None:
        self._npx_skills = npx_skills

    def install(self, repo: str, *, skill: str | None) -> SkillxWorkspace:
        tmp_path = Path(tempfile.mkdtemp(prefix="skillx."))
        try:
            self._npx_skills.add(
                repo,
                skills=[skill] if skill else None,
                agents=["codex"],
                cwd=tmp_path,
            )
        except NpxSkillsError as e:
            shutil.rmtree(tmp_path, ignore_errors=True)
            raise SkillxWorkspaceError(f"npx skills add failed: {e}") from e

        agents_skills = tmp_path / ".agents" / "skills"
        if not agents_skills.is_dir():
            shutil.rmtree(tmp_path, ignore_errors=True)
            raise SkillxWorkspaceError("No skills were installed")

        try:
            installed_skills = self._installed_skills(agents_skills, skill=skill)
        except SkillxWorkspaceError:
            shutil.rmtree(tmp_path, ignore_errors=True)
            raise

        if not installed_skills:
            shutil.rmtree(tmp_path, ignore_errors=True)
            raise SkillxWorkspaceError("No skills were installed")

        return SkillxWorkspace(tmp_dir=tmp_path, skills=installed_skills)

    def _installed_skills(
        self,
        agents_skills: Path,
        *,
        skill: str | None,
    ) -> tuple[SkillxInstalledSkill, ...]:
        if skill is not None:
            skill_dir = agents_skills / skill
            return (self._installed_skill(skill_dir),)

        return tuple(
            self._installed_skill(path)
            for path in sorted(agents_skills.iterdir(), key=lambda p: p.name)
        )

    def _installed_skill(self, skill_dir: Path) -> SkillxInstalledSkill:
        if not skill_dir.is_dir():
            raise SkillxWorkspaceError(f"Installed skill {skill_dir.name!r} is not a directory")

        skill_md = skill_dir / "SKILL.md"
        if not skill_md.is_file():
            raise SkillxWorkspaceError(f"Installed skill {skill_dir.name!r} is missing SKILL.md")

        files = tuple(
            sorted(
                str(path.relative_to(skill_dir)) for path in skill_dir.rglob("*") if path.is_file()
            )
        )
        return SkillxInstalledSkill(
            name=skill_dir.name,
            skill_dir=skill_dir,
            skill_md=skill_md,
            files=files,
        )
