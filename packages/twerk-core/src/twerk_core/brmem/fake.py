"""In-memory fake branch memory gateway."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from twerk_core.brmem.gateway import (
    BranchDiagnostic,
    BranchMemoryGateway,
    PathDiagnostic,
    _PathList,
    validate_branch_name,
    validate_memory_path,
)

_FAKE_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


class FakeBranchMemoryGateway(BranchMemoryGateway):
    """In-memory fake with constructor-only state and mutation tracking."""

    def __init__(
        self,
        *,
        initial_files: dict[str, dict[str, str]] | None = None,
    ) -> None:
        self._snapshots_by_sha: dict[str, dict[str, str]] = {}
        self._head_by_branch: dict[str, str] = {}
        self._commit_dates_by_sha: dict[str, str] = {}
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

    def check_path(self, branch: str, path: str, *, at: str | None = None) -> PathDiagnostic | None:
        validate_branch_name(branch)
        validate_memory_path(path)

        if at is None:
            target_sha = self._head_by_branch.get(branch)
        else:
            target_sha = at if at in self._snapshots_by_sha else None
        if target_sha is None:
            return None

        snapshot = self._snapshots_by_sha[target_sha]
        if path not in snapshot:
            return None

        content = snapshot[path]
        return PathDiagnostic(
            blob_sha=f"blob-{target_sha}-{path}",
            size_bytes=len(content.encode("utf-8")),
            last_commit_sha=target_sha,
            last_commit_date=self._commit_dates_by_sha[target_sha],
        )

    def check_branch(self, branch: str) -> BranchDiagnostic | None:
        validate_branch_name(branch)
        head = self._head_by_branch.get(branch)
        if head is None:
            return None
        return BranchDiagnostic(
            head_sha=head,
            head_date=self._commit_dates_by_sha[head],
            path_count=len(self._snapshots_by_sha[head]),
        )

    def _record_snapshot(self, snapshot: dict[str, str]) -> str:
        commit_sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1
        self._snapshots_by_sha[commit_sha] = dict(snapshot)
        self._commit_dates_by_sha[commit_sha] = commit_date
        return commit_sha

    def _snapshot_for_branch(self, branch: str) -> dict[str, str]:
        head = self._head_by_branch.get(branch)
        if head is None:
            return {}
        return self._snapshots_by_sha[head]
