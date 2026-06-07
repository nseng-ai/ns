from __future__ import annotations

from roaster.stack.skill.gate import (
    StackSkillValidationResult,
    evaluate_stack_skill_gate,
)


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
