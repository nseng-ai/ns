"""In-memory fake branch memory gateway."""

from __future__ import annotations

from twerk_core.brmem.gateway import (
    BranchMemoryGateway,
    _PathList,
    validate_branch_name,
    validate_memory_path,
)


class FakeBranchMemoryGateway(BranchMemoryGateway):
    """In-memory fake with constructor-only state and mutation tracking."""

    def __init__(
        self,
        *,
        initial_files: dict[str, dict[str, str]] | None = None,
    ) -> None:
        self._snapshots_by_sha: dict[str, dict[str, str]] = {}
        self._head_by_branch: dict[str, str] = {}
        self._put_calls: list[tuple[str, str, str]] = []
        self._next_commit_number = 1

        for branch, files in (initial_files or {}).items():
            validate_branch_name(branch)
            snapshot: dict[str, str] = {}
            for path, content in files.items():
                validate_memory_path(path)
                snapshot[path] = content
            self._head_by_branch[branch] = self._record_snapshot(snapshot)

    def put(self, branch: str, path: str, content: str) -> str:
        validate_branch_name(branch)
        validate_memory_path(path)

        snapshot = dict(self._snapshot_for_branch(branch))
        snapshot[path] = content
        commit_sha = self._record_snapshot(snapshot)
        self._head_by_branch[branch] = commit_sha
        self._put_calls.append((branch, path, content))
        return commit_sha

    def get(self, branch: str, path: str, *, at: str | None = None) -> str | None:
        validate_branch_name(branch)
        validate_memory_path(path)

        if at is None:
            head = self._head_by_branch.get(branch)
            if head is None:
                return None
            return self._snapshots_by_sha[head].get(path)

        snapshot = self._snapshots_by_sha.get(at)
        if snapshot is None:
            return None
        return snapshot.get(path)

    def list(self, branch: str, *, at: str | None = None) -> _PathList:
        validate_branch_name(branch)
        if at is None:
            snapshot = self._snapshot_for_branch(branch)
        else:
            snapshot = self._snapshots_by_sha.get(at, {})
        return sorted(snapshot.keys())

    def _record_snapshot(self, snapshot: dict[str, str]) -> str:
        commit_sha = f"fake-{self._next_commit_number:04d}"
        self._next_commit_number += 1
        self._snapshots_by_sha[commit_sha] = dict(snapshot)
        return commit_sha

    def _snapshot_for_branch(self, branch: str) -> dict[str, str]:
        head = self._head_by_branch.get(branch)
        if head is None:
            return {}
        return self._snapshots_by_sha[head]
