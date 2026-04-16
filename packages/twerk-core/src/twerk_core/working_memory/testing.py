"""In-memory fake working memory gateway."""

from __future__ import annotations

from twerk_core.working_memory.gateway import WorkingMemoryGateway


class FakeWorkingMemoryGateway(WorkingMemoryGateway):
    """In-memory fake with constructor-only state and mutation tracking."""

    def __init__(self, *, initial_files: dict[str, dict[str, str]] | None = None) -> None:
        self._store: dict[str, dict[str, str]] = (
            {branch: dict(files) for branch, files in initial_files.items()}
            if initial_files
            else {}
        )
        self._write_log: list[tuple[str, dict[str, str]]] = []

    def write(self, branch: str, files: dict[str, str]) -> None:
        self._store.setdefault(branch, {}).update(files)
        self._write_log.append((branch, dict(files)))

    def read(self, branch: str, path: str) -> str | None:
        return self._store.get(branch, {}).get(path)

    def exists(self, branch: str) -> bool:
        return branch in self._store
