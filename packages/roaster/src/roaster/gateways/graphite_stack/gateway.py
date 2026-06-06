"""Gateway boundary for roaster-specific Graphite stack operations."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

GraphiteStackOperationKind = Literal[
    "read-current-stack",
    "resolve-attach-tip",
    "checkout-branch",
    "branch-exists",
    "create-generated-branch",
    "update-generated-branch",
    "submit-generated-stack",
]


@dataclass(frozen=True)
class GraphiteStackFailure:
    """A typed Graphite stack gateway failure."""

    error_type: str
    message: str
    operation: GraphiteStackOperationKind
    argv: tuple[str, ...] = ()
    returncode: int | None = None
    stdout: str = ""
    stderr: str = ""


@dataclass(frozen=True)
class GraphiteStackCommandCompleted:
    """A mutating or checkout Graphite command completed successfully."""

    operation: GraphiteStackOperationKind
    argv: tuple[str, ...]
    stdout: str = ""
    stderr: str = ""


@dataclass(frozen=True)
class GraphiteTargetStack:
    """Read-only snapshot of the target implementation stack."""

    target_branch: str
    attach_tip: str
    branches: tuple[str, ...]
    implementation_pr: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class GraphiteAttachTip:
    """Resolved branch where generated roaster branches should attach."""

    target_branch: str
    attach_tip: str


@dataclass(frozen=True)
class GraphiteBranchExists:
    """Result of checking whether a generated branch already exists."""

    branch_name: str
    exists: bool


GraphiteStackReadResult: TypeAlias = GraphiteTargetStack | GraphiteStackFailure
GraphiteAttachTipResult: TypeAlias = GraphiteAttachTip | GraphiteStackFailure
GraphiteStackCommandResult: TypeAlias = GraphiteStackCommandCompleted | GraphiteStackFailure
GraphiteBranchExistsResult: TypeAlias = GraphiteBranchExists | GraphiteStackFailure


class GraphiteStackGateway(ABC):
    """Roaster-specific boundary around Graphite (`gt`) stack reads and mutations."""

    @abstractmethod
    def read_current_stack(self, *, cwd: Path) -> GraphiteStackReadResult:
        """Read the current Graphite stack snapshot without mutation."""

    @abstractmethod
    def resolve_attach_tip(
        self,
        *,
        cwd: Path,
        target_branch: str | None = None,
    ) -> GraphiteAttachTipResult:
        """Resolve the target branch and tip above which generated branches attach."""

    @abstractmethod
    def checkout_branch(self, *, cwd: Path, branch_name: str) -> GraphiteStackCommandResult:
        """Check out the target or generated branch before resolver work."""

    @abstractmethod
    def branch_exists(self, *, cwd: Path, branch_name: str) -> GraphiteBranchExistsResult:
        """Return whether a generated branch already exists."""

    @abstractmethod
    def create_generated_branch(
        self,
        *,
        cwd: Path,
        branch_name: str,
        batch_title: str,
    ) -> GraphiteStackCommandResult:
        """Create a generated branch with `gt create <branch> -m "roaster: <batch title>"`."""

    @abstractmethod
    def update_generated_branch(
        self,
        *,
        cwd: Path,
        branch_name: str,
        batch_title: str,
    ) -> GraphiteStackCommandResult:
        """Update a generated branch with a semantic `gt modify` message."""

    @abstractmethod
    def submit_generated_stack(self, *, cwd: Path) -> GraphiteStackCommandResult:
        """Submit generated roaster branches with `gt submit --no-interactive`."""
