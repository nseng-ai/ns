"""Validated provenance for planned PR review-thread resolutions."""

from __future__ import annotations

from typing import Literal

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss, PRSummary
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required

ResolutionProvenanceKind = Literal["local_branch", "pr"]


class ResolutionProvenanceInput(ClinkrModel):
    kind: ResolutionProvenanceKind
    branch: str | None = None
    pr_number: int | None = None


class ResolutionProvenance(ClinkrModel):
    kind: ResolutionProvenanceKind
    branch: str | None = None
    branch_head_oid: str | None = None
    pr_number: int | None = None
    pr_url: str | None = None
    pr_state: str | None = None
    pr_head_ref_name: str | None = None
    pr_head_ref_oid: str | None = None


def parse_resolution_provenance_json(
    value: str | None,
    *,
    command_name: str,
) -> ResolutionProvenanceInput | None:
    if value is None:
        return None
    return load_json_input(
        option_value=value,
        command_name=command_name,
        input_description="provenance JSON",
        option_name="--provenance-json",
        allow_stdin=False,
        parser=ResolutionProvenanceInput.model_validate_json,
    )


def validate_resolution_provenance(
    provenance_input: ResolutionProvenanceInput,
    *,
    pr_gateway: PRGateway | None,
    git_gateway: GitGateway | None,
) -> ResolutionProvenance:
    if provenance_input.kind == "local_branch":
        return _validate_local_branch_provenance(
            provenance_input,
            git_gateway=Ensure.not_none(
                git_gateway,
                error_type="invalid_request",
                message="local_branch planned provenance requires a git gateway for validation",
            ),
        )
    if provenance_input.kind == "pr":
        return _validate_pr_provenance(
            provenance_input,
            pr_gateway=Ensure.not_none(
                pr_gateway,
                error_type="invalid_request",
                message="pr planned provenance requires a PR gateway for validation",
            ),
        )
    Ensure.fail(
        error_type="invalid_request",
        message=f"Unsupported planned provenance kind: {provenance_input.kind}",
    )


def provenance_shape_error(provenance_input: ResolutionProvenanceInput) -> str | None:
    if provenance_input.kind == "local_branch":
        branch = trim_optional(provenance_input.branch)
        if branch is None:
            return "kind='local_branch' provenance requires a non-empty branch"
        if provenance_input.pr_number is not None:
            return "kind='local_branch' provenance must not include pr_number"
        return None
    if provenance_input.kind == "pr":
        if provenance_input.pr_number is None:
            return "kind='pr' provenance requires pr_number"
        if provenance_input.pr_number <= 0:
            return "kind='pr' provenance requires a positive pr_number"
        branch = trim_optional(provenance_input.branch)
        if branch is not None:
            return "kind='pr' provenance must not include branch"
        return None
    return f"Unsupported planned provenance kind: {provenance_input.kind}"


def _validate_local_branch_provenance(
    provenance_input: ResolutionProvenanceInput,
    *,
    git_gateway: GitGateway,
) -> ResolutionProvenance:
    shape_error = provenance_shape_error(provenance_input)
    if shape_error is not None:
        Ensure.fail(error_type="invalid_request", message=shape_error)

    branch = trim_required(provenance_input.branch)
    if not git_gateway.branch_exists(branch):
        Ensure.fail(
            error_type="invalid_request",
            message=f"planned provenance local branch does not exist: {branch}",
        )

    branch_head_oid = git_gateway.branch_head_oid(branch)
    if isinstance(branch_head_oid, GitCommandFailure):
        Ensure.fail(
            error_type=branch_head_oid.error_type,
            message=(
                "Failed to validate planned provenance local branch "
                f"{branch}: {branch_head_oid.message}"
            ),
        )

    return ResolutionProvenance(
        kind="local_branch",
        branch=branch,
        branch_head_oid=branch_head_oid,
    )


def _validate_pr_provenance(
    provenance_input: ResolutionProvenanceInput,
    *,
    pr_gateway: PRGateway,
) -> ResolutionProvenance:
    shape_error = provenance_shape_error(provenance_input)
    if shape_error is not None:
        Ensure.fail(error_type="invalid_request", message=shape_error)

    pr_number = provenance_input.pr_number
    assert pr_number is not None, "provenance_shape_error must reject missing pr_number"

    pr = pr_gateway.get_pr(pr_number)
    if isinstance(pr, PRLookupMiss):
        Ensure.fail(
            error_type="invalid_request",
            message=f"planned provenance PR does not exist: #{pr_number}",
        )
    if isinstance(pr, PRGatewayFailure):
        Ensure.fail(
            error_type="pr_gateway_failure",
            message=f"Failed to validate planned provenance PR #{pr_number}: {pr.stderr}",
        )

    return _provenance_from_pr_summary(pr)


def _provenance_from_pr_summary(pr: PRSummary) -> ResolutionProvenance:
    return ResolutionProvenance(
        kind="pr",
        pr_number=pr.number,
        pr_url=pr.url,
        pr_state=pr.state,
        pr_head_ref_name=pr.head_ref_name,
        pr_head_ref_oid=pr.head_ref_oid,
    )
