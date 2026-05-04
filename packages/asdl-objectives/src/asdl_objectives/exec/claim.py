"""``objective exec claim`` — high-level objective claim workflow for agents.

This command is the single CLI contract for ``objective-claim`` callers. It
composes the deterministic claim planner and applier, returns ready-to-display
messages, and exposes any required user choice as generic selection options
with complete rerun arguments.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.claim_apply import ClaimApplyResult, apply_claim_plan_result
from asdl_objectives.exec.claim_plan import (
    ClaimPlanAmbiguity,
    ClaimPlanRequest,
    ClaimPlanResult,
    plan_claim_objective,
)

CLAIM_SCHEMA = "claim/v1"
ClaimStatus = Literal["claimed", "needs_selection", "blocked"]
SelectionKind = Literal["slug", "source_branch"]


@dataclass(frozen=True)
class ClaimSelectionOption(JsonSerializable):
    """One user-selectable continuation for a blocked claim command."""

    label: str
    value: str
    description: str | None
    rerun_args: tuple[str, ...]


@dataclass(frozen=True)
class ClaimSelection(JsonSerializable):
    """Generic selection payload for UI and non-UI callers."""

    kind: SelectionKind
    prompt: str
    options: tuple[ClaimSelectionOption, ...]


@dataclass(frozen=True)
class ClaimBlock(JsonSerializable):
    """Structured explanation for a claim that cannot continue automatically."""

    reason: str
    message: str


@dataclass(frozen=True)
class ClaimCommandResult(JsonSerializable):
    """High-level objective claim result for skills and CLI callers."""

    schema: str
    status: ClaimStatus
    message: str
    result: ClaimApplyResult | None
    selection: ClaimSelection | None
    block: ClaimBlock | None


def render_claim(result: ClaimCommandResult) -> None:
    click.echo(result.message)


@clinkr_operation(
    name="claim",
    help=(
        "Claim an existing objective snapshot onto a target branch. Runs the "
        "deterministic claim planner, returns generic selection options when "
        "a human choice is needed, and applies the resolved plan when unique."
    ),
    human_renderer=render_claim,
)
def run_claim_objective(
    ctx: click.Context,
    request: ClaimPlanRequest,
) -> ClinkrExit[ClaimCommandResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    plan_result = plan_claim_objective(mctx, request)

    if plan_result.status == "ambiguous":
        return ClinkrExit.ok(_result_for_ambiguity(request=request, plan_result=plan_result))

    if plan_result.status == "error":
        plan_error = Ensure.not_none(
            plan_result.error,
            error_type="claim_plan_missing_error",
            message="claim-plan returned status='error' without error details.",
        )
        return ClinkrExit.ok(_blocked_result(plan_error.reason, plan_error.message))

    Ensure.true(
        plan_result.status == "plan" and plan_result.plan is not None,
        error_type="claim_plan_unsupported_status",
        message=f"claim-plan returned unsupported status: {plan_result.status!r}.",
    )

    apply_result = apply_claim_plan_result(mctx, plan_result)
    return ClinkrExit.ok(
        ClaimCommandResult(
            schema=CLAIM_SCHEMA,
            status="claimed",
            message=_success_message(
                apply_result,
                canonical_branch=plan_result.canonical_branch,
            ),
            result=apply_result,
            selection=None,
            block=None,
        )
    )


def _result_for_ambiguity(
    *,
    request: ClaimPlanRequest,
    plan_result: ClaimPlanResult,
) -> ClaimCommandResult:
    ambiguity = Ensure.not_none(
        plan_result.ambiguity,
        error_type="claim_plan_missing_ambiguity",
        message="claim-plan returned status='ambiguous' without ambiguity details.",
    )

    if ambiguity.reason == "ambiguous_slug_candidates":
        return _selection_result_for_slugs(request=request, ambiguity=ambiguity)

    if ambiguity.reason == "ambiguous_source_branches":
        slug = plan_result.resolved_slug or plan_result.requested_slug
        if slug is None:
            return _blocked_result(
                "ambiguous_source_branches",
                "claim-plan found multiple source branches but did not return the resolved slug.",
            )
        return _selection_result_for_source_branches(
            request=request,
            slug=slug,
            ambiguity=ambiguity,
        )

    if ambiguity.reason == "no_slug_no_candidates":
        return _blocked_result(ambiguity.reason, ambiguity.message)

    return _blocked_result(ambiguity.reason, ambiguity.message)


def _selection_result_for_slugs(
    *,
    request: ClaimPlanRequest,
    ambiguity: ClaimPlanAmbiguity,
) -> ClaimCommandResult:
    options = tuple(
        ClaimSelectionOption(
            label=alternative.slug,
            value=alternative.slug,
            description=f"available on {alternative.available_on_branch}",
            rerun_args=_rerun_args(request, slug=alternative.slug),
        )
        for alternative in ambiguity.slug_alternatives
    )
    selection = ClaimSelection(
        kind="slug",
        prompt="Multiple objectives are reachable. Choose one to claim:",
        options=options,
    )
    return ClaimCommandResult(
        schema=CLAIM_SCHEMA,
        status="needs_selection",
        message=_selection_message(selection),
        result=None,
        selection=selection,
        block=None,
    )


def _selection_result_for_source_branches(
    *,
    request: ClaimPlanRequest,
    slug: str,
    ambiguity: ClaimPlanAmbiguity,
) -> ClaimCommandResult:
    options = tuple(
        ClaimSelectionOption(
            label=alternative.branch,
            value=alternative.branch,
            description=f"distance {alternative.distance}",
            rerun_args=_rerun_args(request, slug=slug, from_branch=alternative.branch),
        )
        for alternative in ambiguity.branch_alternatives
    )
    selection = ClaimSelection(
        kind="source_branch",
        prompt="Multiple source branches are reachable. Choose one:",
        options=options,
    )
    return ClaimCommandResult(
        schema=CLAIM_SCHEMA,
        status="needs_selection",
        message=_selection_message(selection),
        result=None,
        selection=selection,
        block=None,
    )


def _blocked_result(reason: str, message: str) -> ClaimCommandResult:
    return ClaimCommandResult(
        schema=CLAIM_SCHEMA,
        status="blocked",
        message=f"Cannot claim objective:\n{reason}: {message}",
        result=None,
        selection=None,
        block=ClaimBlock(reason=reason, message=message),
    )


def _rerun_args(
    request: ClaimPlanRequest,
    *,
    slug: str,
    from_branch: str | None = None,
) -> tuple[str, ...]:
    args: list[str] = [slug]
    if request.target is not None:
        args.extend(("--target", request.target))
    if from_branch is not None:
        args.extend(("--from", from_branch))
    elif request.from_branch is not None:
        args.extend(("--from", request.from_branch))
    if request.from_file is not None:
        args.extend(("--from-file", request.from_file))
    return tuple(args)


def _selection_message(selection: ClaimSelection) -> str:
    if not selection.options:
        return selection.prompt
    lines = [selection.prompt]
    for option in selection.options:
        command = "objective exec claim " + " ".join(_shell_quote(arg) for arg in option.rerun_args)
        suffix = f" ({option.description})" if option.description else ""
        lines.append(f"- {option.label}{suffix}: {command}")
    return "\n".join(lines)


def _success_message(result: ClaimApplyResult, *, canonical_branch: str) -> str:
    files = "\n".join(f"- {file.file}" for file in result.files_carried) or "- none"
    return (
        f"Claimed objective: {result.slug}\n"
        f"Source: {result.source_label}\n"
        f"Target: {result.target_branch}\n\n"
        f"Files carried:\n{files}\n\n"
        f"Destination ref: {result.destination_ref}\n"
        f"Commit: {result.destination_commit_sha}\n\n"
        f"Next:\n"
        f"This branch is ready for implementation. After implementing the slice, merge\n"
        f"the PR and run objective-reconcile {result.slug} on {canonical_branch}. Run\n"
        f"objective-update {result.slug} only if another branch will claim from this\n"
        f"branch before it lands."
    )


def _shell_quote(part: str) -> str:
    return part if _is_shell_safe(part) else json.dumps(part)


def _is_shell_safe(part: str) -> bool:
    return bool(part) and all(char.isalnum() or char in "_./:@%+=,-" for char in part)
