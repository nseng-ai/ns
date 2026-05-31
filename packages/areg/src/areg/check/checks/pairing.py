from __future__ import annotations

import importlib.resources
import os
from collections.abc import Iterator
from functools import cache
from pathlib import Path
from typing import ClassVar

from areg.check.base import ProjectCheck
from areg.check.models import CheckContext, IssueKind, SkillIssue

_PAIRING_PRUNED_DIR_NAMES = {".venv", ".git", "node_modules"}
_PAIRING_PRUNED_RELPATHS = {
    Path(".agents/skills"),
    Path(".claude/skills"),
}


@cache
def _templates_dir() -> Path | None:
    """Resolve areg's bundled _templates dir, or None if not on a real filesystem.

    Prunes areg's OWN scaffolding templates from the pairing check regardless
    of where the package sits relative to the checked project root.
    """
    candidate = Path(str(importlib.resources.files("areg") / "_templates"))
    if candidate.is_dir():
        return candidate.resolve()
    return None


def _iter_pairing_dirs(project_dir: Path) -> Iterator[Path]:
    """Yield each directory under project_dir that contains AGENTS.md or CLAUDE.md."""
    templates_dir = _templates_dir()
    for dirpath, dirnames, filenames in os.walk(project_dir):
        current = Path(dirpath)
        rel = current.relative_to(project_dir)
        kept = []
        for d in dirnames:
            if d in _PAIRING_PRUNED_DIR_NAMES:
                continue
            if (rel / d) in _PAIRING_PRUNED_RELPATHS:
                continue
            if templates_dir is not None and (current / d).resolve() == templates_dir:
                continue
            kept.append(d)
        dirnames[:] = sorted(kept)
        if "AGENTS.md" in filenames or "CLAUDE.md" in filenames:
            yield current


class PairingCheck(ProjectCheck):
    name: ClassVar[str] = "pairing"

    def run(self, ctx: CheckContext) -> list[SkillIssue]:
        issues: list[SkillIssue] = []
        project_dir = ctx.project_dir
        for dir_path in _iter_pairing_dirs(project_dir):
            agents_path = dir_path / "AGENTS.md"
            claude_path = dir_path / "CLAUDE.md"
            agents_exists = agents_path.is_file()
            claude_exists = claude_path.is_file()

            if agents_exists and not claude_exists:
                rel = agents_path.relative_to(project_dir).as_posix()
                issues.append(
                    SkillIssue(
                        rel,
                        IssueKind.CLAUDE_MD_MISSING_PEER,
                        f"AGENTS.md at {rel} has no peer CLAUDE.md in the same directory",
                    )
                )
            elif claude_exists and not agents_exists:
                rel = claude_path.relative_to(project_dir).as_posix()
                issues.append(
                    SkillIssue(
                        rel,
                        IssueKind.AGENTS_MD_MISSING_PEER,
                        f"CLAUDE.md at {rel} has no peer AGENTS.md in the same directory",
                    )
                )
            else:
                claude_text = claude_path.read_text(encoding="utf-8")
                if "@AGENTS.md" not in claude_text:
                    rel = claude_path.relative_to(project_dir).as_posix()
                    issues.append(
                        SkillIssue(
                            rel,
                            IssueKind.CLAUDE_MD_MISSING_AGENTS_REF,
                            f"CLAUDE.md at {rel} does not include peer AGENTS.md"
                            f" via @AGENTS.md syntax",
                        )
                    )
        return issues
