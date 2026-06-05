"""In-memory fake transient workspace installer for skillx."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from areg.gateways.npx_skills.gateway import SkillFiles
from areg.gateways.skillx_workspace.gateway import (
    SkillxInstalledSkill,
    SkillxWorkspace,
    SkillxWorkspaceError,
    SkillxWorkspaceInstaller,
)


@dataclass(frozen=True)
class SkillxWorkspaceInvocation:
    """Record of one skillx workspace install request."""

    repo: str
    skill: str | None


class FakeSkillxWorkspaceInstaller(SkillxWorkspaceInstaller):
    """Pure in-memory fake for skillx workspace preparation."""

    def __init__(
        self,
        *,
        catalog: dict[str, dict[str, SkillFiles]] | None = None,
        raise_on_install: Exception | None = None,
    ) -> None:
        self._catalog = catalog or {}
        self._raise_on_install = raise_on_install
        self._invocations: list[SkillxWorkspaceInvocation] = []
        self._install_count = 0

    @property
    def invocations(self) -> list[SkillxWorkspaceInvocation]:
        """Return a copy of every recorded install invocation."""
        return list(self._invocations)

    def install(self, repo: str, *, skill: str | None) -> SkillxWorkspace:
        self._invocations.append(SkillxWorkspaceInvocation(repo=repo, skill=skill))

        if self._raise_on_install is not None:
            raise self._raise_on_install

        if repo not in self._catalog:
            raise SkillxWorkspaceError(f"unknown repo {repo!r}")

        repo_catalog = self._catalog[repo]
        if skill is None:
            selected = dict(sorted(repo_catalog.items()))
        elif skill in repo_catalog:
            selected = {skill: repo_catalog[skill]}
        else:
            raise SkillxWorkspaceError(f"unknown skill {skill!r} in {repo}")

        self._install_count += 1
        tmp_dir = Path(f"/tmp/skillx.fake-{self._install_count}")
        return SkillxWorkspace(
            tmp_dir=tmp_dir,
            skills=tuple(
                SkillxInstalledSkill(
                    name=name,
                    skill_dir=tmp_dir / ".agents" / "skills" / name,
                    skill_md=tmp_dir / ".agents" / "skills" / name / "SKILL.md",
                    files=tuple(sorted(skill_files.files)),
                )
                for name, skill_files in selected.items()
            ),
        )
