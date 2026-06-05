from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from roaster.gateways.graphite_stack import real as graphite_real
from roaster.gateways.graphite_stack.fake import FakeGraphiteStackGateway
from roaster.gateways.graphite_stack.gateway import (
    GraphiteAttachTip,
    GraphiteBranchExists,
    GraphiteStackCommandCompleted,
    GraphiteStackFailure,
    GraphiteTargetStack,
)
from roaster.gateways.graphite_stack.real import RealGraphiteStackGateway


def test_fake_resolves_attach_tip_from_current_stack_and_records_call() -> None:
    cwd = Path("/repo")
    gateway = FakeGraphiteStackGateway(
        current_stack=GraphiteTargetStack(
            target_branch="feature/impl",
            attach_tip="feature/impl-tip",
            branches=("feature/impl", "feature/impl-tip"),
        )
    )

    result = gateway.resolve_attach_tip(cwd=cwd)

    assert result == GraphiteAttachTip(
        target_branch="feature/impl",
        attach_tip="feature/impl-tip",
    )
    assert gateway.resolve_attach_tip_calls == ((cwd, None),)


def test_fake_resolves_attach_tip_for_seeded_target_stack() -> None:
    cwd = Path("/repo")
    gateway = FakeGraphiteStackGateway(
        stacks_by_target_branch={
            "feature/other": GraphiteTargetStack(
                target_branch="feature/other",
                attach_tip="feature/other-top",
                branches=("feature/other", "feature/other-top"),
            )
        }
    )

    result = gateway.resolve_attach_tip(cwd=cwd, target_branch="feature/other")

    assert result == GraphiteAttachTip(
        target_branch="feature/other",
        attach_tip="feature/other-top",
    )
    assert gateway.resolve_attach_tip_calls == ((cwd, "feature/other"),)


def test_fake_create_update_submit_and_branch_exists_record_semantic_operations() -> None:
    cwd = Path("/repo")
    branch_name = "impl/roaster/run-1/fix-tests"
    gateway = FakeGraphiteStackGateway(existing_branches={"feature/impl"})

    before_create = gateway.branch_exists(cwd=cwd, branch_name=branch_name)
    created = gateway.create_generated_branch(
        cwd=cwd,
        branch_name=branch_name,
        batch_title="Fix tests",
    )
    after_create = gateway.branch_exists(cwd=cwd, branch_name=branch_name)
    updated = gateway.update_generated_branch(
        cwd=cwd,
        branch_name=branch_name,
        batch_title="Fix tests",
    )
    submitted = gateway.submit_generated_stack(cwd=cwd)

    assert before_create == GraphiteBranchExists(branch_name=branch_name, exists=False)
    assert isinstance(created, GraphiteStackCommandCompleted)
    assert created.argv == ("gt", "create", branch_name, "-m", "roaster: Fix tests")
    assert after_create == GraphiteBranchExists(branch_name=branch_name, exists=True)
    assert isinstance(updated, GraphiteStackCommandCompleted)
    assert updated.argv == ("gt", "modify", "-m", "roaster: Fix tests")
    assert isinstance(submitted, GraphiteStackCommandCompleted)
    assert submitted.argv == ("gt", "submit", "--no-interactive")
    assert gateway.branch_exists_calls == ((cwd, branch_name), (cwd, branch_name))
    assert gateway.create_generated_branch_calls == ((cwd, branch_name, "Fix tests"),)
    assert gateway.update_generated_branch_calls == ((cwd, branch_name, "Fix tests"),)
    assert gateway.submit_generated_stack_calls == (cwd,)


def test_fake_returns_seeded_failure_without_mutating_state() -> None:
    cwd = Path("/repo")
    branch_name = "impl/roaster/run-1/fix-tests"
    failure = GraphiteStackFailure(
        error_type="graphite_stack_command_failed",
        message="boom",
        operation="create-generated-branch",
    )
    gateway = FakeGraphiteStackGateway(
        existing_branches={"feature/impl"},
        failures_by_operation={"create-generated-branch": failure},
    )

    result = gateway.create_generated_branch(
        cwd=cwd,
        branch_name=branch_name,
        batch_title="Fix tests",
    )

    assert result is failure
    assert branch_name not in gateway.existing_branches
    assert gateway.create_generated_branch_calls == ((cwd, branch_name, "Fix tests"),)


