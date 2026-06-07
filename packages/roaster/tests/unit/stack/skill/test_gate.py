from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest

from roaster.cli.roaster.stack.exec.common import resolver_output_from_input
from roaster.stack.skill import gate as gate_module
from roaster.stack.skill.gate import (
    StackSkillValidationResult,
    collect_worktree_files,
    evaluate_stack_skill_gate,
)
from roaster.stack.skill.inputs import StackSkillResolverInput


def test_stack_skill_gate_passes_when_validation_scope_and_files_are_clean() -> None:
    decision = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**", "skills/roaster-stack/**"),
        touched_files=("packages/roaster/src/roaster/stack_skill_gate.py",),
        deleted_files=(),
        conflict_marker_files=(),
        validation_results=(StackSkillValidationResult(command="just test", exit_code=0),),
    )

    assert decision.passed is True
    assert decision.issues == ()
    assert decision.unresolved_conflicts is False
    assert decision.validation_evidence_missing is False


def test_stack_skill_gate_blocks_validation_failures() -> None:
    decision = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**",),
        touched_files=("packages/roaster/src/roaster/stack_skill_gate.py",),
        deleted_files=(),
        conflict_marker_files=(),
        validation_results=(StackSkillValidationResult(command="just test", exit_code=1),),
    )

    assert decision.passed is False
    assert decision.issues[0].check == "validation"
    assert decision.issues[0].command == "just test"


def test_stack_skill_gate_blocks_out_of_scope_touched_files() -> None:
    decision = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**",),
        touched_files=("README.md", "packages/roaster/src/roaster/stack_skill_gate.py"),
        deleted_files=(),
        conflict_marker_files=(),
        validation_results=(),
    )

    assert decision.passed is False
    assert [issue.path for issue in decision.issues] == ["README.md"]
    assert decision.issues[0].check == "scope"


def test_stack_skill_gate_blocks_conflict_markers_and_deletions() -> None:
    decision = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**",),
        touched_files=(
            "packages/roaster/src/roaster/conflicted.py",
            "packages/roaster/src/roaster/deleted.py",
        ),
        deleted_files=("packages/roaster/src/roaster/deleted.py",),
        conflict_marker_files=("packages/roaster/src/roaster/conflicted.py",),
        validation_results=(),
    )

    assert decision.passed is False
    assert [issue.check for issue in decision.issues] == ["conflict_markers", "deletion"]
    assert decision.unresolved_conflicts is True


def test_stack_skill_gate_tracks_missing_validation_evidence_when_expected() -> None:
    decision = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**",),
        touched_files=("packages/roaster/src/roaster/stack_skill_gate.py",),
        deleted_files=(),
        conflict_marker_files=(),
        validation_results=(),
        expected_validation_count=1,
    )

    assert decision.validation_evidence_missing is True
    assert decision.passed is True


def test_collect_worktree_files_splits_touched_and_deleted_from_one_status_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[Any, ...]] = []

    def fake_run(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append((*args, kwargs))
        return subprocess.CompletedProcess(
            args=args[0],
            returncode=0,
            stdout=(" M app.py\nR  old_name.py -> new_name.py\n D deleted.py\n?? notes.txt\n"),
            stderr="",
        )

    monkeypatch.setattr(gate_module.subprocess, "run", fake_run)

    files = collect_worktree_files(Path("/repo"))

    assert len(calls) == 1
    assert files.touched_files == (
        "app.py",
        "old_name.py",
        "new_name.py",
        "deleted.py",
        "notes.txt",
    )
    assert files.deleted_files == ("deleted.py",)


def test_resolver_output_from_input_uses_gate_safety_facts() -> None:
    gate = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**",),
        touched_files=("packages/roaster/src/roaster/conflicted.py",),
        deleted_files=(),
        conflict_marker_files=("packages/roaster/src/roaster/conflicted.py",),
        validation_results=(),
        expected_validation_count=1,
    )
    resolver = StackSkillResolverInput(
        status="completed",
        summary="Resolved conflicts.",
        safety={"destructive": False, "security_sensitive": False},
    )

    output = resolver_output_from_input("fix-conflicts", resolver, gate)

    assert output.safety.unresolved_conflicts is True
    assert output.safety.validation_evidence_missing is True


def test_stack_skill_gate_preserves_advisory_flags_without_blocking() -> None:
    decision = evaluate_stack_skill_gate(
        expected_paths=("packages/roaster/**",),
        touched_files=("packages/roaster/src/roaster/stack_skill_gate.py",),
        deleted_files=(),
        conflict_marker_files=(),
        validation_results=(),
        advisory_destructive=True,
        advisory_security_sensitive=True,
    )

    assert decision.passed is True
    assert decision.advisory_destructive is True
    assert decision.advisory_security_sensitive is True
