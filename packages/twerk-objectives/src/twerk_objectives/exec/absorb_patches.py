"""``objective exec absorb-patches`` — write the absorbed-patch marker."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.absorbed_marker import (
    AbsorbedPatchRecord,
    records_from_commits,
    serialize_absorbed_marker,
)
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import MASTER_BRANCH, absorbed_patches_key, body_key, slug_for_key
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.patch_facts import load_branch_patch_facts
from twerk_objectives.trunk_resolution import resolve_trunk


@dataclass(frozen=True)
class AbsorbPatchesRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    expected_head: Annotated[
        str,
        click.Option(["--expected-head"], type=click.STRING, required=True),
    ]


@dataclass(frozen=True)
class AbsorbPatchesResult(JsonSerializable):
    slug: str
    branch: str
    branch_head_sha: str
    marker_key: str
    old_head_sha: str | None
    new_head_sha: str
    records: tuple[AbsorbedPatchRecord, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "branch": self.branch,
            "branch_head_sha": self.branch_head_sha,
            "marker_key": self.marker_key,
            "old_head_sha": self.old_head_sha,
            "new_head_sha": self.new_head_sha,
            "records": [
                {
                    "schema": r.schema,
                    "sha": r.sha,
                    "patch_id": r.patch_id,
                    "author_iso": r.author_iso,
                    "subject": r.subject,
                }
                for r in self.records
            ],
        }


def render_absorb_patches(result: AbsorbPatchesResult) -> None:
    count = len(result.records)
    suffix = "record" if count == 1 else "records"
    click.echo(f"Recorded {count} absorbed patch {suffix} for {result.slug} on {result.branch}.")
    click.echo(f"Marker: {result.marker_key}")
    click.echo(f"Commit: {result.new_head_sha}")


@clinkr_operation(
    name="absorb-patches",
    help=(
        "Write the machine-owned `.absorbed.jsonl` marker for the current "
        "branch snapshot. Intended for `objective-update`, not interactive use."
    ),
    human_renderer=render_absorb_patches,
)
def run_absorb_patches_objective(
    ctx: click.Context,
    request: AbsorbPatchesRequest,
) -> ClinkrExit[AbsorbPatchesResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    git = mctx.git_gateway
    cwd = Path.cwd()

    match git.get_current_branch(cwd):
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: objective-update requires a checked-out branch.",
            )
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case str() as current_branch:
            pass

    if current_branch == MASTER_BRANCH:
        return ClinkrExit.failure(
            error_type="on_master_branch",
            message=(
                "objective-update runs on branch snapshots only. "
                "Use objective-reconcile <slug> to update canonical state."
            ),
        )

    head_result = git.branch_head_oid(current_branch)
    if isinstance(head_result, GitCommandFailure):
        return ClinkrExit.failure(error_type="git_failed", message=head_result.message)
    if head_result != request.expected_head:
        return ClinkrExit.failure(
            error_type="head_moved",
            message=(
                f"HEAD moved while updating {current_branch!r}: expected "
                f"{request.expected_head}, found {head_result}. Re-run objective-update."
            ),
        )

    slug = slug_for_key(request.slug)
    body_diagnostic = mctx.brmem_gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), current_branch)
    if body_diagnostic is None:
        return ClinkrExit.failure(
            error_type="slug_not_attached",
            message=(
                f"Objective {slug!r} is not attached to branch {current_branch!r}. "
                f"Run `objective-claim {slug}` on this branch first."
            ),
        )

    trunk = resolve_trunk(git).trunk
    range_spec = f"{trunk}..HEAD"
    facts = load_branch_patch_facts(git, range_spec, require_patch_ids=True)
    if isinstance(facts, GitCommandFailure):
        return ClinkrExit.failure(error_type="git_failed", message=facts.message)

    pid_by_sha = facts.pid_by_sha
    if pid_by_sha is None:
        return ClinkrExit.failure(
            error_type="git_failed",
            message="git patch-id failed",
        )
    records = records_from_commits(facts.commits, pid_by_sha=pid_by_sha)
    marker_key = absorbed_patches_key(slug)
    old_diagnostic = mctx.brmem_gateway.check(OBJECTIVE_NAMESPACE, marker_key, current_branch)
    new_head_sha = mctx.brmem_gateway.put(
        OBJECTIVE_NAMESPACE,
        marker_key,
        current_branch,
        serialize_absorbed_marker(records),
    )

    return ClinkrExit.ok(
        AbsorbPatchesResult(
            slug=slug,
            branch=current_branch,
            branch_head_sha=head_result,
            marker_key=marker_key,
            old_head_sha=old_diagnostic.head_sha if old_diagnostic is not None else None,
            new_head_sha=new_head_sha,
            records=records,
        )
    )
