"""Mechanical gate for skill-first roaster stack batch completion."""

from __future__ import annotations

import fnmatch
import subprocess
from pathlib import Path
from typing import Literal

from asdl_core.clinkr.models import ClinkrModel

GateIssueCheck = Literal[
    "validation",
    "scope",
    "conflict_markers",
    "deletion",
]

_CONFLICT_MARKERS = ("<<<<<<< ", "=======", ">>>>>>> ")


class StackSkillValidationResult(ClinkrModel):
    """Captured result for one validation command rerun by the gate."""

    command: str
    exit_code: int
    stdout: str = ""
    stderr: str = ""

    @property
    def passed(self) -> bool:
        """Return whether the validation command passed."""
        return self.exit_code == 0


class StackSkillGateIssue(ClinkrModel):
    """One mechanical gate issue that blocks batch completion."""

    check: GateIssueCheck
    message: str
    path: str | None = None
    command: str | None = None


class StackSkillGateDecision(ClinkrModel):
    """Mechanical gate decision for one skill-first resolver batch."""

    passed: bool
    issues: tuple[StackSkillGateIssue, ...]
    validation_results: tuple[StackSkillValidationResult, ...]
    touched_files: tuple[str, ...]
    advisory_destructive: bool = False
    advisory_security_sensitive: bool = False


def evaluate_stack_skill_gate(
    *,
    expected_paths: tuple[str, ...],
    touched_files: tuple[str, ...],
    deleted_files: tuple[str, ...],
    conflict_marker_files: tuple[str, ...],
    validation_results: tuple[StackSkillValidationResult, ...],
    advisory_destructive: bool = False,
    advisory_security_sensitive: bool = False,
) -> StackSkillGateDecision:
    """Evaluate decidable skill-first batch gate checks."""
    issues: list[StackSkillGateIssue] = []
    normalized_expected_paths = tuple(_normalize_path(pattern) for pattern in expected_paths)

    for result in validation_results:
        if not result.passed:
            issues.append(
                StackSkillGateIssue(
                    check="validation",
                    command=result.command,
                    message=f"validation command exited {result.exit_code}: {result.command}",
                )
            )

    for path in touched_files:
        normalized_path = _normalize_path(path)
        if not _path_allowed(normalized_path, normalized_expected_paths):
            issues.append(
                StackSkillGateIssue(
                    check="scope",
                    path=normalized_path,
                    message=f"touched path {normalized_path!r} is outside expected_paths",
                )
            )

    for path in conflict_marker_files:
        normalized_path = _normalize_path(path)
        issues.append(
            StackSkillGateIssue(
                check="conflict_markers",
                path=normalized_path,
                message=f"conflict markers remain in {normalized_path!r}",
            )
        )

    for path in deleted_files:
        normalized_path = _normalize_path(path)
        issues.append(
            StackSkillGateIssue(
                check="deletion",
                path=normalized_path,
                message=f"unexpected deletion detected for {normalized_path!r}",
            )
        )

    return StackSkillGateDecision(
        passed=not issues,
        issues=tuple(issues),
        validation_results=validation_results,
        touched_files=tuple(_normalize_path(path) for path in touched_files),
        advisory_destructive=advisory_destructive,
        advisory_security_sensitive=advisory_security_sensitive,
    )


def run_validation_commands(
    commands: tuple[str, ...],
    *,
    cwd: Path,
) -> tuple[StackSkillValidationResult, ...]:
    """Run validation commands in order and capture their exit evidence."""
    results: list[StackSkillValidationResult] = []
    for command in commands:
        completed = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            check=False,
            capture_output=True,
            text=True,
        )
        results.append(
            StackSkillValidationResult(
                command=command,
                exit_code=completed.returncode,
                stdout=completed.stdout,
                stderr=completed.stderr,
            )
        )
    return tuple(results)


def collect_touched_files(cwd: Path) -> tuple[str, ...]:
    """Return files touched in the working tree relative to ``HEAD``."""
    completed = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git status failed")

    paths: list[str] = []
    for line in completed.stdout.splitlines():
        if len(line) < 4:
            continue
        raw_path = line[3:].strip()
        if " -> " in raw_path:
            paths.extend(_normalize_path(part) for part in raw_path.split(" -> "))
        elif raw_path:
            paths.append(_normalize_path(raw_path))
    return tuple(dict.fromkeys(paths))


def collect_deleted_files(cwd: Path) -> tuple[str, ...]:
    """Return touched files that are deleted in the working tree or index."""
    completed = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git status failed")

    paths: list[str] = []
    for line in completed.stdout.splitlines():
        if len(line) < 4:
            continue
        index_status = line[0]
        worktree_status = line[1]
        if index_status != "D" and worktree_status != "D":
            continue
        raw_path = line[3:].strip()
        if " -> " in raw_path:
            raw_path = raw_path.split(" -> ")[0]
        if raw_path:
            paths.append(_normalize_path(raw_path))
    return tuple(dict.fromkeys(paths))


def collect_conflict_marker_files(cwd: Path, paths: tuple[str, ...]) -> tuple[str, ...]:
    """Return touched text files that still contain merge conflict markers."""
    marker_files: list[str] = []
    for path in paths:
        normalized_path = _normalize_path(path)
        candidate = cwd / normalized_path
        if not candidate.exists() or not candidate.is_file():
            continue
        text = candidate.read_text(encoding="utf-8", errors="ignore")
        if any(marker in text for marker in _CONFLICT_MARKERS):
            marker_files.append(normalized_path)
    return tuple(marker_files)


def _path_allowed(path: str, patterns: tuple[str, ...]) -> bool:
    if not patterns:
        return False
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def _normalize_path(path: str) -> str:
    return path.strip().replace("\\", "/").removeprefix("./")
