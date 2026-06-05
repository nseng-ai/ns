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

        installed_skills = tuple(
            self._installed_skill(path)
            for path in sorted(agents_skills.iterdir(), key=lambda p: p.name)
            if path.is_dir() or path.is_symlink()
        )
        if not installed_skills:
            shutil.rmtree(tmp_path, ignore_errors=True)
            raise SkillxWorkspaceError("No skills were installed")

        return SkillxWorkspace(tmp_dir=tmp_path, skills=installed_skills)

    def _installed_skill(self, skill_dir: Path) -> SkillxInstalledSkill:
        files = tuple(
            sorted(
                str(path.relative_to(skill_dir)) for path in skill_dir.rglob("*") if path.is_file()
            )
        )
        return SkillxInstalledSkill(
            name=skill_dir.name,
            skill_dir=skill_dir,
            skill_md=skill_dir / "SKILL.md",
            files=files,
        )
