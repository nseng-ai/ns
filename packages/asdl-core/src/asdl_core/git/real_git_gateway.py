"""Real shared git gateway implementation backed by subprocess ``git`` calls."""

from __future__ import annotations

import subprocess
from pathlib import Path

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import (
    CommitSummary,
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    LocalBranchTip,
    PathTouch,
    RestructuredFile,
    WorktreeInfo,
)


def _run(
    cmd: list[str],
    *,
    cwd: Path | None,
    check: bool,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=check)


def parse_porcelain_status(stdout: str) -> FileStatus:
    """Parse ``git status --porcelain`` output into a ``FileStatus``."""

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


def parse_local_branch_tip_output(stdout: str) -> tuple[LocalBranchTip, ...]:
    """Parse NUL-delimited local branch tip output from ``git for-each-ref``."""

    tips: list[LocalBranchTip] = []
    for raw_line in stdout.splitlines():
        if not raw_line:
            continue
        name, separator, head_iso = raw_line.partition("\x00")
        if separator == "" or name == "":
            continue
        tips.append(LocalBranchTip(name=name, head_iso=head_iso or None))
    return tuple(tips)


def parse_worktree_list_output(stdout: str) -> tuple[WorktreeInfo, ...]:
    """Parse ``git worktree list --porcelain`` output into ``WorktreeInfo`` tuples."""

    worktrees: list[WorktreeInfo] = []
    current_path: Path | None = None
    current_branch: str | None = None
    current_bare = False

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("worktree "):
            current_path = Path(line.split(maxsplit=1)[1])
            current_branch = None
            current_bare = False
        elif line.startswith("branch "):
            if current_path is None:
                continue
            current_branch = line.split(maxsplit=1)[1].replace("refs/heads/", "")
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


def _branch_exists(repo_root: Path, branch: str) -> bool:
    result = _run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=repo_root,
        check=False,
    )
    return result.returncode == 0


def _ref_exists(repo_root: Path, ref: str) -> bool:
    result = _run(
        ["git", "rev-parse", "--verify", "--quiet", ref],
        cwd=repo_root,
        check=False,
    )
    return result.returncode == 0


def resolve_repo_root(cwd: Path) -> Path | None:
    """Return the git working-tree root for ``cwd``; ``None`` outside a repo."""

    result = _run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=cwd,
        check=False,
    )
    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if not raw:
        return None
    return Path(raw)


def resolve_trunk_branch(repo_root: Path) -> str | None:
    """Resolve the trunk branch name for ``repo_root``; None if unresolvable."""

    result = _run(
        ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        cwd=repo_root,
        check=False,
    )
    if result.returncode == 0:
        full = result.stdout.strip()
        if full.startswith("origin/"):
            candidate = full[len("origin/") :]
            if candidate and _branch_exists(repo_root, candidate):
                return candidate

    for candidate in ("main", "master"):
        if _branch_exists(repo_root, candidate):
            return candidate
    return None


def parse_path_touch_output(stdout: str) -> PathTouch | None:
    """Parse one NUL-delimited ``git log`` path-touch row."""

    raw = stdout.strip()
    if not raw:
        return None
    oid, separator, committed_iso = raw.partition("\x00")
    if separator == "" or oid == "" or committed_iso == "":
        return None
    return PathTouch(oid=oid, committed_iso=committed_iso)


def parse_log_range_output(stdout: str) -> tuple[CommitSummary, ...]:
    """Parse NUL-delimited ``git log --format=%H%x00%aI%x00%s`` output.

    Each commit is one line of three NUL-delimited fields. Empty stdout (no
    commits in range) yields an empty tuple. Lines that do not contain the
    expected two NUL separators are skipped defensively.
    """
    commits: list[CommitSummary] = []
    for raw_line in stdout.splitlines():
        if not raw_line:
            continue
        parts = raw_line.split("\x00")
        if len(parts) != 3:
            continue
        sha, author_iso, subject = parts
        commits.append(CommitSummary(sha=sha, author_iso=author_iso, subject=subject))
    return tuple(commits)


