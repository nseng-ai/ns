"""Small gh CLI wrapper for live conformance preflight checks."""

from __future__ import annotations

import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from shutil import which


@dataclass(frozen=True)
class GhCliResult:
    """Captured gh command result with setup-failure formatting."""

    command: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str

    @property
    def succeeded(self) -> bool:
        return self.returncode == 0

    def setup_failure_message(self, description: str) -> str:
        return (
            f"GitHub conformance setup failure while {description}.\n"
            f"Command: {' '.join(self.command)}\n"
            f"Exit code: {self.returncode}\n"
            f"Stdout:\n{self.stdout.strip()}\n"
            f"Stderr:\n{self.stderr.strip()}"
        )


class GhCli:
    """Repository-targeted gh helper for preflight checks."""

    def __init__(self, *, repo: str) -> None:
        self._repo = repo

    @property
    def repo(self) -> str:
        return self._repo

    def run(self, args: Sequence[str]) -> GhCliResult:
        command = ("gh", *args)
        try:
            result = subprocess.run(
                list(command),
                capture_output=True,
                text=True,
                check=True,
            )
            return GhCliResult(
                command=command,
                returncode=result.returncode,
                stdout=result.stdout,
                stderr=result.stderr,
            )
        except FileNotFoundError as exc:
            return GhCliResult(
                command=command,
                returncode=127,
                stdout="",
                stderr=str(exc),
            )
        except subprocess.CalledProcessError as exc:
            return GhCliResult(
                command=command,
                returncode=exc.returncode,
                stdout=exc.stdout or "",
                stderr=exc.stderr or "",
            )

    def run_in_repo(self, args: Sequence[str]) -> GhCliResult:
        """Run a gh subcommand that supports explicit `-R owner/name`."""
        return self.run((*args, "-R", self._repo))

    def repo_view(self) -> GhCliResult:
        """View the configured repository without relying on ambient git context."""
        return self.run(("repo", "view", self._repo, "--json", "nameWithOwner"))


def gh_is_installed() -> bool:
    return which("gh") is not None
