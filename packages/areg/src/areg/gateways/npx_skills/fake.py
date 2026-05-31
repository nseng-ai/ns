"""In-memory fake `npx skills` gateway."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from areg.gateways.npx_skills.gateway import NpxSkills, NpxSkillsError, SkillFiles


@dataclass(frozen=True)
class NpxSkillsInvocation:
    """Record of one `NpxSkills.add` call."""

    repo: str
    skills: tuple[str, ...] | None
    agents: tuple[str, ...]
    cwd: Path


class FakeNpxSkills(NpxSkills):
    """Fake `NpxSkills` that writes files into ``cwd`` from a catalog.

    Configure via constructor:

      catalog: ``{repo: {skill_name: SkillFiles}}`` — what each repo provides.
      raise_on_add: an exception to raise from every ``add`` call (overrides
        the catalog). Use to inject ``NpxSkillsError``.
      write_lock: if ``True`` (default), ``add`` writes a ``skills-lock.json``.
      write_claude_symlinks: if ``True`` (default), ``add`` creates
        ``.claude/skills/<name>`` symlinks pointing into ``.agents/skills``.

    The fake mutates the *real* filesystem under ``cwd`` because the production
    code under test reads those files after ``add`` returns. In tests, ``cwd``
    is a ``tmp_path`` (or a temp dir created by ``fetch_skill``).
    """

    def __init__(
        self,
        *,
        catalog: dict[str, dict[str, SkillFiles]] | None = None,
        raise_on_add: Exception | None = None,
        write_lock: bool = True,
        write_claude_symlinks: bool = True,
    ) -> None:
        self._catalog = catalog or {}
        self._raise_on_add = raise_on_add
        self._write_lock = write_lock
        self._write_claude_symlinks = write_claude_symlinks
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

        if repo not in self._catalog:
            raise NpxSkillsError(f"unknown repo {repo!r}")

        repo_catalog = self._catalog[repo]
        if skills is None:
            to_install = dict(repo_catalog)
        else:
            to_install = {}
            for name in skills:
                if name not in repo_catalog:
                    raise NpxSkillsError(f"unknown skill {name!r} in {repo}")
                to_install[name] = repo_catalog[name]

        for name, sf in to_install.items():
            skill_dir = cwd / ".agents" / "skills" / name
            skill_dir.mkdir(parents=True, exist_ok=True)
            for rel, content in sf.files.items():
                f = skill_dir / rel
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(content, encoding="utf-8")

        if self._write_claude_symlinks and to_install:
            claude_skills = cwd / ".claude" / "skills"
            claude_skills.mkdir(parents=True, exist_ok=True)
            for name in to_install:
                target = Path("../../.agents/skills") / name
                link = claude_skills / name
                if not link.exists():
                    link.symlink_to(target)

        if self._write_lock and to_install:
            lock = {
                "version": 1,
                "skills": {
                    name: {
                        "source": repo,
                        "sourceType": "github",
                        "computedHash": f"fake-{name}",
                    }
                    for name in to_install
                },
            }
            (cwd / "skills-lock.json").write_text(json.dumps(lock, indent=2), encoding="utf-8")