def parse_patch_id_output(stdout: str) -> tuple[tuple[str, str], ...]:
    """Parse ``git patch-id --stable`` output into ``(sha, patch_id)`` pairs.

    Each non-empty line is ``<patch_id> <sha>``; commits with empty diffs
    produce no line at all. Lines that do not match are skipped defensively.
    """
    pairs: list[tuple[str, str]] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        patch_id, sha = parts[0], parts[1]
        pairs.append((sha, patch_id))
    return tuple(pairs)


def _patch_id_pairs(
    repo_root: Path, range_spec: str
) -> tuple[tuple[tuple[str, str], ...], GitCommandFailure | None]:
    """Run ``git log -p ... | git patch-id --stable``; return pairs or failure."""

    log_proc = subprocess.Popen(
        ["git", "log", "-p", "--no-merges", "--format=%H", range_spec],
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    patch_proc = subprocess.Popen(
        ["git", "patch-id", "--stable"],
        cwd=repo_root,
        stdin=log_proc.stdout,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if log_proc.stdout is not None:
        log_proc.stdout.close()
    patch_stdout, patch_stderr = patch_proc.communicate()
    log_proc.wait()
    log_stderr = log_proc.stderr.read() if log_proc.stderr is not None else ""
    if log_proc.stderr is not None:
        log_proc.stderr.close()

    if log_proc.returncode != 0:
        return (), GitCommandFailure(
            message=log_stderr.strip() or "git log failed",
            returncode=log_proc.returncode,
        )
    if patch_proc.returncode != 0:
        return (), GitCommandFailure(
            message=patch_stderr.strip() or "git patch-id failed",
            returncode=patch_proc.returncode,
        )
    return parse_patch_id_output(patch_stdout), None


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


class RealGitGateway(GitGateway):
    """Shared real implementation for git repository and worktree operations."""

    def __init__(
        self,
        repo_root: Path | None = None,
        trunk_branch: str | None = None,
    ) -> None:
        self._repo_root = repo_root
        self._trunk_branch = trunk_branch

    def _require_repo_root(self) -> Path:
        if self._repo_root is None:
            raise RuntimeError("RealGitGateway requires repo_root for this operation.")
        return self._repo_root

    def _require_trunk_branch(self) -> str:
        if self._trunk_branch is None:
            raise RuntimeError("RealGitGateway requires trunk_branch for this operation.")
        return self._trunk_branch

    def path_exists(self, path: Path) -> bool:
        return path.exists()

    def get_repository_root(self, cwd: Path) -> Path:
        result = _run(["git", "rev-parse", "--show-toplevel"], cwd=cwd, check=True)
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

    def get_current_branch(self, cwd: Path) -> str | DetachedHead | GitCommandFailure:
        result = _run(["git", "symbolic-ref", "--short", "HEAD"], cwd=cwd, check=False)
        if result.returncode == 0:
            branch = result.stdout.strip()
            if branch:
                return branch
            return DetachedHead()

        stderr = result.stderr.strip()
        if "not a symbolic ref" in stderr.lower():
            return DetachedHead()

        return GitCommandFailure(
            message=stderr or "git failed",
            returncode=result.returncode,
        )

    def get_previous_branch(self, cwd: Path) -> str | None:
        result = _run(["git", "rev-parse", "--abbrev-ref", "@{-1}"], cwd=cwd, check=False)
        if result.returncode != 0:
            return None
        branch = result.stdout.strip()
        if not branch or branch == "@{-1}":
            return None
        return branch

    def get_trunk_branch(self) -> str:
        return self._require_trunk_branch()

    def branch_exists(self, branch: str) -> bool:
        return _branch_exists(self._require_repo_root(), branch)

    def list_local_branches(self) -> tuple[str, ...]:
        result = _run(
            ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
            cwd=self._require_repo_root(),
            check=True,
        )
        return tuple(line for line in result.stdout.splitlines() if line)

    def list_local_branch_tips(self) -> tuple[LocalBranchTip, ...]:
        result = _run(
            [
                "git",
                "for-each-ref",
                "--format=%(refname:short)%00%(committerdate:iso8601-strict)",
                "refs/heads/",
            ],
            cwd=self._require_repo_root(),
            check=True,
        )
        return parse_local_branch_tip_output(result.stdout)

    def list_tracked_paths_at_ref(
        self,
        ref: str,
        path: str,
    ) -> tuple[str, ...] | GitCommandFailure:
        result = _run(
            ["git", "ls-tree", "-r", "--full-tree", "--name-only", ref, "--", path],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return GitCommandFailure(
                message=result.stderr.strip() or "git ls-tree failed",
                returncode=result.returncode,
            )
        return tuple(line for line in result.stdout.splitlines() if line)

    def list_directories_at_ref(
        self,
        ref: str,
        path: str,
    ) -> tuple[str, ...] | GitCommandFailure:
        repo_root = self._require_repo_root()
        if not _ref_exists(repo_root, ref):
            return GitCommandFailure(message=f"Unknown git ref: {ref}", returncode=1)

        treeish = f"{ref}:{path}"
        exists_result = _run(["git", "cat-file", "-e", treeish], cwd=repo_root, check=False)
        if exists_result.returncode != 0:
            return ()

        result = _run(
            ["git", "ls-tree", "-d", "--name-only", treeish],
            cwd=repo_root,
            check=False,
        )
        if result.returncode != 0:
            return GitCommandFailure(
                message=result.stderr.strip() or "git ls-tree failed",
                returncode=result.returncode,
            )
        return tuple(line for line in result.stdout.splitlines() if line)

    def path_exists_at_ref(self, ref: str, path: str) -> bool:
        result = _run(
            ["git", "cat-file", "-e", f"{ref}:{path}"],
            cwd=self._require_repo_root(),
            check=False,
        )
        return result.returncode == 0

    def get_restructured_files(
        self,
        cwd: Path,
        base_ref_name: str,
    ) -> tuple[RestructuredFile, ...] | GitCommandFailure:
        result = _run(
            ["git", "diff", "--name-status", "-M", "-C", f"origin/{base_ref_name}...HEAD"],
            cwd=cwd,
            check=False,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            return GitCommandFailure(
                message=(
                    f"Failed to detect restructured files against origin/{base_ref_name}: "
                    f"{stderr or 'git diff failed'}"
                ),
                returncode=result.returncode,
            )
        return parse_name_status_output(result.stdout)

    def list_worktrees(self) -> tuple[WorktreeInfo, ...]:
        result = _run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=self._require_repo_root(),
            check=True,
        )
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
        _run(cmd, cwd=self._require_repo_root(), check=True)
        return WorktreeInfo(path=path, branch=branch, is_bare=False)

    def add_detached_worktree(self, path: Path, ref: str) -> WorktreeInfo:
        _run(
            ["git", "worktree", "add", "--detach", str(path), ref],
            cwd=self._require_repo_root(),
            check=True,
        )
        return WorktreeInfo(path=path, branch=None, is_bare=False)

    def remove_worktree(self, path: Path) -> None:
        _run(
            ["git", "worktree", "remove", str(path)],
            cwd=self._require_repo_root(),
            check=True,
        )

    def checkout_branch(self, cwd: Path, branch: str) -> None:
        _run(["git", "checkout", branch], cwd=cwd, check=True)

    def detach_head(self, cwd: Path, ref: str) -> None:
        _run(["git", "checkout", "--detach", ref], cwd=cwd, check=True)

    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        cmd = ["git", "branch"]
        if force:
            cmd.append("-f")
        cmd.extend([branch, start_point])
        _run(cmd, cwd=self._require_repo_root(), check=True)

    def has_uncommitted_changes(self, cwd: Path) -> bool:
        status = self.get_file_status(cwd)
        return status.staged or status.modified or status.untracked

    def get_file_status(self, cwd: Path) -> FileStatus:
        result = _run(["git", "status", "--porcelain"], cwd=cwd, check=True)
        return parse_porcelain_status(result.stdout)

    def file_last_touched_iso(self, ref: str, path: str) -> str | None:
        touch = self.path_last_touched(ref, path)
        if touch is None:
            return None
        return touch.committed_iso

    def path_last_touched(self, ref: str, path: str) -> PathTouch | None:
        result = _run(
            ["git", "log", "-1", "--format=%H%x00%cI", ref, "--", path],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return None
        return parse_path_touch_output(result.stdout)

    def branch_head_iso(self, branch: str) -> str | None:
        result = _run(
            ["git", "log", "-1", "--format=%cI", branch],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return None
        stamp = result.stdout.strip()
        return stamp or None

    def branch_head_oid(self, branch: str) -> str | GitCommandFailure:
        result = _run(
            ["git", "rev-parse", branch],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return GitCommandFailure(
                message=result.stderr.strip() or "git rev-parse failed",
                returncode=result.returncode,
            )
        return result.stdout.strip()

    def fetch_remote_branch(
        self,
        cwd: Path,
        remote: str,
        branch: str,
    ) -> GitCommandFailure | None:
        result = _run(["git", "fetch", remote, branch], cwd=cwd, check=False)
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git fetch failed",
            returncode=result.returncode,
        )

    def pull_fast_forward(self, cwd: Path) -> GitCommandFailure | None:
        result = _run(["git", "pull", "--ff-only"], cwd=cwd, check=False)
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git pull failed",
            returncode=result.returncode,
        )

    def update_local_ref(
        self,
        cwd: Path,
        ref: str,
        source: str,
    ) -> GitCommandFailure | None:
        result = _run(["git", "update-ref", ref, source], cwd=cwd, check=False)
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git update-ref failed",
            returncode=result.returncode,
        )

    def log_range(self, range_spec: str) -> tuple[CommitSummary, ...] | GitCommandFailure:
        result = _run(
            ["git", "log", "--format=%H%x00%aI%x00%s", range_spec],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            return GitCommandFailure(
                message=stderr or "git log failed",
                returncode=result.returncode,
            )
        return parse_log_range_output(result.stdout)

    def patch_ids_for_range(
        self, range_spec: str
    ) -> tuple[tuple[str, str | None], ...] | GitCommandFailure:
        repo_root = self._require_repo_root()
        sha_result = _run(
            ["git", "log", "--no-merges", "--format=%H", range_spec],
            cwd=repo_root,
            check=False,
        )
        if sha_result.returncode != 0:
            stderr = sha_result.stderr.strip()
            return GitCommandFailure(
                message=stderr or "git log failed",
                returncode=sha_result.returncode,
            )
        shas = tuple(line for line in sha_result.stdout.splitlines() if line)

        pid_pairs, failure = _patch_id_pairs(repo_root, range_spec)
        if failure is not None:
            return failure
        pid_by_sha = dict(pid_pairs)
        return tuple((sha, pid_by_sha.get(sha)) for sha in shas)

    def is_ancestor(self, maybe_ancestor: str, descendant: str) -> bool:
        result = _run(
            ["git", "merge-base", "--is-ancestor", maybe_ancestor, descendant],
            cwd=self._require_repo_root(),
            check=False,
        )
        return result.returncode == 0

    def list_branches_merged_into(self, branch: str) -> tuple[str, ...] | GitCommandFailure:
        result = _run(
            [
                "git",
                "for-each-ref",
                "--format=%(refname:short)",
                f"--merged={branch}",
                "refs/heads/",
            ],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            return GitCommandFailure(
                message=stderr or "git for-each-ref failed",
                returncode=result.returncode,
            )
        return tuple(line for line in result.stdout.splitlines() if line)

    def count_commits_in_range(self, range_spec: str) -> int | GitCommandFailure:
        result = _run(
            ["git", "rev-list", "--count", range_spec],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            return GitCommandFailure(
                message=stderr or "git rev-list failed",
                returncode=result.returncode,
            )
        raw = result.stdout.strip()
        if not raw:
            return 0
        try:
            return int(raw)
        except ValueError:
            return GitCommandFailure(
                message=f"git rev-list returned non-integer count: {raw!r}",
                returncode=0,
            )
