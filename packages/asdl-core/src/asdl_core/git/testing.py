"""Test utilities for the shared git gateway."""

from __future__ import annotations

import subprocess
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Final

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import (
    BranchCommitGraph,
    CommitGraphNode,
    CommitSummary,
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    LocalBranchTip,
    LocalBranchTipRef,
    PathChangeTouch,
    PathTouch,
    RestructuredFile,
    WorktreeInfo,
    WorktreeOccupancy,
)


class _Unset:
    """Sentinel type distinguishing an unprovided kwarg from an explicit None."""


_UNSET: Final = _Unset()


def _path_is_under(candidate: str, path: str) -> bool:
    normalized = path.rstrip("/")
    return candidate == normalized or candidate.startswith(f"{normalized}/")


def _fake_tree_oid_for_paths(path: str, paths: tuple[str, ...]) -> str:
    return f"fake-tree:{path}:{'|'.join(paths)}"


def _nearest_seeded_ancestor(
    *,
    branch: str,
    branch_set: set[str],
    ancestors: set[tuple[str, str]],
    ahead_counts: dict[str, int],
) -> str | None:
    branch_ahead_count = ahead_counts[branch]
    eligible: list[tuple[int, str]] = []
    for candidate, descendant in ancestors:
        if descendant != branch or candidate not in branch_set:
            continue
        candidate_ahead_count = ahead_counts[candidate]
        if candidate_ahead_count <= 0 or candidate_ahead_count >= branch_ahead_count:
            continue
        eligible.append((branch_ahead_count - candidate_ahead_count, candidate))
    if not eligible:
        return None
    return min(eligible)[1]


