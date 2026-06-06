"""Guarded real roaster Graphite stack gateway."""

from __future__ import annotations

import subprocess
from pathlib import Path

from roaster.gateways.graphite_stack.gateway import (
    GraphiteAttachTipResult,
    GraphiteBranchExists,
    GraphiteBranchExistsResult,
    GraphiteStackCommandCompleted,
    GraphiteStackCommandResult,
    GraphiteStackFailure,
    GraphiteStackGateway,
    GraphiteStackOperationKind,
    GraphiteStackReadResult,
)


class RealGraphiteStackGateway(GraphiteStackGateway):
    """Real Graphite operations for the explicit `roaster stack` workflow."""

    def read_current_stack(self, *, cwd: Path) -> GraphiteStackReadResult:
        _ = cwd
        return _unsupported(
            "read-current-stack",
            (
                "Real roaster Graphite stack reads are not wired to a stable "
                "machine-readable `gt` API."
            ),
        )

    def resolve_attach_tip(
        self,
        *,
        cwd: Path,
        target_branch: str | None = None,
    ) -> GraphiteAttachTipResult:
        _ = cwd
        _ = target_branch
        return _unsupported(
            "resolve-attach-tip",
            "Real roaster Graphite attach-tip resolution is not implemented yet.",
        )

    def checkout_branch(self, *, cwd: Path, branch_name: str) -> GraphiteStackCommandResult:
        return _run_gt_command(
            ["gt", "checkout", branch_name],
            cwd=cwd,
            operation="checkout-branch",
        )

    def branch_exists(self, *, cwd: Path, branch_name: str) -> GraphiteBranchExistsResult:
        argv = ["git", "show-ref", "--quiet", "--verify", f"refs/heads/{branch_name}"]
        result = _run(argv, cwd=cwd)
        if result.returncode == 0:
            return GraphiteBranchExists(branch_name=branch_name, exists=True)
        if result.returncode == 1:
            return GraphiteBranchExists(branch_name=branch_name, exists=False)
        return _failure(result, operation="branch-exists")

    def create_generated_branch(
        self,
        *,
        cwd: Path,
        branch_name: str,
        batch_title: str,
    ) -> GraphiteStackCommandResult:
        return _run_gt_command(
            ["gt", "create", branch_name, "-m", f"roaster: {batch_title}"],
            cwd=cwd,
            operation="create-generated-branch",
        )

    def update_generated_branch(
        self,
        *,
        cwd: Path,
        branch_name: str,
        batch_title: str,
    ) -> GraphiteStackCommandResult:
        _ = branch_name
        return _run_gt_command(
            ["gt", "modify", "-m", f"roaster: {batch_title}"],
            cwd=cwd,
            operation="update-generated-branch",
        )

    def submit_generated_stack(self, *, cwd: Path) -> GraphiteStackCommandResult:
        return _run_gt_command(
            ["gt", "submit", "--no-interactive"],
            cwd=cwd,
            operation="submit-generated-stack",
        )


def _run_gt_command(
    argv: list[str],
    *,
    cwd: Path,
    operation: GraphiteStackOperationKind,
) -> GraphiteStackCommandResult:
    result = _run(argv, cwd=cwd)
    if result.returncode != 0:
        return _failure(result, operation=operation)
    return GraphiteStackCommandCompleted(
        operation=operation,
        argv=tuple(argv),
        stdout=result.stdout,
        stderr=result.stderr,
    )


def _run(argv: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            argv,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(
            argv,
            127,
            stdout="",
            stderr=str(exc),
        )


def _failure(
    result: subprocess.CompletedProcess[str],
    *,
    operation: GraphiteStackOperationKind,
) -> GraphiteStackFailure:
    message = (result.stderr or result.stdout).strip() or "Graphite command failed."
    return GraphiteStackFailure(
        error_type="graphite_stack_command_failed",
        message=message,
        operation=operation,
        argv=tuple(str(arg) for arg in result.args),
        returncode=result.returncode,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def _unsupported(operation: GraphiteStackOperationKind, message: str) -> GraphiteStackFailure:
    return GraphiteStackFailure(
        error_type="graphite_stack_operation_unsupported",
        message=message,
        operation=operation,
    )
