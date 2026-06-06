"""In-memory fake for roaster Graphite stack operations."""

from __future__ import annotations

from pathlib import Path

from roaster.gateways.graphite_stack.gateway import (
    GraphiteAttachTip,
    GraphiteAttachTipResult,
    GraphiteBranchExists,
    GraphiteBranchExistsResult,
    GraphiteStackCommandCompleted,
    GraphiteStackCommandResult,
    GraphiteStackFailure,
    GraphiteStackGateway,
    GraphiteStackOperationKind,
    GraphiteStackReadResult,
    GraphiteTargetStack,
)


class FakeGraphiteStackGateway(GraphiteStackGateway):
    """Record Graphite operations and return constructor-seeded state."""

    def __init__(
        self,
        *,
        current_stack: GraphiteTargetStack | None = None,
        stacks_by_target_branch: dict[str, GraphiteTargetStack] | None = None,
        existing_branches: set[str] | None = None,
        failures_by_operation: dict[GraphiteStackOperationKind, GraphiteStackFailure] | None = None,
    ) -> None:
        self._current_stack = current_stack or GraphiteTargetStack(
            target_branch="feature/impl",
            attach_tip="feature/impl",
            branches=("feature/impl",),
        )
        self._stacks_by_target_branch = dict(stacks_by_target_branch or {})
        self._existing_branches = set(existing_branches or self._current_stack.branches)
        self._failures_by_operation = dict(failures_by_operation or {})
        self._read_current_stack_calls: list[Path] = []
        self._resolve_attach_tip_calls: list[tuple[Path, str | None]] = []
        self._checkout_branch_calls: list[tuple[Path, str]] = []
        self._branch_exists_calls: list[tuple[Path, str]] = []
        self._create_generated_branch_calls: list[tuple[Path, str, str]] = []
        self._update_generated_branch_calls: list[tuple[Path, str, str]] = []
        self._submit_generated_stack_calls: list[Path] = []

    def read_current_stack(self, *, cwd: Path) -> GraphiteStackReadResult:
        self._read_current_stack_calls.append(cwd)
        failure = self._failure("read-current-stack")
        if failure is not None:
            return failure
        return self._current_stack

    def resolve_attach_tip(
        self,
        *,
        cwd: Path,
        target_branch: str | None = None,
    ) -> GraphiteAttachTipResult:
        self._resolve_attach_tip_calls.append((cwd, target_branch))
        failure = self._failure("resolve-attach-tip")
        if failure is not None:
            return failure

        stack = self._stack_for_target_branch(target_branch)
        return GraphiteAttachTip(target_branch=stack.target_branch, attach_tip=stack.attach_tip)

    def checkout_branch(self, *, cwd: Path, branch_name: str) -> GraphiteStackCommandResult:
        self._checkout_branch_calls.append((cwd, branch_name))
        failure = self._failure("checkout-branch")
        if failure is not None:
            return failure
        return GraphiteStackCommandCompleted(
            operation="checkout-branch",
            argv=("gt", "checkout", branch_name),
        )

    def branch_exists(self, *, cwd: Path, branch_name: str) -> GraphiteBranchExistsResult:
        self._branch_exists_calls.append((cwd, branch_name))
        failure = self._failure("branch-exists")
        if failure is not None:
            return failure
        return GraphiteBranchExists(
            branch_name=branch_name,
            exists=branch_name in self._existing_branches,
        )

    def create_generated_branch(
        self,
        *,
        cwd: Path,
        branch_name: str,
        batch_title: str,
    ) -> GraphiteStackCommandResult:
        self._create_generated_branch_calls.append((cwd, branch_name, batch_title))
        failure = self._failure("create-generated-branch")
        if failure is not None:
            return failure
        self._existing_branches.add(branch_name)
        return GraphiteStackCommandCompleted(
            operation="create-generated-branch",
            argv=("gt", "create", branch_name, "-m", f"roaster: {batch_title}"),
        )

    def update_generated_branch(
        self,
        *,
        cwd: Path,
        branch_name: str,
        batch_title: str,
    ) -> GraphiteStackCommandResult:
        self._update_generated_branch_calls.append((cwd, branch_name, batch_title))
        failure = self._failure("update-generated-branch")
        if failure is not None:
            return failure
        return GraphiteStackCommandCompleted(
            operation="update-generated-branch",
            argv=("gt", "modify", "-m", f"roaster: {batch_title}"),
        )

    def submit_generated_stack(self, *, cwd: Path) -> GraphiteStackCommandResult:
        self._submit_generated_stack_calls.append(cwd)
        failure = self._failure("submit-generated-stack")
        if failure is not None:
            return failure
        return GraphiteStackCommandCompleted(
            operation="submit-generated-stack",
            argv=("gt", "submit", "--no-interactive"),
        )

    def _stack_for_target_branch(self, target_branch: str | None) -> GraphiteTargetStack:
        if target_branch is not None and target_branch in self._stacks_by_target_branch:
            return self._stacks_by_target_branch[target_branch]
        if target_branch is None or target_branch == self._current_stack.target_branch:
            return self._current_stack
        return GraphiteTargetStack(
            target_branch=target_branch,
            attach_tip=target_branch,
            branches=(target_branch,),
        )

    def _failure(self, operation: GraphiteStackOperationKind) -> GraphiteStackFailure | None:
        return self._failures_by_operation.get(operation)

    @property
    def existing_branches(self) -> tuple[str, ...]:
        """Return known branches in deterministic order."""
        return tuple(sorted(self._existing_branches))

    @property
    def read_current_stack_calls(self) -> tuple[Path, ...]:
        """Return recorded current-stack reads."""
        return tuple(self._read_current_stack_calls)

    @property
    def resolve_attach_tip_calls(self) -> tuple[tuple[Path, str | None], ...]:
        """Return recorded attach-tip resolutions."""
        return tuple(self._resolve_attach_tip_calls)

    @property
    def checkout_branch_calls(self) -> tuple[tuple[Path, str], ...]:
        """Return recorded checkouts."""
        return tuple(self._checkout_branch_calls)

    @property
    def branch_exists_calls(self) -> tuple[tuple[Path, str], ...]:
        """Return recorded branch-existence checks."""
        return tuple(self._branch_exists_calls)

    @property
    def create_generated_branch_calls(self) -> tuple[tuple[Path, str, str], ...]:
        """Return recorded generated-branch creates."""
        return tuple(self._create_generated_branch_calls)

    @property
    def update_generated_branch_calls(self) -> tuple[tuple[Path, str, str], ...]:
        """Return recorded generated-branch updates."""
        return tuple(self._update_generated_branch_calls)

    @property
    def submit_generated_stack_calls(self) -> tuple[Path, ...]:
        """Return recorded generated-stack submissions."""
        return tuple(self._submit_generated_stack_calls)