class FakeGitGateway(GitGateway):
    """In-memory fake for the shared git gateway."""

    def __init__(
        self,
        *,
        repo_root: Path | None = None,
        git_common_dir: Path | None | _Unset = _UNSET,
        branches: Iterable[str] = (),
        worktrees: tuple[WorktreeInfo, ...] = (),
        current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None,
        previous_branch_by_path: dict[Path, str | None] | None = None,
        trunk_branch: str = "main",
        file_status_by_path: dict[Path, FileStatus] | None = None,
        uncommitted_changes_by_cwd_path: dict[tuple[Path, str], bool] | None = None,
        operations_by_path: dict[Path, WorktreeOccupancy] | None = None,
        checkout_failures_by_path: dict[Path, GitCommandFailure] | None = None,
        detach_head_failures_by_path: dict[Path, subprocess.CalledProcessError] | None = None,
        existing_paths: Iterable[Path] = (),
        repository_root_by_cwd: dict[Path, Path] | None = None,
        restructured_files_by_key: (
            dict[tuple[Path, str], tuple[RestructuredFile, ...] | GitCommandFailure] | None
        ) = None,
        directories_by_ref_path: dict[tuple[str, str], tuple[str, ...]] | None = None,
        tracked_paths_by_ref_path: (
            dict[tuple[str, str], tuple[str, ...] | GitCommandFailure] | None
        ) = None,
        tree_oid_by_ref_path: dict[tuple[str, str], str | None | GitCommandFailure] | None = None,
        paths_at_ref: Iterable[tuple[str, str]] = (),
        file_last_touched_by_ref_path: dict[tuple[str, str], str] | None = None,
        path_touch_by_ref_path: dict[tuple[str, str], PathTouch] | None = None,
        path_change_touches_by_ref_path: (
            dict[tuple[str, str], tuple[PathChangeTouch, ...] | GitCommandFailure] | None
        ) = None,
        branch_head_iso_by_branch: dict[str, str] | None = None,
        branch_head_oid_by_branch: dict[str, str] | None = None,
        delete_local_branch_failure_by_branch: dict[str, GitCommandFailure] | None = None,
        delete_remote_branch_failure_by_args: (
            dict[tuple[str, str], GitCommandFailure] | None
        ) = None,
        fetch_failure_by_args: dict[tuple[Path, str, str], GitCommandFailure] | None = None,
        pull_failure_by_cwd: dict[Path, GitCommandFailure] | None = None,
        update_ref_failure_by_args: (dict[tuple[Path, str, str], GitCommandFailure] | None) = None,
        commits_by_range: dict[str, tuple[CommitSummary, ...]] | None = None,
        log_range_failure: GitCommandFailure | None = None,
        patch_ids_by_range: dict[str, tuple[tuple[str, str | None], ...]] | None = None,
        patch_ids_failure: GitCommandFailure | None = None,
        commit_graph_by_base_branches: (
            dict[tuple[str, tuple[str, ...]], BranchCommitGraph | GitCommandFailure] | None
        ) = None,
        ancestors: Iterable[tuple[str, str]] = (),
        commit_count_by_range: dict[str, int | GitCommandFailure] | None = None,
        on_add_worktree: Callable[[Path], None] | None = None,
    ) -> None:
        self._repo_root = repo_root if repo_root is not None else Path("/repo")
        if isinstance(git_common_dir, _Unset):
            self._git_common_dir: Path | None = self._repo_root / ".git"
        else:
            self._git_common_dir = git_common_dir
        self._branches = set(branches)
        self._worktrees = list(worktrees)
        self._current_branch_by_path = dict(current_branch_by_path or {})
        self._previous_branch_by_path = dict(previous_branch_by_path or {})
        self._trunk_branch = trunk_branch
        self._file_status_by_path = dict(file_status_by_path or {})
        self._uncommitted_changes_by_cwd_path = dict(uncommitted_changes_by_cwd_path or {})
        self._operations_by_path = dict(operations_by_path or {})
        self._checkout_failures_by_path = dict(checkout_failures_by_path or {})
        self._detach_head_failures_by_path = dict(detach_head_failures_by_path or {})
        self._existing_paths = set(existing_paths)
        self._repository_root_by_cwd = dict(repository_root_by_cwd or {})
        self._restructured_files_by_key = dict(restructured_files_by_key or {})
        self._directories_by_ref_path = dict(directories_by_ref_path or {})
        self._tracked_paths_by_ref_path = dict(tracked_paths_by_ref_path or {})
        self._tree_oid_by_ref_path = dict(tree_oid_by_ref_path or {})
        self._paths_at_ref = set(paths_at_ref)
        self._file_last_touched_by_ref_path = dict(file_last_touched_by_ref_path or {})
        self._path_touch_by_ref_path = dict(path_touch_by_ref_path or {})
        self._path_change_touches_by_ref_path = dict(path_change_touches_by_ref_path or {})
        self._branch_head_iso_by_branch = dict(branch_head_iso_by_branch or {})
        self._branch_head_oid_by_branch = dict(branch_head_oid_by_branch or {})
        self._delete_local_branch_failure_by_branch = dict(
            delete_local_branch_failure_by_branch or {}
        )
        self._delete_remote_branch_failure_by_args = dict(
            delete_remote_branch_failure_by_args or {}
        )
        self._fetch_failure_by_args = dict(fetch_failure_by_args or {})
        self._pull_failure_by_cwd = dict(pull_failure_by_cwd or {})
        self._update_ref_failure_by_args = dict(update_ref_failure_by_args or {})
        self._commits_by_range = dict(commits_by_range or {})
        self._log_range_failure = log_range_failure
        self._patch_ids_by_range = dict(patch_ids_by_range or {})
        self._patch_ids_failure = patch_ids_failure
        self._commit_graph_by_base_branches = dict(commit_graph_by_base_branches or {})
        self._ancestors = {(maybe_ancestor, descendant) for maybe_ancestor, descendant in ancestors}
        self._commit_count_by_range: dict[str, int | GitCommandFailure] = dict(
            commit_count_by_range or {}
        )
        self._on_add_worktree = on_add_worktree

        self._add_worktree_calls: list[tuple[Path, Path, str, bool]] = []
        self._add_detached_worktree_calls: list[tuple[Path, Path, str]] = []
        self._remove_worktree_calls: list[tuple[Path, Path]] = []
        self._checkout_calls: list[tuple[Path, str]] = []
        self._create_branch_calls: list[tuple[str, str, bool]] = []
        self._delete_local_branch_calls: list[tuple[str, bool]] = []
        self._delete_remote_branch_calls: list[tuple[str, str]] = []
        self._detach_head_calls: list[tuple[Path, str]] = []
        self._fetch_calls: list[tuple[Path, str, str]] = []
        self._pull_calls: list[Path] = []
        self._update_ref_calls: list[tuple[Path, str, str]] = []
        self._list_local_branches_calls: list[None] = []
        self._list_local_branch_tips_calls: list[None] = []
        self._list_tracked_paths_at_ref_calls: list[tuple[str, str]] = []
        self._tree_oids_at_refs_calls: list[tuple[tuple[str, ...], str]] = []
        self._path_last_touched_calls: list[tuple[str, str]] = []
        self._has_uncommitted_changes_under_calls: list[tuple[Path, str]] = []
        self._path_touches_under_calls: list[tuple[str, str]] = []
        self._list_branches_merged_into_calls: list[str] = []
        self._count_commits_in_range_calls: list[str] = []
        self._commit_graph_from_base_calls: list[tuple[str, tuple[str, ...]]] = []

    def path_exists(self, path: Path) -> bool:
        if path in self._existing_paths:
            return True
        return any(wt.path == path for wt in self._worktrees)

    def get_repository_root(self, cwd: Path) -> Path:
        if cwd in self._repository_root_by_cwd:
            return self._repository_root_by_cwd[cwd]
        return self._repo_root

    def get_git_common_dir(self, cwd: Path) -> Path | None:
        return self._git_common_dir

    def get_current_branch(self, cwd: Path) -> str | DetachedHead | GitCommandFailure:
        result = self._current_branch_by_path.get(cwd)
        if result is None:
            return DetachedHead()
        return result

    def get_previous_branch(self, cwd: Path) -> str | None:
        return self._previous_branch_by_path.get(cwd)

    def get_trunk_branch(self) -> str:
        return self._trunk_branch

    def branch_exists(self, branch: str) -> bool:
        return branch in self._branches

    def list_local_branches(self) -> tuple[str, ...]:
        self._list_local_branches_calls.append(None)
        return tuple(sorted(self._branches))

    def list_local_branch_tips(self) -> tuple[LocalBranchTip, ...]:
        self._list_local_branch_tips_calls.append(None)
        return tuple(
            LocalBranchTip(
                name=branch,
                head_iso=self._branch_head_iso_by_branch.get(branch),
            )
            for branch in sorted(self._branches)
        )

    def list_tracked_paths_at_ref(
        self,
        ref: str,
        path: str,
    ) -> tuple[str, ...] | GitCommandFailure:
        self._list_tracked_paths_at_ref_calls.append((ref, path))
        return self._tracked_paths_by_ref_path.get((ref, path), ())

    def list_directories_at_ref(
        self,
        ref: str,
        path: str,
    ) -> tuple[str, ...] | GitCommandFailure:
        return self._directories_by_ref_path.get((ref, path), ())

    def tree_oids_at_refs(
        self,
        refs: tuple[str, ...],
        path: str,
    ) -> dict[str, str | None] | GitCommandFailure:
        self._tree_oids_at_refs_calls.append((refs, path))
        tree_oids: dict[str, str | None] = {}
        for ref in refs:
            result = self._tree_oid_by_ref_path.get((ref, path))
            if isinstance(result, GitCommandFailure):
                return result
            if result is not None or (ref, path) in self._tree_oid_by_ref_path:
                tree_oids[ref] = result
                continue
            paths_result = self._tracked_paths_by_ref_path.get((ref, path))
            if isinstance(paths_result, GitCommandFailure):
                return paths_result
            if paths_result is None:
                tree_oids[ref] = None
            else:
                tree_oids[ref] = _fake_tree_oid_for_paths(path, paths_result)
        return tree_oids

    def path_exists_at_ref(self, ref: str, path: str) -> bool:
        return (ref, path) in self._paths_at_ref

    def get_restructured_files(
        self,
        cwd: Path,
        base_ref_name: str,
    ) -> tuple[RestructuredFile, ...] | GitCommandFailure:
        result = self._restructured_files_by_key.get((cwd, base_ref_name))
        if result is None:
            return ()
        return result

    def list_worktrees(self) -> tuple[WorktreeInfo, ...]:
        return tuple(self._worktrees)

    def list_branch_occupancies(self) -> tuple[WorktreeOccupancy, ...]:
        occupancies: list[WorktreeOccupancy] = []
        for wt in self._worktrees:
            seeded = self._operations_by_path.get(wt.path)
            if seeded is not None:
                occupancies.append(seeded)
            elif wt.branch is not None:
                occupancies.append(
                    WorktreeOccupancy(path=wt.path, branch=wt.branch, operation="checked-out")
                )
        return tuple(occupancies)

    def add_worktree(
        self,
        path: Path,
        branch: str,
        *,
        create_branch: bool,
    ) -> WorktreeInfo:
        self._add_worktree_calls.append((self._repo_root, path, branch, create_branch))
        info = WorktreeInfo(path=path, branch=branch, is_bare=False)
        self._worktrees.append(info)
        self._existing_paths.add(path)
        self._current_branch_by_path[path] = branch
        if self._on_add_worktree is not None:
            self._on_add_worktree(path)
        return info

    def add_detached_worktree(self, path: Path, ref: str) -> WorktreeInfo:
        self._add_detached_worktree_calls.append((self._repo_root, path, ref))
        info = WorktreeInfo(path=path, branch=None, is_bare=False)
        self._worktrees.append(info)
        self._existing_paths.add(path)
        self._current_branch_by_path[path] = DetachedHead()
        if self._on_add_worktree is not None:
            self._on_add_worktree(path)
        return info

    def remove_worktree(self, path: Path) -> None:
        self._remove_worktree_calls.append((self._repo_root, path))
        self._worktrees = [wt for wt in self._worktrees if wt.path != path]
        self._existing_paths.discard(path)
        self._current_branch_by_path.pop(path, None)
        self._file_status_by_path.pop(path, None)

    def checkout_branch(self, cwd: Path, branch: str) -> GitCommandFailure | None:
        self._checkout_calls.append((cwd, branch))
        failure = self._checkout_failures_by_path.get(cwd)
        if failure is not None:
            return failure
        self._current_branch_by_path[cwd] = branch
        self._worktrees = [
            WorktreeInfo(path=wt.path, branch=branch, is_bare=wt.is_bare) if wt.path == cwd else wt
            for wt in self._worktrees
        ]
        return None

    def detach_head(self, cwd: Path, ref: str) -> None:
        self._detach_head_calls.append((cwd, ref))
        if cwd in self._detach_head_failures_by_path:
            raise self._detach_head_failures_by_path[cwd]
        self._current_branch_by_path[cwd] = DetachedHead()
        self._worktrees = [
            WorktreeInfo(path=wt.path, branch=None, is_bare=wt.is_bare) if wt.path == cwd else wt
            for wt in self._worktrees
        ]

    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        if branch in self._branches and not force:
            raise AssertionError(f"branch {branch!r} already exists; pass force=True to move it")
        self._create_branch_calls.append((branch, start_point, force))
        self._branches.add(branch)

    def delete_local_branch(self, branch: str, *, force: bool) -> GitCommandFailure | None:
        self._delete_local_branch_calls.append((branch, force))
        failure = self._delete_local_branch_failure_by_branch.get(branch)
        if failure is not None:
            return failure
        if branch not in self._branches:
            return GitCommandFailure(message=f"unknown branch: {branch}", returncode=1)
        self._branches.remove(branch)
        return None

    def delete_remote_branch(self, remote: str, branch: str) -> GitCommandFailure | None:
        self._delete_remote_branch_calls.append((remote, branch))
        return self._delete_remote_branch_failure_by_args.get((remote, branch))

    def has_uncommitted_changes(self, cwd: Path) -> bool:
        status = self.get_file_status(cwd)
        return status.staged or status.modified or status.untracked

    def has_uncommitted_changes_under(self, cwd: Path, path: str) -> bool:
        self._has_uncommitted_changes_under_calls.append((cwd, path))
        return self._uncommitted_changes_by_cwd_path.get((cwd, path), False)

    def get_file_status(self, cwd: Path) -> FileStatus:
        return self._file_status_by_path.get(
            cwd, FileStatus(staged=False, modified=False, untracked=False)
        )

    def file_last_touched_iso(self, ref: str, path: str) -> str | None:
        touch = self.path_last_touched(ref, path)
        if touch is not None:
            return touch.committed_iso
        return self._file_last_touched_by_ref_path.get((ref, path))

    def path_last_touched(self, ref: str, path: str) -> PathTouch | None:
        self._path_last_touched_calls.append((ref, path))
        key = (ref, path)
        touch = self._path_touch_by_ref_path.get(key)
        if touch is not None:
            return touch
        committed_iso = self._file_last_touched_by_ref_path.get(key)
        if committed_iso is None:
            return None
        return PathTouch(oid=f"{ref}:{path}", committed_iso=committed_iso)

    def path_touches_under(
        self,
        ref_or_range: str,
        path: str,
    ) -> tuple[PathChangeTouch, ...] | GitCommandFailure:
        self._path_touches_under_calls.append((ref_or_range, path))
        key = (ref_or_range, path)
        seeded = self._path_change_touches_by_ref_path.get(key)
        if seeded is not None:
            return seeded
        return self._synthesized_path_change_touches_under(ref_or_range, path)

    def _synthesized_path_change_touches_under(
        self,
        ref_or_range: str,
        path: str,
    ) -> tuple[PathChangeTouch, ...]:
        touches: list[PathChangeTouch] = []
        for (touch_ref, touch_path), touch in self._path_touch_by_ref_path.items():
            if touch_ref == ref_or_range and _path_is_under(touch_path, path):
                touches.append(
                    PathChangeTouch(
                        oid=touch.oid,
                        committed_iso=touch.committed_iso,
                        paths=(f"{touch_path.rstrip('/')}/__fake_touch__",),
                    )
                )
        for (touch_ref, touch_path), committed_iso in self._file_last_touched_by_ref_path.items():
            if touch_ref == ref_or_range and _path_is_under(touch_path, path):
                touches.append(
                    PathChangeTouch(
                        oid=f"{touch_ref}:{touch_path}",
                        committed_iso=committed_iso,
                        paths=(f"{touch_path.rstrip('/')}/__fake_touch__",),
                    )
                )
        return tuple(sorted(touches, key=lambda touch: touch.committed_iso, reverse=True))

    def branch_head_iso(self, branch: str) -> str | None:
        if branch not in self._branches:
            return None
        return self._branch_head_iso_by_branch.get(branch)

    def branch_head_oid(self, branch: str) -> str | GitCommandFailure:
        if branch not in self._branches:
            return GitCommandFailure(message=f"unknown branch: {branch}", returncode=1)
        return self._branch_head_oid_by_branch.get(branch, "HEAD")

    def fetch_remote_branch(
        self,
        cwd: Path,
        remote: str,
        branch: str,
    ) -> GitCommandFailure | None:
        self._fetch_calls.append((cwd, remote, branch))
        return self._fetch_failure_by_args.get((cwd, remote, branch))

    def pull_fast_forward(self, cwd: Path) -> GitCommandFailure | None:
        self._pull_calls.append(cwd)
        return self._pull_failure_by_cwd.get(cwd)

    def update_local_ref(
        self,
        cwd: Path,
        ref: str,
        source: str,
    ) -> GitCommandFailure | None:
        self._update_ref_calls.append((cwd, ref, source))
        return self._update_ref_failure_by_args.get((cwd, ref, source))

    def log_range(self, range_spec: str) -> tuple[CommitSummary, ...] | GitCommandFailure:
        if self._log_range_failure is not None:
            return self._log_range_failure
        return self._commits_by_range.get(range_spec, ())

    def patch_ids_for_range(
        self, range_spec: str
    ) -> tuple[tuple[str, str | None], ...] | GitCommandFailure:
        if self._patch_ids_failure is not None:
            return self._patch_ids_failure
        return self._patch_ids_by_range.get(range_spec, ())

    def commit_graph_from_base(
        self,
        *,
        base_branch: str,
        branches: tuple[str, ...],
    ) -> BranchCommitGraph | GitCommandFailure:
        key = (base_branch, tuple(sorted(set(branches))))
        self._commit_graph_from_base_calls.append(key)
        seeded = self._commit_graph_by_base_branches.get(key)
        if seeded is not None:
            return seeded
        return self._synthesize_commit_graph_from_counts(
            base_branch=base_branch,
            branches=key[1],
        )

    def _synthesize_commit_graph_from_counts(
        self,
        *,
        base_branch: str,
        branches: tuple[str, ...],
    ) -> BranchCommitGraph | GitCommandFailure:
        ahead_counts: dict[str, int] = {}
        for branch in branches:
            count = self._commit_count_by_range.get(f"{base_branch}..{branch}", 0)
            if isinstance(count, GitCommandFailure):
                return count
            ahead_counts[branch] = count

        nodes_by_oid: dict[str, CommitGraphNode] = {}
        tip_oid_by_branch: dict[str, str] = {}
        visiting: set[str] = set()

        def build_tip(branch: str) -> str:
            if branch in tip_oid_by_branch:
                return tip_oid_by_branch[branch]
            if branch in visiting:
                tip_oid_by_branch[branch] = f"{branch}@cycle"
                return tip_oid_by_branch[branch]

            visiting.add(branch)
            ahead_count = ahead_counts[branch]
            if ahead_count <= 0:
                tip_oid = f"{branch}@base"
                tip_oid_by_branch[branch] = tip_oid
                visiting.remove(branch)
                return tip_oid

            parent_branch = _nearest_seeded_ancestor(
                branch=branch,
                branch_set=set(branches),
                ancestors=self._ancestors,
                ahead_counts=ahead_counts,
            )
            parent_count = 0
            previous_oid: str | None = None
            if parent_branch is not None:
                parent_count = ahead_counts[parent_branch]
                previous_oid = build_tip(parent_branch)

            for commit_number in range(parent_count + 1, ahead_count + 1):
                oid = f"{branch}@{commit_number}"
                if previous_oid is None or previous_oid not in nodes_by_oid:
                    parent_oids: tuple[str, ...] = ()
                else:
                    parent_oids = (previous_oid,)
                nodes_by_oid[oid] = CommitGraphNode(oid=oid, parent_oids=parent_oids)
                previous_oid = oid

            assert previous_oid is not None
            tip_oid_by_branch[branch] = previous_oid
            visiting.remove(branch)
            return previous_oid

        for branch in branches:
            build_tip(branch)

        return BranchCommitGraph(
            base_branch=base_branch,
            branch_tips=tuple(
                LocalBranchTipRef(branch=branch, oid=tip_oid_by_branch[branch])
                for branch in branches
            ),
            commits=tuple(nodes_by_oid[oid] for oid in sorted(nodes_by_oid)),
        )

    def is_ancestor(self, maybe_ancestor: str, descendant: str) -> bool:
        return (maybe_ancestor, descendant) in self._ancestors

    def list_branches_merged_into(self, branch: str) -> tuple[str, ...] | GitCommandFailure:
        self._list_branches_merged_into_calls.append(branch)
        branches = {branch}
        branches.update(
            maybe_ancestor for maybe_ancestor, descendant in self._ancestors if descendant == branch
        )
        return tuple(sorted(branches))

    def count_commits_in_range(self, range_spec: str) -> int | GitCommandFailure:
        self._count_commits_in_range_calls.append(range_spec)
        if range_spec not in self._commit_count_by_range:
            return 0
        return self._commit_count_by_range[range_spec]

    @property
    def list_local_branches_calls(self) -> tuple[None, ...]:
        return tuple(self._list_local_branches_calls)

    @property
    def list_local_branch_tips_calls(self) -> tuple[None, ...]:
        return tuple(self._list_local_branch_tips_calls)

    @property
    def list_tracked_paths_at_ref_calls(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._list_tracked_paths_at_ref_calls)

    @property
    def tree_oids_at_refs_calls(self) -> tuple[tuple[tuple[str, ...], str], ...]:
        return tuple(self._tree_oids_at_refs_calls)

    @property
    def path_last_touched_calls(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._path_last_touched_calls)

    @property
    def has_uncommitted_changes_under_calls(self) -> tuple[tuple[Path, str], ...]:
        return tuple(self._has_uncommitted_changes_under_calls)

    @property
    def path_touches_under_calls(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._path_touches_under_calls)

    @property
    def list_branches_merged_into_calls(self) -> tuple[str, ...]:
        return tuple(self._list_branches_merged_into_calls)

    @property
    def count_commits_in_range_calls(self) -> tuple[str, ...]:
        return tuple(self._count_commits_in_range_calls)

    @property
    def commit_graph_from_base_calls(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        return tuple(self._commit_graph_from_base_calls)

    @property
    def fetch_calls(self) -> tuple[tuple[Path, str, str], ...]:
        return tuple(self._fetch_calls)

    @property
    def pull_calls(self) -> tuple[Path, ...]:
        return tuple(self._pull_calls)

    @property
    def update_ref_calls(self) -> tuple[tuple[Path, str, str], ...]:
        return tuple(self._update_ref_calls)

    @property
    def delete_local_branch_calls(self) -> tuple[tuple[str, bool], ...]:
        return tuple(self._delete_local_branch_calls)

    @property
    def delete_remote_branch_calls(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._delete_remote_branch_calls)
