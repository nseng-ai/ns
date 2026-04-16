"""Local git helpers for the composite pr-address commands."""

from __future__ import annotations

import subprocess

from twerk_core.gh.types import RestructuredFile


class LocalGitError(RuntimeError):
    """Raised when a local git helper cannot complete."""


def get_current_branch() -> str | None:
    """Return the current branch name, or ``None`` when HEAD is detached."""
    result = subprocess.run(
        ["git", "symbolic-ref", "--short", "HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        branch = result.stdout.strip()
        return branch or None

    stderr = result.stderr.strip()
    lowered = stderr.lower()
    if "not a git repository" in lowered:
        raise LocalGitError("Not inside a git repository.")
    if "not a symbolic ref" in lowered:
        return None
    raise LocalGitError(f"Failed to resolve the current branch: {stderr or 'git failed'}")


def get_restructured_files(base_ref_name: str) -> tuple[RestructuredFile, ...]:
    """Return renamed/copied files against ``origin/<base_ref_name>...HEAD``."""
    result = subprocess.run(
        ["git", "diff", "--name-status", "-M", "-C", f"origin/{base_ref_name}...HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise LocalGitError(
            "Failed to detect restructured files against "
            f"origin/{base_ref_name}: {stderr or 'git diff failed'}"
        )
    return parse_name_status_output(result.stdout)


def parse_name_status_output(stdout: str) -> tuple[RestructuredFile, ...]:
    """Parse ``git diff --name-status -M -C`` output into structured records."""
    files: list[RestructuredFile] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue

        raw_status = parts[0]
        status = raw_status[:1]
        if status not in {"R", "C"}:
            continue

        similarity_text = raw_status[1:] or "100"
        try:
            similarity = int(similarity_text)
        except ValueError:
            similarity = 100

        files.append(
            RestructuredFile(
                status=status,
                old_path=parts[1],
                new_path=parts[2],
                similarity=similarity,
            )
        )
    return tuple(files)
