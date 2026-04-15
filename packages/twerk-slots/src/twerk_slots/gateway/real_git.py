"""Real GitGateway implementation backed by subprocess ``git`` calls."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_slots.gateway.git import FileStatus, GitGateway, WorktreeInfo


def _run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=check)


def parse_porcelain_status(stdout: str) -> FileStatus:
    """Parse ``git status --porcelain`` output into a :class:`FileStatus`.

    Porcelain format: each line is ``XY path`` where ``X`` is the index
    status and ``Y`` is the working-tree status. ``??`` marks untracked
    files. Any non-space character in ``X`` means staged; any non-space
    character in ``Y`` means modified.
    """
    staged = False
    modified = False
    untracked = False
    for line in stdout.splitlines():
        if len(line) < 2:
            continue
        index = line[0]
        worktree = line[1]
        if index == "?" and worktree == "?":
            untracked = True
        else:
            if index != " ":
                staged = True
            if worktree != " ":
                modified = True
    return FileStatus(staged=staged, modified=modified, untracked=untracked)


def parse_worktree_list_output(stdout: str) -> tuple[WorktreeInfo, ...]:
    """Parse ``git worktree list --porcelain`` output into :class:`WorktreeInfo` tuples.

    Porcelain format: each worktree is a block of key/value lines
    (``worktree <path>``, ``HEAD <sha>``, ``branch <ref>``, or ``bare``)
    terminated by a blank line. Detached-HEAD worktrees omit the ``branch``
    line; bare repositories carry a standalone ``bare`` line.
    """
    worktrees: list[WorktreeInfo] = []
    current_path: Path | None = None
    current_branch: str | None = None
    current_bare: bool = False

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("worktree "):
            current_path = Path(line.split(maxsplit=1)[1])
            current_branch = None
            current_bare = False
        elif line.startswith("branch "):
            if current_path is None:
                continue
            branch_ref = line.split(maxsplit=1)[1]
            current_branch = branch_ref.replace("refs/heads/", "")
        elif line == "bare":
            current_bare = True
        elif line == "" and current_path is not None:
            worktrees.append(
                WorktreeInfo(path=current_path, branch=current_branch, is_bare=current_bare)
            )
            current_path = None
            current_branch = None
            current_bare = False

    if current_path is not None:
        worktrees.append(
            WorktreeInfo(path=current_path, branch=current_branch, is_bare=current_bare)
        )

    return tuple(worktrees)


class RealGitGateway(GitGateway):
    """GitGateway that shells out to ``git`` against a specific repo root."""

    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root

    # -- Filesystem helpers --

    def path_exists(self, path: Path) -> bool:
        return path.exists()

    # -- Repo discovery --

    def get_repository_root(self, cwd: Path) -> Path:
        result = _run(["git", "rev-parse", "--show-toplevel"], cwd=cwd)
        return Path(result.stdout.strip())

    def get_git_common_dir(self, cwd: Path) -> Path | None:
        result = _run(["git", "rev-parse", "--git-common-dir"], cwd=cwd, check=False)
        if result.returncode != 0:
            return None
        raw = result.stdout.strip()
        if not raw:
            return None
        path = Path(raw)
        if not path.is_absolute():
            path = (cwd / path).resolve()
        return path

    # -- Branch queries --

    def get_current_branch(self, cwd: Path) -> str | None:
        result = _run(["git", "symbolic-ref", "--short", "HEAD"], cwd=cwd, check=False)
        if result.returncode != 0:
            return None
        branch = result.stdout.strip()
        return branch or None

    def get_previous_branch(self, cwd: Path) -> str | None:
        result = _run(
            ["git", "rev-parse", "--abbrev-ref", "@{-1}"],
            cwd=cwd,
            check=False,
        )
        if result.returncode != 0:
            return None
        branch = result.stdout.strip()
        if not branch or branch == "@{-1}":
            return None
        return branch

    def get_trunk_branch(self) -> str | None:
        result = _run(
            ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
            cwd=self._repo_root,
            check=False,
        )
        if result.returncode == 0:
            full = result.stdout.strip()
            if full.startswith("origin/"):
                candidate = full[len("origin/") :]
                if candidate and self.branch_exists(candidate):
                    return candidate
        for candidate in ("main", "master"):
            if self.branch_exists(candidate):
                return candidate
        return None

    def branch_exists(self, branch: str) -> bool:
        result = _run(
            ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
            cwd=self._repo_root,
            check=False,
        )
        return result.returncode == 0

    def get_branch_head_sha(self, branch: str) -> str | None:
        result = _run(
            ["git", "rev-parse", branch],
            cwd=self._repo_root,
            check=False,
        )
        if result.returncode != 0:
            return None
        sha = result.stdout.strip()
        return sha or None

    def list_local_branches(self) -> tuple[str, ...]:
        result = _run(
            ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
            cwd=self._repo_root,
        )
        return tuple(line for line in result.stdout.splitlines() if line)

    # -- Worktree operations --

    def list_worktrees(self) -> tuple[WorktreeInfo, ...]:
        result = _run(["git", "worktree", "list", "--porcelain"], cwd=self._repo_root)
        return parse_worktree_list_output(result.stdout)

    def add_worktree(
        self,
        path: Path,
        branch: str,
        *,
        create_branch: bool,
    ) -> WorktreeInfo:
        if create_branch:
            cmd = ["git", "worktree", "add", "-b", branch, str(path), "HEAD"]
        else:
            cmd = ["git", "worktree", "add", str(path), branch]
        _run(cmd, cwd=self._repo_root)
        return WorktreeInfo(path=path, branch=branch, is_bare=False)

    def checkout_branch(self, cwd: Path, branch: str) -> None:
        _run(["git", "checkout", branch], cwd=cwd)

    def detach_head(self, cwd: Path, ref: str) -> None:
        _run(["git", "checkout", "--detach", ref], cwd=cwd)

    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        cmd = ["git", "branch"]
        if force:
            cmd.append("-f")
        cmd.extend([branch, start_point])
        _run(cmd, cwd=self._repo_root)

    # -- Status --

    def has_uncommitted_changes(self, cwd: Path) -> bool:
        status = self.get_file_status(cwd)
        return status.staged or status.modified or status.untracked

    def get_file_status(self, cwd: Path) -> FileStatus:
        result = _run(["git", "status", "--porcelain"], cwd=cwd)
        return parse_porcelain_status(result.stdout)
