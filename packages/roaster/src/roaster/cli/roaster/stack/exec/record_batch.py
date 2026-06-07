"""Record one skill-first resolver batch after mechanical gate checks."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.cli.roaster.stack.exec.common import (
    batch_from_manifest,
    branch_memory_or_fail,
    load_skill_manifest,
    parse_resolver_stdin,
    resolver_output_from_input,
)
from roaster.context import RoasterCliContext
from roaster.stack.common.run_models import StackRunArtifactLocator
from roaster.stack.common.run_persistence import (
    StackRunPersistenceFailure,
    manifest_with_batch_state,
)
from roaster.stack.core.contracts import (
    GeneratedStackBranch,
    StackBatchStatus,
)
from roaster.stack.skill.gate import (
    StackSkillGateDecision,
    collect_conflict_marker_files,
    collect_worktree_files,
    evaluate_stack_skill_gate,
    run_validation_commands,
)
from roaster.stack.skill.storage import write_stack_run_manifest, write_stack_run_resolver


class RecordBatchRequest(ClinkrModel):
    """CLI options for ``record-batch``."""

    batch_slug: Annotated[str, click.Argument(["batch_slug"], type=click.STRING)]
    impl_branch: Annotated[
        str,
        click.Option(["--impl-branch"], required=True, help="Implementation branch name."),
    ]
    impl_branch_slug: Annotated[
        str,
        click.Option(["--impl-branch-slug"], required=True, help="Implementation branch slug."),
    ]
    profile_slug: Annotated[
        str,
        click.Option(["--profile-slug"], required=True, help="Roaster stack profile slug."),
    ]
    run_slug: Annotated[
        str,
        click.Option(["--run-slug"], required=True, help="Run slug to update."),
    ]
    generated_branch_name: Annotated[
        str | None,
        click.Option(
            ["--generated-branch-name"],
            help="Optional generated branch identity to persist with the batch checkpoint.",
        ),
    ] = None


class RecordBatchResult(ClinkrModel):
    """Result returned by ``record-batch``."""

    run_slug: str
    batch_slug: str
    status: str
    should_halt: bool
    gate: StackSkillGateDecision
    manifest_locator: StackRunArtifactLocator
    resolver_locator: StackRunArtifactLocator


@clinkr_operation(
    name="record-batch",
    help="Rerun validation, enforce mechanical gate checks, and persist one batch checkpoint.",
)
def record_batch_command(
    ctx: click.Context,
    request: RecordBatchRequest,
) -> ClinkrExit[RecordBatchResult]:
    context = load_typed_context(ctx, RoasterCliContext)
    branch_memory = branch_memory_or_fail(context)
    resolver = parse_resolver_stdin()
    manifest = load_skill_manifest(
        branch_memory,
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
    )
    batch = batch_from_manifest(manifest, request.batch_slug)
    cwd = context.cwd

    validation_results = run_validation_commands(batch.validation_requirements, cwd=cwd)
    worktree_files = collect_worktree_files(cwd)
    touched_files = worktree_files.touched_files
    deleted_files = worktree_files.deleted_files
    conflict_marker_files = collect_conflict_marker_files(cwd, touched_files)
    gate = evaluate_stack_skill_gate(
        expected_paths=batch.expected_paths,
        touched_files=touched_files,
        deleted_files=deleted_files,
        conflict_marker_files=conflict_marker_files,
        validation_results=validation_results,
        advisory_destructive=resolver.safety.destructive,
        advisory_security_sensitive=resolver.safety.security_sensitive,
        expected_validation_count=len(batch.validation_requirements),
    )

    resolver_locator = write_stack_run_resolver(
        branch_memory,
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
        batch_slug=request.batch_slug,
        content=resolver.model_dump_json(indent=2),
    )
    status = _batch_status(resolver.status, gate)
    updated_manifest = manifest_with_batch_state(
        manifest,
        batch=batch,
        status=status,
        generated_branch=_generated_branch(request),
        generated_branch_status="planned" if request.generated_branch_name is not None else None,
        resolver_locator=StackRunArtifactLocator.from_locator(resolver_locator),
        resolver_output=resolver_output_from_input(request.batch_slug, resolver, gate),
        failure=_failure(resolver.status, gate),
    )
    manifest_locator = write_stack_run_manifest(
        branch_memory,
        impl_branch=request.impl_branch,
        manifest=updated_manifest,
    )
    result = RecordBatchResult(
        run_slug=request.run_slug,
        batch_slug=request.batch_slug,
        status=status,
        should_halt=status != "completed",
        gate=gate,
        manifest_locator=StackRunArtifactLocator.from_locator(manifest_locator),
        resolver_locator=StackRunArtifactLocator.from_locator(resolver_locator),
    )
    if result.should_halt:
        return ClinkrExit.negative(data=result, message=_halt_message(resolver.status, gate))
    return ClinkrExit.ok(result)


def _batch_status(resolver_status: str, gate: StackSkillGateDecision) -> StackBatchStatus:
    if resolver_status == "completed" and gate.passed:
        return "completed"
    if resolver_status == "blocked":
        return "blocked"
    return "failed"


def _failure(
    resolver_status: str,
    gate: StackSkillGateDecision,
) -> StackRunPersistenceFailure | None:
    if resolver_status == "completed" and gate.passed:
        return None
    return StackRunPersistenceFailure(
        error_type="stack_skill_batch_gate_failed",
        message=_halt_message(resolver_status, gate),
    )


def _halt_message(resolver_status: str, gate: StackSkillGateDecision) -> str:
    fragments: list[str] = []
    if resolver_status != "completed":
        fragments.append(f"resolver reported status {resolver_status!r}")
    fragments.extend(issue.message for issue in gate.issues)
    if not fragments:
        return "record-batch halted for an unknown gate failure."
    return "; ".join(fragments)


def _generated_branch(request: RecordBatchRequest) -> GeneratedStackBranch | None:
    if request.generated_branch_name is None:
        return None
    return GeneratedStackBranch(
        branch_name=request.generated_branch_name,
        impl_branch_slug=request.impl_branch_slug,
        run_slug=request.run_slug,
        batch_slug=request.batch_slug,
    )
