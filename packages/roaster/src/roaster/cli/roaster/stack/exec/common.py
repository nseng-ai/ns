"""Shared helpers for skill-first stack exec commands."""

from __future__ import annotations

import sys
from typing import TypeVar

from pydantic import ValidationError

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.models import ClinkrModel
from brmem.gateway import BranchMemoryGateway
from roaster.context import RoasterCliContext
from roaster.stack.common.run_models import (
    StackRunBatchState,
    StackRunManifest,
)
from roaster.stack.common.run_storage import (
    StackRunStorageError,
    validate_stack_run_manifest,
)
from roaster.stack.core.contracts import (
    StackResolverOutput,
    StackResolverSafety,
    StackResolverValidation,
    StackTriageBatch,
)
from roaster.stack.skill.gate import StackSkillGateDecision
from roaster.stack.skill.inputs import (
    StackSkillResolverInput,
    StackSkillTriageBatchInput,
    StackSkillTriageInput,
)
from roaster.stack.skill.storage import read_stack_run_manifest

ModelT = TypeVar("ModelT", bound=ClinkrModel)


def branch_memory_or_fail(context: RoasterCliContext) -> BranchMemoryGateway:
    """Return Branch Memory gateway or fail the exec command."""
    return Ensure.not_none(
        context.branch_memory,
        error_type="stack_branch_memory_unavailable",
        message="roaster stack exec requires Branch Memory context.",
    )


def parse_triage_stdin() -> StackSkillTriageInput:
    """Parse skill-first triage JSON from stdin."""
    return _parse_stdin_json(
        StackSkillTriageInput,
        error_type="stack_skill_triage_invalid_json",
        message_prefix="record-triage expected valid triage JSON on stdin",
    )


def parse_resolver_stdin() -> StackSkillResolverInput:
    """Parse skill-first resolver JSON from stdin."""
    return _parse_stdin_json(
        StackSkillResolverInput,
        error_type="stack_skill_resolver_invalid_json",
        message_prefix="record-batch expected valid resolver JSON on stdin",
    )


def _parse_stdin_json(
    model_cls: type[ModelT],
    *,
    error_type: str,
    message_prefix: str,
) -> ModelT:
    raw = sys.stdin.read()
    try:
        return model_cls.model_validate_json(raw)
    except ValidationError as exc:
        Ensure.fail(error_type=error_type, message=f"{message_prefix}: {exc}")


def load_skill_manifest(
    branch_memory: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> StackRunManifest:
    """Load a skill-first stack run manifest from Branch Memory."""
    manifest = read_stack_run_manifest(
        branch_memory,
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    )
    return Ensure.not_none(
        manifest,
        error_type="stack_skill_manifest_missing",
        message=f"no skill-first roaster stack manifest found for run {run_slug!r}",
    )


def batch_from_state(state: StackRunBatchState) -> StackTriageBatch:
    """Rehydrate persisted batch metadata into the reusable batch contract."""
    return StackTriageBatch(
        slug=state.batch_slug,
        title=state.title,
        summary=state.summary,
        finding_ids=state.finding_ids,
        dependencies=state.dependencies,
        confidence=state.confidence,
        risk=state.risk,
        resolver_mandate=state.resolver_mandate,
        validation_requirements=state.validation_requirements,
        expected_paths=state.expected_paths,
    )


def batches_from_manifest(manifest: StackRunManifest) -> tuple[StackTriageBatch, ...]:
    """Return manifest batches in manifest order."""
    states_by_slug = {state.batch_slug: state for state in manifest.batch_states}
    batches: list[StackTriageBatch] = []
    for batch_slug in manifest.batch_slugs:
        if batch_slug not in states_by_slug:
            Ensure.fail(
                error_type="stack_skill_manifest_incomplete",
                message=f"manifest is missing batch state for {batch_slug!r}",
            )
        batches.append(batch_from_state(states_by_slug[batch_slug]))
    return tuple(batches)


def batch_from_manifest(manifest: StackRunManifest, batch_slug: str) -> StackTriageBatch:
    """Return one batch from a manifest or fail."""
    for state in manifest.batch_states:
        if state.batch_slug == batch_slug:
            return batch_from_state(state)
    Ensure.fail(
        error_type="stack_skill_batch_missing",
        message=f"manifest run {manifest.run_slug!r} has no batch {batch_slug!r}",
    )


def triage_batch_from_input(batch: StackSkillTriageBatchInput) -> StackTriageBatch:
    """Convert a triage input batch into the reusable stack batch contract."""
    return StackTriageBatch(
        slug=batch.slug,
        title=batch.title,
        summary=batch.summary,
        finding_ids=batch.finding_ids,
        dependencies=batch.dependencies,
        confidence=batch.confidence,
        risk=batch.risk,
        resolver_mandate=batch.resolver_mandate,
        validation_requirements=batch.validation_requirements,
        expected_paths=batch.expected_paths,
    )


def resolver_output_from_input(
    batch_slug: str,
    resolver: StackSkillResolverInput,
    gate: StackSkillGateDecision,
) -> StackResolverOutput:
    """Convert resolver JSON into the existing resolver output contract."""
    return StackResolverOutput(
        batch_slug=batch_slug,
        status=resolver.status,
        summary=resolver.summary,
        files_changed=resolver.files_changed,
        validation=tuple(
            StackResolverValidation(
                command=item.command,
                status=item.status,
                output_summary=item.output_summary,
            )
            for item in resolver.validation
        ),
        safety=StackResolverSafety(
            unresolved_conflicts=gate.unresolved_conflicts,
            destructive_changes=resolver.safety.destructive,
            secrets_or_security_sensitive=resolver.safety.security_sensitive,
            validation_evidence_missing=gate.validation_evidence_missing,
            notes=resolver.safety.notes,
        ),
        body=resolver.summary,
    )


def validate_manifest_or_fail(manifest: StackRunManifest) -> StackRunManifest:
    """Validate manifest and convert storage errors into CLI failures."""
    try:
        return validate_stack_run_manifest(manifest)
    except StackRunStorageError as exc:
        Ensure.fail(error_type="stack_skill_manifest_invalid", message=str(exc))
