"""Local git helpers for the composite pr-address commands."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Literal, TypeAlias

from twerk_core.gh.types import RestructuredFile

RestructuredFiles: TypeAlias = tuple[RestructuredFile, ...]


@dataclass(frozen=True)
class DetachedHead:
    """Sentinel returned when HEAD is not on a branch."""


@dataclass(frozen=True)
class LocalGitFailure:
    """Failure result returned by local git helpers.

    `error_type` is a literal tag so callers can `match` on the failure kind
    and translate it into a `ClinkrCommandError` (or other domain result)
    without string-matching on stderr. `message` carries the human-readable
    context (typically stderr from the underlying git invocation). `returncode`
    is the exit code from the git process, when available.
    """

    error_type: Literal["not_a_repo", "git_failed"]
    message: str
    returncode: int | None = None


def get_current_branch() -> str | DetachedHead | LocalGitFailure:
    """Return the current branch name, ``DetachedHead`` for detached HEAD, or a failure.

    - Non-empty stdout on success → branch name.
    - "not a symbolic ref" on stderr → ``DetachedHead()`` (detached HEAD is a
      domain state, not a failure).
    - Any other non-zero exit → ``LocalGitFailure`` with the stderr surfaced.
    """
    result = subprocess.run(
        ["git", "symbolic-ref", "--short", "HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        branch = result.stdout.strip()
        return branch or DetachedHead()

    stderr = result.stderr.strip()
    if "not a symbolic ref" in stderr.lower():
        return DetachedHead()
    return LocalGitFailure(
        error_type="git_failed",
        message=stderr or "git failed",
        returncode=result.returncode,
    )


def get_restructured_files(
    base_ref_name: str,
) -> RestructuredFiles | LocalGitFailure:
    """Return renamed/copied files against ``origin/<base_ref_name>...HEAD``."""
    result = subprocess.run(
        ["git", "diff", "--name-status", "-M", "-C", f"origin/{base_ref_name}...HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        return LocalGitFailure(
            error_type="git_failed",
            message=(
                f"Failed to detect restructured files against origin/{base_ref_name}: "
                f"{stderr or 'git diff failed'}"
            ),
            returncode=result.returncode,
        )
    return parse_name_status_output(result.stdout)


def parse_name_status_output(stdout: str) -> RestructuredFiles:
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
