"""Validated provenance for planned PR review-thread resolutions."""

from __future__ import annotations

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss, PRSummary
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_pr_address.cli.pr_address.resolution_provenance_models import (
    LocalBranchResolutionProvenance,
    LocalBranchResolutionProvenanceInput,
    PrResolutionProvenance,
    PrResolutionProvenanceInput,
    ResolutionProvenance,
    ResolutionProvenanceInput,
    resolution_provenance_input_adapter,
)
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required


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
        parser=resolution_provenance_input_adapter().validate_json,
    )


def validate_resolution_provenance(
    provenance_input: ResolutionProvenanceInput,
    *,
    pr_gateway: PRGateway | None,
    git_gateway: GitGateway | None,
) -> ResolutionProvenance:
    shape_error = provenance_shape_error(provenance_input)
    if shape_error is not None:
        Ensure.fail(error_type="invalid_request", message=shape_error)

    if isinstance(provenance_input, LocalBranchResolutionProvenanceInput):
        return _validate_local_branch_provenance(
            provenance_input,
            git_gateway=Ensure.not_none(
                git_gateway,
                error_type="invalid_request",
                message="local_branch planned provenance requires a git gateway for validation",
            ),
        )
    if isinstance(provenance_input, PrResolutionProvenanceInput):
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
    if isinstance(provenance_input, LocalBranchResolutionProvenanceInput):
        if trim_optional(provenance_input.branch) is None:
            return "kind='local_branch' provenance requires a non-empty branch"
        return None
    if isinstance(provenance_input, PrResolutionProvenanceInput):
        if provenance_input.pr_number <= 0:
            return "kind='pr' provenance requires a positive pr_number"
        return None
    return f"Unsupported planned provenance kind: {provenance_input.kind}"


def _validate_local_branch_provenance(
    provenance_input: LocalBranchResolutionProvenanceInput,
    *,
    git_gateway: GitGateway,
) -> LocalBranchResolutionProvenance:
    branch = trim_required(provenance_input.branch)
    branch_head_oid = git_gateway.branch_head_oid(branch)
    if isinstance(branch_head_oid, GitCommandFailure):
        Ensure.fail(
            error_type="invalid_request",
            message=(
                "planned provenance local branch does not exist or cannot be resolved: "
                f"{branch} ({branch_head_oid.message})"
            ),
        )

    return LocalBranchResolutionProvenance(
        kind="local_branch",
        branch=branch,
        branch_head_oid=branch_head_oid,
    )


def _validate_pr_provenance(
    provenance_input: PrResolutionProvenanceInput,
    *,
    pr_gateway: PRGateway,
) -> PrResolutionProvenance:
    pr = pr_gateway.get_pr(provenance_input.pr_number)
    if isinstance(pr, PRLookupMiss):
        Ensure.fail(
            error_type="invalid_request",
            message=f"planned provenance PR does not exist: #{provenance_input.pr_number}",
        )
    if isinstance(pr, PRGatewayFailure):
        Ensure.fail(
            error_type="pr_gateway_failure",
            message=(
                "Failed to validate planned provenance PR "
                f"#{provenance_input.pr_number}: {pr.stderr}"
            ),
        )

    return _provenance_from_pr_summary(pr)


def _provenance_from_pr_summary(pr: PRSummary) -> PrResolutionProvenance:
    return PrResolutionProvenance(
        kind="pr",
        pr_number=pr.number,
        pr_url=pr.url,
        pr_state=pr.state,
        pr_head_ref_name=pr.head_ref_name,
        pr_head_ref_oid=pr.head_ref_oid,
    )
