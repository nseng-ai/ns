"""Enforce that every skill in the repo is managed by `npx skills`.

These tests validate the invariants that hold if and only if every skill was
installed through `npx skills add`. If any of them fail, a skill was added,
removed, or modified by hand and must be reinstalled via `npx skills`. See
AGENTS.md (section "Managing Skills With `npx skills`") for the workflow.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = REPO_ROOT / "skills-lock.json"
AGENTS_SKILLS = REPO_ROOT / ".agents" / "skills"
CLAUDE_SKILLS = REPO_ROOT / ".claude" / "skills"
LOCAL_SKILLS_DIR = REPO_ROOT / "skills"

_VALID_SOURCE_TYPES = {"github", "local"}


def _load_lock() -> dict:
    return json.loads(LOCK_PATH.read_text())


def _lock_skills() -> dict[str, dict]:
    return _load_lock()["skills"]


def _git_tracked_skill_names() -> set[str]:
    """Skill names whose .agents/skills/<name> directories are tracked by git."""
    result = subprocess.run(
        ["git", "ls-files", ".agents/skills"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return {
        line.split("/")[2]
        for line in result.stdout.splitlines()
        if line.startswith(".agents/skills/") and len(line.split("/")) >= 3
    }


def _untracked_lock_skills() -> set[str]:
    """Skills in the lock file whose directories are not tracked by git.

    These are skills symlinked via local.just (e.g. from a nonslop checkout)
    that appear in skills-lock.json but whose files are not committed.
    Works identically in local dev and CI — no reliance on .git/info/exclude.
    """
    return set(_lock_skills()) - _git_tracked_skill_names()


def _untracked_dir_skills(path: Path) -> set[str]:
    """Skill directories on disk that are not tracked by git."""
    if not path.is_dir():
        return set()
    tracked = _git_tracked_skill_names()
    return {entry.name for entry in path.iterdir()} - tracked


def _dir_children(path: Path) -> set[str]:
    return {entry.name for entry in path.iterdir()}


def test_lock_file_is_well_formed():
    assert LOCK_PATH.is_file(), f"missing skills-lock.json at {LOCK_PATH}"
    lock = _load_lock()
    assert lock.get("version") == 1, f"expected version 1, got {lock.get('version')!r}"
    assert isinstance(lock.get("skills"), dict), "skills-lock.json must have a 'skills' object"
    assert lock["skills"], "skills-lock.json must contain at least one skill"


def test_lock_only_contains_tracked_skills():
    """Every skill in skills-lock.json must have its files tracked by git.

    If this fails, a locally-installed skill (e.g. from ``just install-nonslop``)
    leaked into the lock file. Revert the skills-lock.json changes before committing.
    """
    untracked = _untracked_lock_skills()
    assert not untracked, (
        f"skills-lock.json contains skills not tracked by git: {sorted(untracked)}. "
        "This usually means `npx skills` ran while local skills were symlinked. "
        "Revert skills-lock.json to remove these entries before committing."
    )


def test_lock_entries_have_required_fields():
    for name, entry in _lock_skills().items():
        assert isinstance(entry, dict), f"{name}: entry must be an object"
        assert isinstance(entry.get("source"), str) and entry["source"], (
            f"{name}: 'source' must be a non-empty string"
        )
        assert entry.get("sourceType") in _VALID_SOURCE_TYPES, (
            f"{name}: 'sourceType' must be one of {sorted(_VALID_SOURCE_TYPES)}, "
            f"got {entry.get('sourceType')!r}"
        )
        assert isinstance(entry.get("computedHash"), str) and entry["computedHash"], (
            f"{name}: 'computedHash' must be a non-empty string"
        )


def test_agents_skills_dirs_match_lock():
    assert AGENTS_SKILLS.is_dir(), f"missing {AGENTS_SKILLS}"
    lock_names = set(_lock_skills()) - _untracked_lock_skills()
    dir_names = _dir_children(AGENTS_SKILLS) - _untracked_dir_skills(AGENTS_SKILLS)
    missing = lock_names - dir_names
    extra = dir_names - lock_names
    assert not missing and not extra, (
        "`.agents/skills/` does not match `skills-lock.json`. "
        f"missing on disk: {sorted(missing)}; "
        f"unrecorded on disk: {sorted(extra)}. "
        "Install or remove skills via `npx skills` — do not edit these directories by hand."
    )


def test_claude_skills_match_lock():
    assert CLAUDE_SKILLS.is_dir(), f"missing {CLAUDE_SKILLS}"
    lock_names = set(_lock_skills()) - _untracked_lock_skills()
    dir_names = _dir_children(CLAUDE_SKILLS) - _untracked_dir_skills(CLAUDE_SKILLS)
    missing = lock_names - dir_names
    extra = dir_names - lock_names
    assert not missing and not extra, (
        "`.claude/skills/` does not match `skills-lock.json`. "
        f"missing symlinks: {sorted(missing)}; "
        f"unrecorded entries: {sorted(extra)}. "
        "Reinstall via `npx skills add ... --agent codex claude-code -y`."
    )


def test_claude_skills_are_symlinks_into_agents():
    excluded = _untracked_lock_skills()
    for name in _lock_skills():
        if name in excluded:
            continue
        link = CLAUDE_SKILLS / name
        assert link.is_symlink(), (
            f".claude/skills/{name} must be a symlink (not a directory). "
            f"This usually means it was installed with `--agent claude-code` alone. "
            f"Reinstall with `--agent codex claude-code` so the symlink layout is used."
        )
        target = Path(link.readlink()).as_posix()
        expected = f"../../.agents/skills/{name}"
        assert target == expected, (
            f".claude/skills/{name} points to {target!r}, expected {expected!r}"
        )


def test_every_installed_skill_has_skill_md():
    excluded = _untracked_lock_skills()
    for name in _lock_skills():
        if name in excluded:
            continue
        skill_md = AGENTS_SKILLS / name / "SKILL.md"
        assert skill_md.is_file(), f"missing SKILL.md for installed skill {name} at {skill_md}"


def test_local_skills_are_real_directories():
    """For local skills, .agents/skills/<name> must be a real directory (not a symlink).

    The canonical source for local skills lives directly in .agents/skills/<name>/.
    This ensures `npx skills list` correctly detects all agents. Public skills
    additionally get a skills/<name> symlink (see test_public_skills_have_symlink).
    """
    for name, entry in _lock_skills().items():
        if entry["sourceType"] != "local":
            continue
        agents_entry = AGENTS_SKILLS / name
        assert agents_entry.is_dir(), (
            f".agents/skills/{name} must exist as a directory for local skill {name}"
        )
        assert not agents_entry.is_symlink(), (
            f".agents/skills/{name} must be a real directory (not a symlink) "
            f"so that `npx skills list` correctly detects all agents. "
            f"Move the real content here and optionally create a skills/{name} "
            f"symlink if the skill is public."
        )
        assert (agents_entry / "SKILL.md").is_file(), (
            f"local skill {name}: missing SKILL.md at .agents/skills/{name}/SKILL.md"
        )


def test_public_skills_have_symlink():
    """Public local skills get a skills/<name> symlink for publishing via `npx skills add`.

    The skills/ directory is the public interface: when someone runs
    `npx skills add <owner>/<repo>`, the CLI discovers SKILL.md files at the
    repo root level. A skills/<name> symlink pointing to ../.agents/skills/<name>
    makes the skill discoverable without duplicating content.
    """
    if not LOCAL_SKILLS_DIR.is_dir():
        return
    for entry in LOCAL_SKILLS_DIR.iterdir():
        name = entry.name
        assert entry.is_symlink(), (
            f"skills/{name} must be a symlink (not a real directory). "
            f"The canonical source lives at .agents/skills/{name}/. Run: "
            f"rm -rf skills/{name} && "
            f"ln -s ../.agents/skills/{name} skills/{name}"
        )
        target = Path(entry.readlink()).as_posix()
        expected = f"../.agents/skills/{name}"
        assert target == expected, f"skills/{name} points to {target!r}, expected {expected!r}"
        assert name in _lock_skills(), (
            f"skills/{name} exists on disk but is not in skills-lock.json. "
            f"Install with `npx skills add ./skills/{name} --agent codex claude-code -y`."
        )
