"""``objective exec list-candidates`` fast autocomplete candidate inventory."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliUnavailable, load_objective_context
from asdl_objectives.list_inventory import (
    ObjectiveRecordStatus,
    build_objective_checkout_inventory,
)
from asdl_objectives.list_status import matches_status_filter


class ObjectiveCandidateRecord(ClinkrModel):
    slug: str
    status: ObjectiveRecordStatus


class ObjectiveListCandidatesRequest(ClinkrModel):
    pass


class ObjectiveListCandidatesResult(ClinkrModel):
    records: tuple[ObjectiveCandidateRecord, ...]


def render_list_candidates(result: ObjectiveListCandidatesResult) -> None:
    for record in result.records:
        click.echo(f"{record.slug}\t{record.status}")


@clinkr_operation(
    name="list-candidates",
    help="List active Objective slug candidates for shell and agent autocomplete.",
    human_renderer=render_list_candidates,
)
def run_list_candidates(
    ctx: click.Context,
    request: ObjectiveListCandidatesRequest,
) -> ClinkrExit[ObjectiveListCandidatesResult]:
    del request
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)

    inventory = build_objective_checkout_inventory(objective_ctx.repo_root)
    records = tuple(
        ObjectiveCandidateRecord(slug=record.slug, status=record.status)
        for record in inventory.records
        if matches_status_filter(record.status, "active")
    )
    return ClinkrExit.ok(ObjectiveListCandidatesResult(records=records))
