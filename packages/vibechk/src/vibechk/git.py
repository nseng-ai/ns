from __future__ import annotations

import subprocess
from abc import ABC, abstractmethod
from pathlib import Path

from vibechk.errors import VibechkError


class GitGateway(ABC):
    @abstractmethod
    def repo_root(self) -> Path:
        """Return repository root for the workdir."""

    @abstractmethod
    def current_branch(self) -> str:
        """Return current branch or fail on detached HEAD."""

    @abstractmethod
    def current_commit(self) -> str:
        """Return current commit SHA."""

    @abstractmethod
    def remotes(self) -> dict[str, str]:
        """Return remotes keyed by name."""

    @abstractmethod
    def is_clean(self) -> bool:
        """Return whether the worktree and index are clean."""

    @abstractmethod
    def diff_patch(self) -> str:
        """Return a patch for changes relative to HEAD."""

    @abstractmethod
    def has_changes(self) -> bool:
        """Return whether the worktree or index has changes."""

    @abstractmethod
    def create_result_branch_and_commit(self, branch: str, message: str) -> None:
        """Create a result branch from current HEAD and commit all changes."""

    @abstractmethod
    def checkout(self, branch: str) -> None:
        """Checkout an existing branch."""


class RealGitGateway(GitGateway):
    def __init__(self, workdir: Path) -> None:
        self._workdir = workdir

    def repo_root(self) -> Path:
        result = self._run_git_raw(["rev-parse", "--show-toplevel"])
        if result.returncode != 0:
            raise VibechkError(f"Workdir {self._workdir} is not a git repository.")
        root_text = result.stdout.strip()
        if not root_text:
            raise VibechkError(f"Workdir {self._workdir} is not a git repository.")
        return Path(root_text)

    def current_branch(self) -> str:
        branch = self._run_git(
            ["rev-parse", "--abbrev-ref", "HEAD"],
            error_message=f"Could not determine current branch in {self._workdir}",
        )
        if branch == "HEAD":
            raise VibechkError(f"Workdir {self._workdir} is in detached HEAD state.")
        return branch

    def current_commit(self) -> str:
        return self._run_git(
            ["rev-parse", "HEAD"],
            error_message=f"Could not determine current commit in {self._workdir}",
        )

    def remotes(self) -> dict[str, str]:
        output = self._run_git(
            ["remote", "-v"],
            error_message=f"Could not list git remotes in {self._workdir}",
        )
        remotes: dict[str, str] = {}
        for line in output.splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0] not in remotes:
                remotes[parts[0]] = parts[1]
        return remotes

    def is_clean(self) -> bool:
        return self._status_porcelain() == ""

    def diff_patch(self) -> str:
        if self.has_changes():
            self._run_git(
                ["add", "-N", "."],
                error_message=f"Could not prepare untracked files for diff in {self._workdir}",
            )
        return self._run_git(
            ["diff", "--binary", "HEAD"],
            error_message=f"Could not capture git diff in {self._workdir}",
        )

    def has_changes(self) -> bool:
        return self._status_porcelain() != ""

    def create_result_branch_and_commit(self, branch: str, message: str) -> None:
        self._run_git(
            ["switch", "-c", branch],
            error_message=f"Could not create result branch {branch}",
        )
        self._run_git(
            ["add", "-A"],
            error_message=f"Could not stage vibechk changes on {branch}",
        )
        self._run_git(
            ["commit", "-m", message],
            error_message=f"Could not commit vibechk changes on {branch}",
        )

    def checkout(self, branch: str) -> None:
        self._run_git(
            ["switch", branch],
            error_message=f"Could not switch back to branch {branch}",
        )

    def _status_porcelain(self) -> str:
        return self._run_git(
            ["status", "--porcelain=v1"],
            error_message=f"Could not inspect git status in {self._workdir}",
        )

    def _run_git(self, args: list[str], *, error_message: str) -> str:
        result = self._run_git_raw(args)
        if result.returncode != 0:
            details = result.stderr.strip() or result.stdout.strip()
            if details:
                raise VibechkError(f"{error_message}: {details}")
            raise VibechkError(f"{error_message}.")
        return result.stdout.strip()

    def _run_git_raw(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                ["git", *args],
                cwd=self._workdir,
                check=False,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as error:
            raise VibechkError("git is not installed or not on PATH.") from error
