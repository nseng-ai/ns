"""Gateway for preparing transient skillx workspaces."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SkillxInstalledSkill:
    """One installed skill inside a transient skillx workspace."""

    name: str
    skill_dir: Path
    skill_md: Path
    files: tuple[str, ...]


@dataclass(frozen=True)
class SkillxWorkspace:
    """Transient workspace containing skills fetched for skillx."""

    tmp_dir: Path
    skills: tuple[SkillxInstalledSkill, ...]


class SkillxWorkspaceError(Exception):
    """Raised when a transient skillx workspace cannot be prepared."""


class SkillxWorkspaceInstaller(ABC):
    """Prepare a transient workspace whose paths skillx can return to agents."""

    @abstractmethod
    def install(self, repo: str, *, skill: str | None) -> SkillxWorkspace:
        """Fetch repo skills into a transient skillx workspace."""
