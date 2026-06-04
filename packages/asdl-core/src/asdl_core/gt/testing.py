from __future__ import annotations

from pathlib import Path

from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.types import (
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
    StackInfo,
    UntrackedBranch,
)

ParentResult = str | NoParent | UntrackedBranch | GtCommandFailure
ChildrenResult = tuple[str, ...] | UntrackedBranch | GtCommandFailure
StackResult = StackInfo | UntrackedBranch | GtCommandFailure


class FakeGtGateway(GtGateway):
    """Constructor-seeded fake for Graphite-driven tests."""

    def __init__(
        self,
        *,
        parent_by_cwd: dict[Path, ParentResult] | None = None,
        parent_by_branch: dict[str, ParentResult] | None = None,
        children_by_cwd: dict[Path, ChildrenResult] | None = None,
        children_by_branch: dict[str, ChildrenResult] | None = None,
        branch_by_cwd: dict[Path, str] | None = None,
        trunk: str | GtCommandFailure = "main",
        branch_info_by_cwd: dict[Path, GtBranchInfo | UntrackedBranch | GtCommandFailure]
        | None = None,
        restack_failure_by_branch: dict[str, GtCommandFailure] | None = None,
        sync_failure: GtCommandFailure | None = None,
        stack_by_cwd: dict[Path, StackResult] | None = None,
        stack_by_branch: dict[str, StackResult] | None = None,
    ) -> None:
        self._parent_by_cwd = dict(parent_by_cwd or {})
        self._parent_by_branch = dict(parent_by_branch or {})
        self._children_by_cwd = dict(children_by_cwd or {})
        self._children_by_branch = dict(children_by_branch or {})
        self._branch_by_cwd = dict(branch_by_cwd or {})
        self._trunk = trunk
        self._branch_info_by_cwd = dict(branch_info_by_cwd or {})
        self._restack_failure_by_branch = dict(restack_failure_by_branch or {})
        self._sync_failure = sync_failure
        self._stack_by_cwd = dict(stack_by_cwd or {})
        self._stack_by_branch = dict(stack_by_branch or {})
        self._parent_calls: list[Path] = []
        self._children_calls: list[Path] = []
        self._trunk_calls: list[Path] = []
        self._branch_info_calls: list[Path] = []
        self._restack_calls: list[tuple[Path, str]] = []
        self._sync_calls: list[tuple[Path, bool]] = []
        self._stack_calls: list[Path] = []

    def _branch_for_cwd(self, cwd: Path) -> str | None:
        return self._branch_by_cwd.get(cwd)

    def parent_of(self, cwd: Path) -> ParentResult:
        self._parent_calls.append(cwd)
        if cwd in self._parent_by_cwd:
            return self._parent_by_cwd[cwd]
        branch = self._branch_for_cwd(cwd)
        if branch is not None and branch in self._parent_by_branch:
            return self._parent_by_branch[branch]
        return NoParent()

    def children_of(self, cwd: Path) -> ChildrenResult:
        self._children_calls.append(cwd)
        if cwd in self._children_by_cwd:
            return self._children_by_cwd[cwd]
        branch = self._branch_for_cwd(cwd)
        if branch is not None and branch in self._children_by_branch:
            return self._children_by_branch[branch]
        return ()

    def trunk(self, cwd: Path) -> str | GtCommandFailure:
        self._trunk_calls.append(cwd)
        return self._trunk

    def branch_info(self, cwd: Path) -> GtBranchInfo | UntrackedBranch | GtCommandFailure:
        self._branch_info_calls.append(cwd)
        return self._branch_info_by_cwd.get(cwd, GtBranchInfo(raw_output=""))

    def restack_upstack(self, cwd: Path, branch: str) -> GtCommandFailure | None:
        self._restack_calls.append((cwd, branch))
        return self._restack_failure_by_branch.get(branch)

    def sync(self, cwd: Path, *, restack: bool) -> GtCommandFailure | None:
        self._sync_calls.append((cwd, restack))
        return self._sync_failure

    def stack(self, cwd: Path) -> StackInfo | UntrackedBranch | GtCommandFailure:
        self._stack_calls.append(cwd)
        if cwd in self._stack_by_cwd:
            return self._stack_by_cwd[cwd]
        branch = self._branch_for_cwd(cwd)
        if branch is not None and branch in self._stack_by_branch:
            return self._stack_by_branch[branch]
        trunk_name = self._trunk if isinstance(self._trunk, str) else "main"
        current = branch if branch is not None else trunk_name
        return StackInfo(
            trunk=trunk_name,
            current=current,
            ancestors=(),
            children=(),
            warnings=(),
        )

    @property
    def parent_calls(self) -> tuple[Path, ...]:
        return tuple(self._parent_calls)

    @property
    def children_calls(self) -> tuple[Path, ...]:
        return tuple(self._children_calls)

    @property
    def restack_calls(self) -> tuple[tuple[Path, str], ...]:
        return tuple(self._restack_calls)

    @property
    def sync_calls(self) -> tuple[tuple[Path, bool], ...]:
        return tuple(self._sync_calls)

    @property
    def stack_calls(self) -> tuple[Path, ...]:
        return tuple(self._stack_calls)
