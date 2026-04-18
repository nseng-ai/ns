from __future__ import annotations

import json
import shlex
import shutil
import subprocess
from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
from pathlib import Path

AGENT_FLAGS: tuple[str, ...] = ("--agent", "codex", "claude-code", "-y")

SCOPE_PROJECT = "project"
SCOPE_GLOBAL = "global"

SOURCE_TYPE_LOCAL = "local"

PROJECT_LOCK_FILENAME = "skills-lock.json"
GLOBAL_LOCK_PATH = Path.home() / ".agents" / ".skill-lock.json"


def build_command(
    source: str,
    skills: Sequence[str],
    *,
    global_install: bool,
) -> tuple[str, ...]:
    """Build the `npx skills add` invocation for a single source group."""
    argv: list[str] = [
        "npx",
        "skills",
        "add",
        source,
        "--skill",
        *skills,
        *AGENT_FLAGS,
    ]
    if global_install:
        argv.append("-g")
    return tuple(argv)


def build_update_command(
    skills: Sequence[str],
    *,
    global_scope: bool,
) -> tuple[str, ...]:
    """Build `npx skills update <skills...> {-p|-g} -y` for one scope."""
    scope_flag = "-g" if global_scope else "-p"
    return ("npx", "skills", "update", *skills, scope_flag, "-y")


def render_command(argv: Sequence[str]) -> str:
    """Shell-safe render for dry-run printing."""
    return shlex.join(argv)


class NpxRunner(ABC):
    """Gateway around the `npx` binary (injected for tests)."""

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def run(self, argv: Sequence[str]) -> int: ...


class RealNpxRunner(NpxRunner):
    def is_available(self) -> bool:
        return shutil.which("npx") is not None

    def run(self, argv: Sequence[str]) -> int:
        return subprocess.call(list(argv))


class SkillStateSource(ABC):
    """Gateway exposing installed-skill state as recorded in lock files.

    Outer key is the skill name. Inner mapping is `scope -> sourceType`,
    where `scope` is `"project"` or `"global"` and `sourceType` comes
    straight from the lock file (e.g. `"github"`, `"local"`). Skills
    missing from the outer mapping are considered uninstalled.
    """

    @abstractmethod
    def get_states(self) -> Mapping[str, Mapping[str, str]]: ...


class RealSkillStateSource(SkillStateSource):
    """Reads the project and global npx skills lock files.

    The project lock is discovered by walking up from the current working
    directory looking for `skills-lock.json`; the global lock lives at
    `~/.agents/.skill-lock.json`. Missing or malformed files contribute
    no entries rather than raising.
    """

    def get_states(self) -> Mapping[str, Mapping[str, str]]:
        by_skill: dict[str, dict[str, str]] = {}
        project_lock = _find_project_lock(Path.cwd())
        if project_lock is not None:
            for name, source_type in _parse_lock(project_lock).items():
                by_skill.setdefault(name, {})[SCOPE_PROJECT] = source_type
        for name, source_type in _parse_lock(GLOBAL_LOCK_PATH).items():
            by_skill.setdefault(name, {})[SCOPE_GLOBAL] = source_type
        return by_skill


def _find_project_lock(start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        lock = candidate / PROJECT_LOCK_FILENAME
        if lock.is_file():
            return lock
    return None


def _parse_lock(path: Path) -> dict[str, str]:
    """Parse a skills lock file to `{skill_name: sourceType}`.

    Returns an empty dict on any failure (missing file, unreadable,
    invalid JSON, unexpected shape). Unknown top-level fields are
    ignored so future format bumps don't break us.
    """
    if not path.is_file():
        return {}
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    skills = payload.get("skills")
    if not isinstance(skills, dict):
        return {}
    result: dict[str, str] = {}
    for name, entry in skills.items():
        if not isinstance(name, str) or not isinstance(entry, dict):
            continue
        source_type = entry.get("sourceType")
        if isinstance(source_type, str):
            result[name] = source_type
    return result
