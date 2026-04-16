"""Testing fakes for workbranch git operations."""

from __future__ import annotations

from twerk_core.workbranch.git_gateway import WorkbranchGitGateway


class FakeWorkbranchGitGateway(WorkbranchGitGateway):
    """In-memory fake git gateway with constructor-only setup."""

    def __init__(
        self,
        *,
        current_branch: str | None = None,
        existing_branches: set[str] | None = None,
    ) -> None:
        self._current_branch = current_branch
        self._existing_branches = set(existing_branches) if existing_branches else set()
        self._created_branches: list[str] = []

    def create_branch_at_head(self, name: str) -> None:
        if name in self._existing_branches:
            raise ValueError(f"branch already exists: {name}")
        self._existing_branches.add(name)
        self._created_branches.append(name)

    def get_current_branch(self) -> str | None:
        return self._current_branch

    def branch_exists(self, name: str) -> bool:
        return name in self._existing_branches
