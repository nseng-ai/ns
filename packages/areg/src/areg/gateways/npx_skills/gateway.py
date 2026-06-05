"""Gateway for `npx skills` (the Node-based skills CLI)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


class NpxSkillsError(Exception):
    """Raised when `npx skills add` fails for any reason."""


class NpxSkills(ABC):
    """Gateway for invoking the external `npx skills add` command."""

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

        The production command mutates ``cwd`` on success. The default fake
        records requested invocations only and does not simulate the resulting
        filesystem layout. Callers that need to inspect fetched skill content
        should depend on the skillx transient-workspace gateway instead.

        Raises:
            NpxSkillsError: ``npx skills add`` failed.
        """


@dataclass(frozen=True)
class SkillFiles:
    """In-memory representation of a single skill's file tree for tests.

    ``files`` maps relative paths under the skill directory to their contents.
    For example::

        SkillFiles(files={
            "SKILL.md": "---\\nname: my-skill\\n---\\n",
            "references/patterns.md": "# Patterns\\n",
        })
    """

    files: dict[str, str] = field(default_factory=dict)