def test_real_create_generated_branch_shells_out_with_safe_argv(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cwd = Path("/repo")
    captured: list[tuple[list[str], Path, bool, bool, bool]] = []

    def fake_run(
        argv: list[str],
        *,
        cwd: Path,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        captured.append((argv, cwd, check, capture_output, text))
        return subprocess.CompletedProcess(argv, 0, stdout="created\n", stderr="")

    monkeypatch.setattr(graphite_real.subprocess, "run", fake_run)

    result = RealGraphiteStackGateway().create_generated_branch(
        cwd=cwd,
        branch_name="impl/roaster/run-1/fix-tests",
        batch_title="Fix tests",
    )

    assert isinstance(result, GraphiteStackCommandCompleted)
    assert result.argv == (
        "gt",
        "create",
        "impl/roaster/run-1/fix-tests",
        "-m",
        "roaster: Fix tests",
    )
    assert result.stdout == "created\n"
    assert captured == [
        (
            ["gt", "create", "impl/roaster/run-1/fix-tests", "-m", "roaster: Fix tests"],
            cwd,
            False,
            True,
            True,
        )
    ]


def test_real_branch_exists_distinguishes_present_and_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cwd = Path("/repo")
    returncodes = [0, 1]

    def fake_run(
        argv: list[str],
        *,
        cwd: Path,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        _ = cwd
        _ = check
        _ = capture_output
        _ = text
        return subprocess.CompletedProcess(argv, returncodes.pop(0), stdout="", stderr="")

    monkeypatch.setattr(graphite_real.subprocess, "run", fake_run)
    gateway = RealGraphiteStackGateway()

    present = gateway.branch_exists(cwd=cwd, branch_name="feature/impl")
    missing = gateway.branch_exists(cwd=cwd, branch_name="missing")

    assert present == GraphiteBranchExists(branch_name="feature/impl", exists=True)
    assert missing == GraphiteBranchExists(branch_name="missing", exists=False)


def test_real_graphite_failure_propagates_command_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cwd = Path("/repo")

    def fake_run(
        argv: list[str],
        *,
        cwd: Path,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        _ = cwd
        _ = check
        _ = capture_output
        _ = text
        return subprocess.CompletedProcess(argv, 2, stdout="", stderr="gt failed\n")

    monkeypatch.setattr(graphite_real.subprocess, "run", fake_run)

    result = RealGraphiteStackGateway().submit_generated_stack(cwd=cwd)

    assert isinstance(result, GraphiteStackFailure)
    assert result.error_type == "graphite_stack_command_failed"
    assert result.operation == "submit-generated-stack"
    assert result.argv == ("gt", "submit", "--no-interactive")
    assert result.returncode == 2
    assert result.stderr == "gt failed\n"


def test_real_graphite_missing_gt_message_is_actionable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(
        argv: list[str],
        *,
        cwd: Path,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        _ = argv
        _ = cwd
        _ = check
        _ = capture_output
        _ = text
        raise FileNotFoundError

    monkeypatch.setattr(graphite_real.subprocess, "run", fake_run)

    result = RealGraphiteStackGateway().submit_generated_stack(cwd=Path("/repo"))

    assert isinstance(result, GraphiteStackFailure)
    assert result.error_type == "graphite_stack_command_failed"
    assert result.returncode == 127
    assert "Required command 'gt' was not found on PATH" in result.message
    assert "--dry-run" in result.message


def test_real_stack_reads_fail_closed_until_stable_read_support_exists() -> None:
    result = RealGraphiteStackGateway().read_current_stack(cwd=Path("/repo"))

    assert isinstance(result, GraphiteStackFailure)
    assert result.error_type == "graphite_stack_operation_unsupported"
    assert result.operation == "read-current-stack"
    assert "pass --target-branch and --target-pr" in result.message
