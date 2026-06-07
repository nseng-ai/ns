"""Persist skill-first roaster stack triage into an isolated run namespace."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.cli.roaster.stack.exec.common import (
    branch_memory_or_fail,
    parse_triage_stdin,
    triage_batch_from_input,
)
from roaster.context import RoasterCliContext
from roaster.stack.common.run_models import (
    StackRunArtifactLocator,
    StackRunManifest,
)
from roaster.stack.common.run_persistence import initial_batch_states
from roaster.stack.common.run_storage import StackRunLocator, add_run_to_index
from roaster.stack.skill.storage import (
    SKILL_STACK_RUNS_NAMESPACE,
    read_stack_run_index,
    write_stack_run_index,
    write_stack_run_manifest,
    write_stack_run_triage,
)


class RecordTriageRequest(ClinkrModel):
    """CLI options for ``record-triage``."""

    impl_branch: Annotated[
        str,
        click.Option(["--impl-branch"], required=True, help="Implementation branch name."),
    ]
    impl_branch_slug: Annotated[
        str,
        click.Option(
            ["--impl-branch-slug"],
            required=True,
            help="Safe implementation branch slug used in run keys.",
        ),
    ]
    profile_slug: Annotated[
        str,
        click.Option(["--profile-slug"], required=True, help="Roaster stack profile slug."),
    ]
    run_slug: Annotated[
        str,
        click.Option(["--run-slug"], required=True, help="Stable run slug to persist."),
    ]
    base_ref: Annotated[
        str | None,
        click.Option(["--base-ref"], help="Base ref audited by this run."),
    ] = None
    target_branch: Annotated[
        str | None,
        click.Option(["--target-branch"], help="Implementation branch targeted by this run."),
    ] = None
    target_pr: Annotated[
        str | None,
        click.Option(["--target-pr"], help="Target implementation PR number or URL."),
    ] = None


class RecordTriageResult(ClinkrModel):
    """Result returned after persisting a skill-first triage run."""

    namespace: str
    run_slug: str
    batch_slugs: tuple[str, ...]
    index_locator: StackRunArtifactLocator
    manifest_locator: StackRunArtifactLocator
    triage_locator: StackRunArtifactLocator


@clinkr_operation(
    name="record-triage",
    help="Persist skill-first stack triage JSON from stdin into an isolated run manifest.",
)
def record_triage_command(
    ctx: click.Context,
    request: RecordTriageRequest,
) -> ClinkrExit[RecordTriageResult]:
    context = load_typed_context(ctx, RoasterCliContext)
    branch_memory = branch_memory_or_fail(context)
    triage = parse_triage_stdin()
    batches = tuple(triage_batch_from_input(batch) for batch in triage.batches)
    Ensure.truthy(
        batches,
        error_type="stack_skill_triage_empty",
        message="record-triage requires at least one batch.",
    )

    index = read_stack_run_index(
        branch_memory,
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
    )
    next_index = add_run_to_index(
        index,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
    )
    manifest = StackRunManifest(
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
        impl_branch_slug=request.impl_branch_slug,
        base_ref=request.base_ref,
        target_branch=request.target_branch or request.impl_branch,
        target_pr=request.target_pr,
        batch_slugs=tuple(batch.slug for batch in batches),
        batch_states=initial_batch_states(batches),
    )

    index_locator = write_stack_run_index(
        branch_memory,
        impl_branch=request.impl_branch,
        index=next_index,
    )
    manifest_locator = write_stack_run_manifest(
        branch_memory,
        impl_branch=request.impl_branch,
        manifest=manifest,
    )
    triage_locator = write_stack_run_triage(
        branch_memory,
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
        content=_triage_artifact_content(triage.model_dump_json(indent=2)),
    )

    return ClinkrExit.ok(
        RecordTriageResult(
            namespace=SKILL_STACK_RUNS_NAMESPACE,
            run_slug=request.run_slug,
            batch_slugs=manifest.batch_slugs,
            index_locator=_artifact_locator(index_locator),
            manifest_locator=_artifact_locator(manifest_locator),
            triage_locator=_artifact_locator(triage_locator),
        )
    )


def _artifact_locator(locator: StackRunLocator) -> StackRunArtifactLocator:
    return StackRunArtifactLocator(
        namespace=locator.namespace,
        key=locator.key,
        branch=locator.branch,
    )


def _triage_artifact_content(json_payload: str) -> str:
    return f"# Roaster stack skill triage\n\n```json\n{json_payload}\n```\n"
