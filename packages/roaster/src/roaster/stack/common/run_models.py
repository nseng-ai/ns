"""Shared run-state models for roaster stack implementations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal, Self

from asdl_core.clinkr.models import ClinkrModel
from roaster.stack.core.contracts import (
    GeneratedStackBranch,
    ResolverStatus,
    StackBatchStatus,
    StackConfidence,
    StackGeneratedBranchStatus,
    StackMarker,
    StackRisk,
)

if TYPE_CHECKING:
    from roaster.stack.common.run_storage import StackRunLocator

StackRunSubmissionStatus = Literal["not_started", "submitted", "failed"]
StackRunDashboardPublicationAction = Literal["created", "updated"]


class StackWorkflowRequest(ClinkrModel):
    """User-facing request facts for a roaster stack run."""

    profile_slug: str
    target_branch: str | None = None
    target_pr: str | None = None
    reviewers: tuple[str, ...] = ()
    model: str | None = None
    agent_model: str | None = None
    harness: str | None = None
    base_ref: str | None = None
    dry_run: bool = False
    new_run: bool = False
    run_slug: str | None = None
    triage_prompt: str | None = None
    resolver_prompt: str | None = None


class StackRunArtifactLocator(ClinkrModel):
    """Branch Memory locator persisted inside a stack run manifest."""

    namespace: str
    key: str
    branch: str

    @classmethod
    def from_locator(cls, locator: StackRunLocator) -> Self:
        """Convert a storage locator into the manifest/result locator model."""
        return cls(namespace=locator.namespace, key=locator.key, branch=locator.branch)


class StackRunFailureContext(ClinkrModel):
    """Durable failure context for audit and resume decisions."""

    error_type: str
    message: str


class StackRunDashboardPublication(ClinkrModel):
    """Known dashboard comment linkage for a stack run."""

    marker: str
    target_pr: str
    action: StackRunDashboardPublicationAction
    comment_id: int | None = None
    comment_url: str | None = None


class StackRunSubmission(ClinkrModel):
    """Durable submission outcome for generated stack publication."""

    status: StackRunSubmissionStatus = "not_started"
    failure: StackRunFailureContext | None = None


class StackRunBatchState(ClinkrModel):
    """Durable audit/resume state for one resolver batch."""

    batch_slug: str
    title: str = ""
    status: StackBatchStatus = "pending"
    finding_ids: tuple[str, ...] = ()
    dependencies: tuple[str, ...] = ()
    confidence: StackConfidence = "medium"
    risk: StackRisk = "behavioral"
    resolver_mandate: str = ""
    validation_requirements: tuple[str, ...] = ()
    expected_paths: tuple[str, ...] = ()
    generated_branch: GeneratedStackBranch | None = None
    generated_branch_status: StackGeneratedBranchStatus | None = None
    resolver_locator: StackRunArtifactLocator | None = None
    resolver_status: ResolverStatus | None = None
    summary: str = ""
    validation_summary: str | None = None
    failure: StackRunFailureContext | None = None


class StackRunManifest(ClinkrModel):
    """Persisted roaster stack run state for audit and resume."""

    schema_version: str = "roaster.stack.run-manifest.v1"
    profile_slug: str
    run_slug: str
    impl_branch_slug: str
    base_ref: str | None = None
    target_branch: str | None = None
    target_pr: str | None = None
    batch_slugs: tuple[str, ...]
    generated_branches: tuple[GeneratedStackBranch, ...] = ()
    markers: tuple[StackMarker, ...] = ()
    batch_states: tuple[StackRunBatchState, ...] = ()
    dashboard_publication: StackRunDashboardPublication | None = None
    submission: StackRunSubmission = StackRunSubmission()


class StackDashboardRow(ClinkrModel):
    """Dashboard row shape for one roaster stack batch."""

    run_slug: str
    batch_slug: str
    title: str
    status: StackBatchStatus
    branch_name: str | None = None
    summary: str = ""
    validation_summary: str | None = None


class StackWorkflowResult(ClinkrModel):
    """Top-level result shape for future roaster stack orchestration."""

    run_slug: str
    status: StackBatchStatus
    manifest: StackRunManifest
    dashboard_rows: tuple[StackDashboardRow, ...] = ()
