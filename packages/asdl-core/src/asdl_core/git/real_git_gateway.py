"""Real shared git gateway implementation backed by subprocess ``git`` calls."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git import commands
from asdl_core.git.commands import local_branch_exists, run_git_command
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.output_conversion import (
    parse_commit_graph_output,
    parse_local_branch_tip_output,
    parse_local_branch_tip_ref_output,
    parse_log_range_output,
    parse_name_status_output,
    parse_patch_id_output,
    parse_path_change_touches_output,
    parse_path_touch_output,
    parse_porcelain_status,
    parse_tree_oid_batch_check_output,
    parse_worktree_list_output,
)
from asdl_core.git.types import (
    BranchCommitGraph,
    CommitSummary,
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    LocalBranchTip,
    PathChangeTouch,
    PathTouch,
    RestructuredFile,
    WorktreeInfo,
    WorktreeOccupancy,
)

subprocess = commands.subprocess


def _strip_refs_heads(ref: str) -> str:
    prefix = "refs/heads/"
    if ref.startswith(prefix):
        return ref[len(prefix) :]
    return ref


def _resolve_worktree_admin_dir(worktree_path: Path) -> Path | None:
    """Return the per-worktree admin gitdir, or ``None`` when unresolvable.

    The main worktree's ``.git`` is a directory and is itself the admin dir.
    A linked worktree's ``.git`` is a file containing ``gitdir: <abs>`` that
    points at ``<common>/.git/worktrees/<name>``.
    """

    dot_git = worktree_path / ".git"
    if dot_git.is_dir():
        return dot_git
    if dot_git.is_file():
        content = dot_git.read_text(encoding="utf-8").strip()
        prefix = "gitdir:"
        if content.startswith(prefix):
            raw = content[len(prefix) :].strip()
            if raw:
                admin = Path(raw)
                if not admin.is_absolute():
                    admin = (worktree_path / admin).resolve()
                return admin
    return None


def _worktree_operation(worktree_path: Path) -> tuple[str, str] | None:
    """Return ``(operation, branch)`` when ``worktree_path`` is mid-rebase/bisect.

    Reads the per-worktree admin dir for the authoritative in-progress signal:
    ``rebase-merge/head-name`` or ``rebase-apply/head-name`` for a rebase, and
    ``BISECT_START`` for a bisect. Returns ``None`` when no such operation is
    underway (the merge mid-state keeps HEAD on the branch, so it needs no
    special handling).

    These state files are git internals, not specified in any man page. The
    references below are the authoritative documentation:

    - *Location.* Each linked worktree has a private admin dir under
      ``$GIT_COMMON_DIR/worktrees/<id>/`` where its per-worktree state lives;
      this is why we resolve and read each worktree's own admin dir rather than
      a shared ``.git``. See git-worktree(1) "DETAILS"
      (https://git-scm.com/docs/git-worktree) and the per-worktree vs shared
      split in gitrepository-layout(5)
      (https://git-scm.com/docs/gitrepository-layout).
    - *Meaning of the files.* This is a narrow reimplementation of git's own
      status-state probe: ``wt_status_get_state`` in wt-status.c reads the
      identical files -- ``read_and_strip_branch("rebase-{merge,apply}/head-name")``
      for the rebased branch and ``read_and_strip_branch("BISECT_START")`` for
      the bisected-from branch (https://github.com/git/git/blob/master/wt-status.c).
      So we read the same files, the same way, that ``git status`` does. (One
      nuance: ``git status`` gates bisect detection on ``BISECT_LOG`` and then
      reads ``BISECT_START`` for the name; we key directly on ``BISECT_START``.)
    - *Producers.* git-rebase(1) writes ``rebase-apply/`` (apply backend) or
      ``rebase-merge/`` (merge/interactive backend)
      (https://git-scm.com/docs/git-rebase); git-bisect(1) writes the
      ``BISECT_*`` state (https://git-scm.com/docs/git-bisect).
    """

    admin_dir = _resolve_worktree_admin_dir(worktree_path)
    if admin_dir is None:
        return None
    for rebase_subdir in ("rebase-merge", "rebase-apply"):
        head_name_file = admin_dir / rebase_subdir / "head-name"
        if head_name_file.is_file():
            raw = head_name_file.read_text(encoding="utf-8").strip()
            if raw:
                return ("rebase", _strip_refs_heads(raw))
    bisect_start = admin_dir / "BISECT_START"
    if bisect_start.is_file():
        raw = bisect_start.read_text(encoding="utf-8").strip()
        if raw:
            return ("bisect", _strip_refs_heads(raw))
    return None


def _ref_exists(repo_root: Path, ref: str) -> bool:
    result = run_git_command(
        ["git", "rev-parse", "--verify", "--quiet", ref],
        cwd=repo_root,
        check=False,
    )
    return result.returncode == 0


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
        result = run_git_command(["git", "rev-parse", "--show-toplevel"], cwd=cwd, check=True)
        return Path(result.stdout.strip())

    def get_git_common_dir(self, cwd: Path) -> Path | None:
        result = run_git_command(["git", "rev-parse", "--git-common-dir"], cwd=cwd, check=False)
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
        result = run_git_command(["git", "symbolic-ref", "--short", "HEAD"], cwd=cwd, check=False)
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
        result = run_git_command(
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

    def get_trunk_branch(self) -> str:
        return self._require_trunk_branch()

    def branch_exists(self, branch: str) -> bool:
        return local_branch_exists(self._require_repo_root(), branch)

    def list_local_branches(self) -> tuple[str, ...]:
        result = run_git_command(
            ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
            cwd=self._require_repo_root(),
            check=True,
        )
        return tuple(line for line in result.stdout.splitlines() if line)

    def list_local_branch_tips(self) -> tuple[LocalBranchTip, ...]:
        result = run_git_command(
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
        result = run_git_command(
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
        exists_result = run_git_command(
            ["git", "cat-file", "-e", treeish],
            cwd=repo_root,
            check=False,
        )
        if exists_result.returncode != 0:
            return ()

        result = run_git_command(
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

    def tree_oids_at_refs(
        self,
        refs: tuple[str, ...],
        path: str,
    ) -> dict[str, str | None] | GitCommandFailure:
        if not refs:
            return {}

        repo_root = self._require_repo_root()
        batch_input = "".join(f"{ref}:{path}\n" for ref in refs)
        proc = subprocess.Popen(
            ["git", "cat-file", "--batch-check=%(objectname) %(objecttype)"],
            cwd=repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate(batch_input)
        if proc.returncode != 0:
            return GitCommandFailure(
                message=stderr.strip() or "git cat-file failed",
                returncode=proc.returncode,
            )
        return parse_tree_oid_batch_check_output(stdout, refs)

    def path_exists_at_ref(self, ref: str, path: str) -> bool:
        result = run_git_command(
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
        result = run_git_command(
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
        result = run_git_command(
            ["git", "worktree", "list", "--porcelain"],
            cwd=self._require_repo_root(),
            check=True,
        )
        return parse_worktree_list_output(result.stdout)

    def list_branch_occupancies(self) -> tuple[WorktreeOccupancy, ...]:
        occupancies: list[WorktreeOccupancy] = []
        for worktree in self.list_worktrees():
            if worktree.is_bare:
                continue
            operation = _worktree_operation(worktree.path)
            if operation is not None:
                op_name, branch = operation
                occupancies.append(
                    WorktreeOccupancy(path=worktree.path, branch=branch, operation=op_name)
                )
            elif worktree.branch is not None:
                occupancies.append(
                    WorktreeOccupancy(
                        path=worktree.path,
                        branch=worktree.branch,
                        operation="checked-out",
                    )
                )
        return tuple(occupancies)

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
        run_git_command(cmd, cwd=self._require_repo_root(), check=True)
        return WorktreeInfo(path=path, branch=branch, is_bare=False)

    def add_detached_worktree(self, path: Path, ref: str) -> WorktreeInfo:
        run_git_command(
            ["git", "worktree", "add", "--detach", str(path), ref],
            cwd=self._require_repo_root(),
            check=True,
        )
        return WorktreeInfo(path=path, branch=None, is_bare=False)

    def remove_worktree(self, path: Path) -> None:
        run_git_command(
            ["git", "worktree", "remove", str(path)],
            cwd=self._require_repo_root(),
            check=True,
        )

    def checkout_branch(self, cwd: Path, branch: str) -> GitCommandFailure | None:
        result = run_git_command(["git", "checkout", branch], cwd=cwd, check=False)
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git checkout failed",
            returncode=result.returncode,
            error_type="git_checkout_failed",
        )

    def detach_head(self, cwd: Path, ref: str) -> None:
        run_git_command(["git", "checkout", "--detach", ref], cwd=cwd, check=True)

    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        cmd = ["git", "branch"]
        if force:
            cmd.append("-f")
        cmd.extend([branch, start_point])
        run_git_command(cmd, cwd=self._require_repo_root(), check=True)

    def delete_local_branch(self, branch: str, *, force: bool) -> GitCommandFailure | None:
        flag = "-D" if force else "-d"
        result = run_git_command(
            ["git", "branch", flag, branch],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or f"git branch {flag} failed",
            returncode=result.returncode,
        )

    def delete_remote_branch(self, remote: str, branch: str) -> GitCommandFailure | None:
        result = run_git_command(
            ["git", "push", remote, "--delete", branch],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git push --delete failed",
            returncode=result.returncode,
        )

    def has_uncommitted_changes(self, cwd: Path) -> bool:
        status = self.get_file_status(cwd)
        return status.staged or status.modified or status.untracked

    def has_uncommitted_changes_under(self, cwd: Path, path: str) -> bool:
        result = run_git_command(
            ["git", "status", "--porcelain", "--untracked-files=all", "--", path],
            cwd=cwd,
            check=True,
        )
        return result.stdout.strip() != ""

    def get_file_status(self, cwd: Path) -> FileStatus:
        result = run_git_command(["git", "status", "--porcelain"], cwd=cwd, check=True)
        return parse_porcelain_status(result.stdout)

    def file_last_touched_iso(self, ref: str, path: str) -> str | None:
        touch = self.path_last_touched(ref, path)
        if touch is None:
            return None
        return touch.committed_iso

    def path_last_touched(self, ref: str, path: str) -> PathTouch | None:
        result = run_git_command(
            ["git", "log", "-1", "--format=%H%x00%cI", ref, "--", path],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return None
        return parse_path_touch_output(result.stdout)

    def path_touches_under(
        self,
        ref_or_range: str,
        path: str,
    ) -> tuple[PathChangeTouch, ...] | GitCommandFailure:
        result = run_git_command(
            [
                "git",
                "log",
                "--format=%H%x00%cI",
                "--name-status",
                "-M",
                ref_or_range,
                "--",
                path,
            ],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return GitCommandFailure(
                message=result.stderr.strip() or "git log failed",
                returncode=result.returncode,
            )
        return parse_path_change_touches_output(result.stdout, path)

    def branch_head_iso(self, branch: str) -> str | None:
        result = run_git_command(
            ["git", "log", "-1", "--format=%cI", branch],
            cwd=self._require_repo_root(),
            check=False,
        )
        if result.returncode != 0:
            return None
        stamp = result.stdout.strip()
        return stamp or None

    def branch_head_oid(self, branch: str) -> str | GitCommandFailure:
        result = run_git_command(
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
        result = run_git_command(["git", "fetch", remote, branch], cwd=cwd, check=False)
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git fetch failed",
            returncode=result.returncode,
        )

    def pull_fast_forward(self, cwd: Path) -> GitCommandFailure | None:
        result = run_git_command(["git", "pull", "--ff-only"], cwd=cwd, check=False)
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
        result = run_git_command(["git", "update-ref", ref, source], cwd=cwd, check=False)
        if result.returncode == 0:
            return None
        return GitCommandFailure(
            message=result.stderr.strip() or "git update-ref failed",
            returncode=result.returncode,
        )

    def log_range(self, range_spec: str) -> tuple[CommitSummary, ...] | GitCommandFailure:
        result = run_git_command(
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
        sha_result = run_git_command(
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

    def commit_graph_from_base(
        self,
        *,
        base_branch: str,
        branches: tuple[str, ...],
    ) -> BranchCommitGraph | GitCommandFailure:
        requested_branches = set(branches)
        if not requested_branches:
            return BranchCommitGraph(base_branch=base_branch, branch_tips=(), commits=())

        repo_root = self._require_repo_root()
        tips_result = run_git_command(
            [
                "git",
                "for-each-ref",
                "--format=%(refname:short)%00%(objectname)",
                "refs/heads/",
            ],
            cwd=repo_root,
            check=False,
        )
        if tips_result.returncode != 0:
            return GitCommandFailure(
                message=tips_result.stderr.strip() or "git for-each-ref failed",
                returncode=tips_result.returncode,
            )

        tips = tuple(
            sorted(
                (
                    tip
                    for tip in parse_local_branch_tip_ref_output(tips_result.stdout)
                    if tip.branch in requested_branches
                ),
                key=lambda tip: tip.branch,
            )
        )
        found_branches = {tip.branch for tip in tips}
        missing_branches = tuple(sorted(requested_branches - found_branches))
        if missing_branches:
            return GitCommandFailure(
                message=f"Missing local branch refs: {', '.join(missing_branches)}",
                returncode=1,
            )

        rev_list_result = run_git_command(
            [
                "git",
                "rev-list",
                "--parents",
                "--topo-order",
                *(tip.oid for tip in tips),
                f"^{base_branch}",
            ],
            cwd=repo_root,
            check=False,
        )
        if rev_list_result.returncode != 0:
            return GitCommandFailure(
                message=rev_list_result.stderr.strip() or "git rev-list failed",
                returncode=rev_list_result.returncode,
            )

        return BranchCommitGraph(
            base_branch=base_branch,
            branch_tips=tips,
            commits=parse_commit_graph_output(rev_list_result.stdout),
        )

    def is_ancestor(self, maybe_ancestor: str, descendant: str) -> bool:
        result = run_git_command(
            ["git", "merge-base", "--is-ancestor", maybe_ancestor, descendant],
            cwd=self._require_repo_root(),
            check=False,
        )
        return result.returncode == 0

    def list_branches_merged_into(self, branch: str) -> tuple[str, ...] | GitCommandFailure:
        result = run_git_command(
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
        result = run_git_command(
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
