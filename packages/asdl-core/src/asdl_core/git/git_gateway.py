"""Abstract gateway for shared git read operations."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

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
)


class GitGateway(ABC):
    """Shared gateway for git repository and worktree operations."""

    @abstractmethod
    def path_exists(self, path: Path) -> bool:
        """Return True when ``path`` exists on the filesystem."""

    @abstractmethod
    def get_repository_root(self, cwd: Path) -> Path:
        """Return the working tree root for ``cwd``."""

    @abstractmethod
    def get_git_common_dir(self, cwd: Path) -> Path | None:
        """Return the main repo's ``.git`` directory, or None when not in a repo."""

    @abstractmethod
    def get_current_branch(self, cwd: Path) -> str | DetachedHead | GitCommandFailure:
        """Return the checked-out branch, detached sentinel, or command failure."""

    @abstractmethod
    def get_previous_branch(self, cwd: Path) -> str | None:
        """Return the previous branch or None when unavailable."""

    @abstractmethod
    def get_trunk_branch(self) -> str:
        """Return the bound repo's trunk branch name."""

    @abstractmethod
    def branch_exists(self, branch: str) -> bool:
        """Return True when ``branch`` exists as a local branch in the bound repo."""

    @abstractmethod
    def list_local_branches(self) -> tuple[str, ...]:
        """Return the local branch names in the bound repo."""

    @abstractmethod
    def list_local_branch_tips(self) -> tuple[LocalBranchTip, ...]:
        """Return local branch names and HEAD committer timestamps."""

    @abstractmethod
    def list_tracked_paths_at_ref(
        self,
        ref: str,
        path: str,
    ) -> tuple[str, ...] | GitCommandFailure:
        """Return tracked file paths under ``path`` at ``ref``.

        Missing paths return an empty tuple. Unknown refs or unexpected git errors
        return ``GitCommandFailure``.
        """

    @abstractmethod
    def list_directories_at_ref(
        self,
        ref: str,
        path: str,
    ) -> tuple[str, ...] | GitCommandFailure:
        """Return direct child directory names at ``<ref>:<path>``.

        Missing paths return an empty tuple. Unknown refs or unexpected git errors
        return ``GitCommandFailure``.
        """

    @abstractmethod
    def tree_oids_at_refs(
        self,
        refs: tuple[str, ...],
        path: str,
    ) -> dict[str, str | None] | GitCommandFailure:
        """Return the tree object ID for ``<ref>:<path>`` across refs.

        Missing paths and non-tree objects map to ``None``. Unexpected git
        command failures return :class:`GitCommandFailure`.
        """

    @abstractmethod
    def path_exists_at_ref(self, ref: str, path: str) -> bool:
        """Return True when ``<ref>:<path>`` exists in the git object database."""

    @abstractmethod
    def get_restructured_files(
        self,
        cwd: Path,
        base_ref_name: str,
    ) -> tuple[RestructuredFile, ...] | GitCommandFailure:
        """Return renamed/copied files against ``origin/<base_ref_name>...HEAD``."""

    @abstractmethod
    def list_worktrees(self) -> tuple[WorktreeInfo, ...]:
        """List worktrees registered with the bound repo."""

    @abstractmethod
    def add_worktree(
        self,
        path: Path,
        branch: str,
        *,
        create_branch: bool,
    ) -> WorktreeInfo:
        """Add a worktree for ``branch`` at ``path`` and return its info."""

    @abstractmethod
    def add_detached_worktree(self, path: Path, ref: str) -> WorktreeInfo:
        """Add a detached worktree at ``path`` pointing at ``ref``."""

    @abstractmethod
    def remove_worktree(self, path: Path) -> None:
        """Remove the worktree rooted at ``path``."""

    @abstractmethod
    def checkout_branch(self, cwd: Path, branch: str) -> None:
        """Check out ``branch`` in the worktree rooted at ``cwd``."""

    @abstractmethod
    def detach_head(self, cwd: Path, ref: str) -> None:
        """Detach HEAD at ``ref`` in the worktree rooted at ``cwd``."""

    @abstractmethod
    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        """Create ``branch`` at ``start_point`` in the bound repo."""

    @abstractmethod
    def delete_local_branch(self, branch: str) -> GitCommandFailure | None:
        """Safely delete a local branch in the bound repo; failure on non-zero exit."""

    @abstractmethod
    def delete_remote_branch(self, remote: str, branch: str) -> GitCommandFailure | None:
        """Delete ``remote``/``branch`` in the bound repo; failure on non-zero exit."""

    @abstractmethod
    def has_uncommitted_changes(self, cwd: Path) -> bool:
        """Return True when the worktree has staged, modified, or untracked files."""

    @abstractmethod
    def get_file_status(self, cwd: Path) -> FileStatus:
        """Return a ``FileStatus`` describing the worktree's dirty state."""

    @abstractmethod
    def file_last_touched_iso(self, ref: str, path: str) -> str | None:
        """Return ISO-8601 commit time of the last commit touching ``path`` reachable from ``ref``.

        Wraps ``git log -1 --format=%cI <ref> -- <path>``. Returns ``None``
        when the ref does not exist, the file is not present at the ref, or
        the underlying command fails. Useful for per-file timing on multi-file
        snapshot refs where the ref's head commit time would be misleading.
        """

    @abstractmethod
    def path_last_touched(self, ref: str, path: str) -> PathTouch | None:
        """Return the latest commit touching ``path`` in ``ref`` or a revision range.

        Wraps ``git log -1 --format=%H%x00%cI <ref> -- <path>``. ``ref`` may
        be a single ref such as ``HEAD`` or a revision range such as
        ``main..feature``. Returns ``None`` when the ref/range does not exist,
        no commit in the selected history touches the path, or the underlying
        command fails.
        """

    @abstractmethod
    def path_touches_under(
        self,
        ref_or_range: str,
        path: str,
    ) -> tuple[PathChangeTouch, ...] | GitCommandFailure:
        """Return commits newest-first with paths touched under ``path``.

        Wraps ``git log --format=%H%x00%cI --name-only <ref_or_range> -- <path>``.
        Empty output returns an empty tuple. A non-zero exit returns
        :class:`GitCommandFailure`.
        """

    @abstractmethod
    def branch_head_iso(self, branch: str) -> str | None:
        """Return ISO-8601 committer time of ``branch``'s HEAD commit.

        Wraps ``git log -1 --format=%cI <branch>``. Returns ``None`` when the
        branch does not exist or the underlying command fails. Used to compare
        branch HEAD against snapshot last-touched timestamps for up-to-date /
        stale snapshot detection.
        """

    @abstractmethod
    def branch_head_oid(self, branch: str) -> str | GitCommandFailure:
        """Return the full object ID for ``branch``'s HEAD commit."""

    @abstractmethod
    def fetch_remote_branch(
        self,
        cwd: Path,
        remote: str,
        branch: str,
    ) -> GitCommandFailure | None:
        """Fetch ``remote``/``branch`` from ``cwd``; return failure on non-zero exit."""

    @abstractmethod
    def pull_fast_forward(self, cwd: Path) -> GitCommandFailure | None:
        """Run ``git pull --ff-only`` in ``cwd``; return failure on non-zero exit."""

    @abstractmethod
    def update_local_ref(
        self,
        cwd: Path,
        ref: str,
        source: str,
    ) -> GitCommandFailure | None:
        """Update ``ref`` to ``source`` via ``git update-ref``; failure on non-zero exit."""

    @abstractmethod
    def log_range(self, range_spec: str) -> tuple[CommitSummary, ...] | GitCommandFailure:
        """Return commits in ``range_spec`` newest-first, or a command failure.

        Wraps ``git log --format=%H%x00%aI%x00%s <range_spec>``. The NUL
        delimiter keeps subjects with embedded spaces or tabs intact. Empty
        output (no commits in range) returns an empty tuple; a non-zero exit
        returns :class:`GitCommandFailure`.
        """

    @abstractmethod
    def patch_ids_for_range(
        self, range_spec: str
    ) -> tuple[tuple[str, str | None], ...] | GitCommandFailure:
        """Return ``(sha, patch_id)`` pairs for ``range_spec``, newest-first.

        ``patch_id`` is ``None`` for merge or empty/whitespace-only commits
        (where ``git patch-id --stable`` produces no output). A non-zero exit
        from either the underlying ``git log`` or ``git patch-id`` returns
        :class:`GitCommandFailure`.
        """

    @abstractmethod
    def commit_graph_from_base(
        self,
        *,
        base_branch: str,
        branches: tuple[str, ...],
    ) -> BranchCommitGraph | GitCommandFailure:
        """Return branch tips and commits reachable from those tips but not from base.

        ``branches`` are local branch names. The result includes a tip entry for
        each requested branch and commit nodes from ``git rev-list --parents``
        over those tips with ``base_branch`` excluded.
        """

    @abstractmethod
    def is_ancestor(self, maybe_ancestor: str, descendant: str) -> bool:
        """Return True when ``maybe_ancestor`` is reachable from ``descendant``.

        Wraps ``git merge-base --is-ancestor <maybe_ancestor> <descendant>``,
        which exits ``0`` for true, ``1`` for false, and other non-zero codes
        for command errors. Implementations treat any non-zero return as
        ``False`` (the typical "not a known ref" case) — callers that need to
        distinguish "not an ancestor" from "command failed" should validate
        ref existence separately first.
        """

    @abstractmethod
    def list_branches_merged_into(self, branch: str) -> tuple[str, ...] | GitCommandFailure:
        """Return local branches whose tips are reachable from ``branch``.

        Wraps ``git for-each-ref --merged=<branch> refs/heads/``. The result
        includes ``branch`` itself when it exists. A non-zero exit returns
        :class:`GitCommandFailure`.
        """

    @abstractmethod
    def count_commits_in_range(self, range_spec: str) -> int | GitCommandFailure:
        """Return the commit count for ``range_spec`` (``git rev-list --count``).

        Used to measure how many commits separate two refs (e.g.
        ``branch..HEAD``) when ranking ancestor candidates by nearness. A
        non-zero exit returns :class:`GitCommandFailure`; callers ranking many
        candidates typically translate that into a sentinel "skip" rather
        than abort the whole walk.
        """
