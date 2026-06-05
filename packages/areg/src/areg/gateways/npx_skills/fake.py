"""In-memory fake `npx skills` gateway."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from areg.gateways.npx_skills.gateway import NpxSkills


@dataclass(frozen=True)
class NpxSkillsInvocation:
    """Record of one `NpxSkills.add` call."""

    repo: str
    skills: tuple[str, ...] | None
    agents: tuple[str, ...]
    cwd: Path


class FakeNpxSkills(NpxSkills):
    """Fake `NpxSkills` that records invocations without touching disk."""

    def __init__(self, *, raise_on_add: Exception | None = None) -> None:
        self._raise_on_add = raise_on_add
        self._invocations: list[NpxSkillsInvocation] = []

    @property
    def invocations(self) -> list[NpxSkillsInvocation]:
        """Return a copy of every recorded ``add`` invocation."""
        return list(self._invocations)

    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        self._invocations.append(
            NpxSkillsInvocation(
                repo=repo,
                skills=tuple(skills) if skills is not None else None,
                agents=tuple(agents),
                cwd=cwd,
            )
        )

        if self._raise_on_add is not None:
            raise self._raise_on_add
