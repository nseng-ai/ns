"""``objective exec record-evidence`` — write the Durable Evidence marker."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, durable_evidence_key, slug_for_key
from asdl_objectives.durable_evidence import (
    DurableEvidenceRecord,
    records_from_commits,
    serialize_durable_evidence,
)
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.patch_facts import load_branch_patch_facts
from asdl_objectives.trunk_resolution import resolve_trunk


class RecordEvidenceRequest(ClinkrModel):
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    expected_head: Annotated[
        str,
        click.Option(["--expected-head"], type=click.STRING, required=True),
    ]


class RecordEvidenceResult(ClinkrModel):
    slug: str
    branch: str
    branch_head_sha: str
    marker_key: str
    old_head_sha: str | None
    new_head_sha: str
    records: tuple[DurableEvidenceRecord, ...]


def render_record_evidence(result: RecordEvidenceResult) -> None:
    count = len(result.records)
    suffix = "record" if count == 1 else "records"
    click.echo(f"Recorded {count} Durable Evidence {suffix} for {result.slug} on {result.branch}.")
    click.echo(f"Marker: {result.marker_key}")
    click.echo(f"Commit: {result.new_head_sha}")


@clinkr_operation(
    name="record-evidence",
    help=(
        "Write the machine-owned `.durable-evidence.jsonl` marker for the current "
        "branch snapshot. Intended for `objective-update`, not interactive use."
    ),
    human_renderer=render_record_evidence,
)
def run_record_evidence_objective(
    ctx: click.Context,
    request: RecordEvidenceRequest,
) -> ClinkrExit[RecordEvidenceResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    git = mctx.git_gateway
    cwd = Path.cwd()

    match git.get_current_branch(cwd):
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: objective-update requires a checked-out branch.",
            )
        case str() as current_branch:
            pass

    Ensure.true(
        current_branch != git.get_trunk_branch(),
        error_type="on_trunk_branch",
        message=(
            "objective-update runs on branch snapshots only. "
            "Use objective-reconcile <slug> to update canonical state."
        ),
    )

    head_result = Ensure.ideal_state(git.branch_head_oid(current_branch))
    Ensure.true(
        head_result == request.expected_head,
        error_type="head_moved",
        message=(
            f"HEAD moved while updating {current_branch!r}: expected "
            f"{request.expected_head}, found {head_result}. Re-run objective-update."
        ),
    )

    slug = slug_for_key(request.slug)
    Ensure.not_none(
        mctx.brmem_gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), current_branch),
        error_type="slug_not_attached",
        message=(
            f"Objective {slug!r} is not attached to branch {current_branch!r}. "
            f"Run `objective-attach {slug}` on this branch first."
        ),
    )

    trunk = resolve_trunk(git).trunk
    range_spec = f"{trunk}..HEAD"
    facts = Ensure.ideal_state(
        load_branch_patch_facts(git, range_spec, require_patch_ids=True),
    )

    pid_by_sha = Ensure.not_none(
        facts.pid_by_sha,
        error_type="git_failed",
        message="git patch-id failed",
    )
    records = records_from_commits(facts.commits, pid_by_sha=pid_by_sha)
    marker_key = durable_evidence_key(slug)
    old_diagnostic = mctx.brmem_gateway.check(OBJECTIVE_NAMESPACE, marker_key, current_branch)
    new_head_sha = mctx.brmem_gateway.put(
        OBJECTIVE_NAMESPACE,
        marker_key,
        current_branch,
        serialize_durable_evidence(records),
    )

    return ClinkrExit.ok(
        RecordEvidenceResult(
            slug=slug,
            branch=current_branch,
            branch_head_sha=head_result,
            marker_key=marker_key,
            old_head_sha=old_diagnostic.head_sha if old_diagnostic is not None else None,
            new_head_sha=new_head_sha,
            records=records,
        )
    )
