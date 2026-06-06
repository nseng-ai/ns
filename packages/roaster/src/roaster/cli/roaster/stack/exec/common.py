"""Shared helpers for skill-first stack exec commands."""

from __future__ import annotations

import sys
from pathlib import Path

from pydantic import ValidationError

from asdl_core.clinkr.ensure import Ensure
from brmem.gateway import BranchMemoryGateway
from roaster.cli.roaster.stack.exec.models import (
    StackSkillResolverInput,
    StackSkillTriageBatchInput,
    StackSkillTriageInput,
)
from roaster.context import RoasterCliContext
from roaster.stack_models import (
    StackResolverOutput,
    StackResolverSafety,
    StackResolverValidation,
    StackRunBatchState,
    StackRunManifest,
    StackTriageBatch,
)
from roaster.stack_run_storage import (
    StackRunStorageError,
    read_stack_run_manifest,
    validate_stack_run_manifest,
)

SKILL_STACK_RUNS_NAMESPACE = "roaster-runs-skill"


def branch_memory_or_fail(context: RoasterCliContext) -> BranchMemoryGateway:
    """Return Branch Memory gateway or fail the exec command."""
    return Ensure.not_none(
        context.branch_memory,
        error_type="stack_branch_memory_unavailable",
        message="roaster stack exec requires Branch Memory context.",
    )


def parse_triage_stdin() -> StackSkillTriageInput:
    """Parse skill-first triage JSON from stdin."""
    raw = sys.stdin.read()
    try:
        return StackSkillTriageInput.model_validate_json(raw)
    except ValidationError as exc:
        Ensure.fail(
            error_type="stack_skill_triage_invalid_json",
            message=f"record-triage expected valid triage JSON on stdin: {exc}",
        )


def parse_resolver_stdin() -> StackSkillResolverInput:
    """Parse skill-first resolver JSON from stdin."""
    raw = sys.stdin.read()
    try:
        return StackSkillResolverInput.model_validate_json(raw)
    except ValidationError as exc:
        Ensure.fail(
            error_type="stack_skill_resolver_invalid_json",
            message=f"record-batch expected valid resolver JSON on stdin: {exc}",
        )


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
        namespace=SKILL_STACK_RUNS_NAMESPACE,
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
    for batch in batches_from_manifest(manifest):
        if batch.slug == batch_slug:
            return batch
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
            unresolved_conflicts=False,
            destructive_changes=resolver.safety.destructive,
            secrets_or_security_sensitive=resolver.safety.security_sensitive,
            validation_evidence_missing=False,
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


def cwd_from_context(context: RoasterCliContext) -> Path:
    """Return context cwd."""
    return context.cwd
