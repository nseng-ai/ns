"""Gateway for `npx skills` (the Node-based skills CLI)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


class NpxSkillsError(Exception):
    """Raised when `npx skills add` fails for any reason."""


class NpxSkills(ABC):
    """Abstract gateway for the `npx skills` CLI."""

    @abstractmethod
    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        """Run ``npx skills add`` to install skills from ``repo`` into ``cwd``.

        ``skills`` is a list of skill names to install, or ``None`` to install
        every skill the repo provides. ``agents`` is the list of agent
        directories to populate (e.g. ``["codex", "claude-code"]``).

        On success, the canonical skill files have been written under
        ``cwd/.agents/skills/<name>/...``, ``cwd/.claude/skills/<name>``
        symlinks have been created, and ``cwd/skills-lock.json`` has been
        written.

        Raises:
            NpxSkillsError: ``npx skills add`` failed.
        """


@dataclass(frozen=True)
class SkillFiles:
    """In-memory representation of a single skill's file tree.

    ``files`` maps relative paths under the skill directory to their contents.
    For example::

        SkillFiles(files={
            "SKILL.md": "---\\nname: my-skill\\n---\\n",
            "references/patterns.md": "# Patterns\\n",
        })
    """

    files: dict[str, str] = field(default_factory=dict)
