"""Canonical resolve-thread payload decision validation."""

from __future__ import annotations

from typing import cast

from asdl_core.clinkr.models import ClinkrModel
from asdl_pr_address.cli.pr_address.reply_formatting import (
    VALID_RESOLUTION_MODES,
    ResolutionReplyMode,
    valid_resolution_modes_text,
)
from asdl_pr_address.cli.pr_address.resolution_provenance import provenance_shape_error
from asdl_pr_address.cli.pr_address.resolution_provenance_models import ResolutionProvenanceInput
from asdl_pr_address.cli.pr_address.resolve_thread_batch import ResolveThreadBatchItem
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required


class ThreadResolutionDecisionFields(ClinkrModel):
    action: str
    mode: str | None = None
    message: str | None = None
    commit_sha: str | None = None
    provenance: ResolutionProvenanceInput | None = None
    skip_reason: str | None = None


class ThreadResolutionDecisionIssue(ClinkrModel):
    code: str
    message: str


class BuiltThreadResolutionDecision(ClinkrModel):
    errors: tuple[ThreadResolutionDecisionIssue, ...] = ()
    payload_item: ResolveThreadBatchItem | None = None
    skip_reason: str | None = None


def build_thread_resolution_decision(
    *,
    thread_id: str,
    subject_label: str,
    batch_commit_sha: str | None,
    decision: ThreadResolutionDecisionFields,
) -> BuiltThreadResolutionDecision:
    action = decision.action.strip()
    mode = trim_optional(decision.mode)
    message = trim_optional(decision.message)
    item_commit_sha = trim_optional(decision.commit_sha)
    skip_reason = trim_optional(decision.skip_reason)
    provenance = decision.provenance

    if action == "skip":
        return _build_skip_decision(
            subject_label=subject_label,
            mode=mode,
            message=message,
            item_commit_sha=item_commit_sha,
            provenance=provenance,
            skip_reason=skip_reason,
        )

    if action != "resolve":
        return BuiltThreadResolutionDecision(
            errors=(
                ThreadResolutionDecisionIssue(
                    code="invalid_action",
                    message=(
                        f"Decision for {subject_label} must use action='resolve' or action='skip'."
                    ),
                ),
            )
        )

    errors = _resolve_decision_issues(
        subject_label=subject_label,
        batch_commit_sha=batch_commit_sha,
        mode=mode,
        message=message,
        item_commit_sha=item_commit_sha,
        provenance=provenance,
    )
    if errors:
        return BuiltThreadResolutionDecision(errors=errors)

    assert mode in VALID_RESOLUTION_MODES
    resolution_mode = cast(ResolutionReplyMode, mode)
    if resolution_mode == "pre_existing":
        return BuiltThreadResolutionDecision(
            payload_item=ResolveThreadBatchItem(
                thread_id=thread_id,
                mode=resolution_mode,
                message=None,
                commit_sha=None,
                provenance=None,
            )
        )

    return BuiltThreadResolutionDecision(
        payload_item=ResolveThreadBatchItem(
            thread_id=thread_id,
            mode=resolution_mode,
            message=message,
            commit_sha=item_commit_sha,
            provenance=provenance if resolution_mode == "planned" else None,
        )
    )


def _build_skip_decision(
    *,
    subject_label: str,
    mode: str | None,
    message: str | None,
    item_commit_sha: str | None,
    provenance: ResolutionProvenanceInput | None,
    skip_reason: str | None,
) -> BuiltThreadResolutionDecision:
    errors: list[ThreadResolutionDecisionIssue] = []
    if skip_reason is None:
        errors.append(
            ThreadResolutionDecisionIssue(
                code="missing_skip_reason",
                message=f"Skip decision for {subject_label} requires a non-empty skip_reason.",
            )
        )
    if (
        mode is not None
        or message is not None
        or item_commit_sha is not None
        or provenance is not None
    ):
        errors.append(
            ThreadResolutionDecisionIssue(
                code="skip_decision_has_resolution_fields",
                message=(
                    f"Skip decision for {subject_label} must not include non-empty mode, "
                    "message, commit_sha, or provenance fields."
                ),
            )
        )
    if errors:
        return BuiltThreadResolutionDecision(errors=tuple(errors))
    return BuiltThreadResolutionDecision(skip_reason=trim_required(skip_reason))


def _resolve_decision_issues(
    *,
    subject_label: str,
    batch_commit_sha: str | None,
    mode: str | None,
    message: str | None,
    item_commit_sha: str | None,
    provenance: ResolutionProvenanceInput | None,
) -> tuple[ThreadResolutionDecisionIssue, ...]:
    if mode not in VALID_RESOLUTION_MODES:
        return (
            ThreadResolutionDecisionIssue(
                code="invalid_mode",
                message=(
                    f"Resolve decision for {subject_label} must use one of: "
                    f"{valid_resolution_modes_text()}."
                ),
            ),
        )

    errors: list[ThreadResolutionDecisionIssue] = []
    if mode in ("fixed", "explained", "planned") and message is None:
        errors.append(
            ThreadResolutionDecisionIssue(
                code="missing_message",
                message=f"mode='{mode}' decision for {subject_label} requires a non-empty message.",
            )
        )
    if mode == "fixed" and item_commit_sha is None and batch_commit_sha is None:
        errors.append(
            ThreadResolutionDecisionIssue(
                code="missing_commit_sha",
                message=(
                    f"Decision for {subject_label} uses mode='fixed' but no batch or item "
                    "commit_sha was supplied."
                ),
            )
        )
    if mode != "planned" and provenance is not None:
        errors.append(
            ThreadResolutionDecisionIssue(
                code="non_planned_has_provenance",
                message=(
                    f"mode='{mode}' decision for {subject_label} must not include provenance; "
                    "provenance is only valid with mode='planned'."
                ),
            )
        )
    if mode == "planned":
        errors.extend(
            _planned_decision_issues(
                subject_label=subject_label,
                item_commit_sha=item_commit_sha,
                provenance=provenance,
            )
        )
    if mode == "pre_existing" and (message is not None or item_commit_sha is not None):
        errors.append(
            ThreadResolutionDecisionIssue(
                code="pre_existing_has_resolution_fields",
                message=(
                    f"mode='pre_existing' decision for {subject_label} must not include "
                    "non-empty message, commit_sha, or provenance fields."
                ),
            )
        )
    return tuple(errors)


def _planned_decision_issues(
    *,
    subject_label: str,
    item_commit_sha: str | None,
    provenance: ResolutionProvenanceInput | None,
) -> tuple[ThreadResolutionDecisionIssue, ...]:
    errors: list[ThreadResolutionDecisionIssue] = []
    if provenance is None:
        errors.append(
            ThreadResolutionDecisionIssue(
                code="missing_provenance",
                message=f"mode='planned' decision for {subject_label} requires provenance.",
            )
        )
    if item_commit_sha is not None:
        errors.append(
            ThreadResolutionDecisionIssue(
                code="planned_has_commit_sha",
                message=(
                    f"mode='planned' decision for {subject_label} must not include item commit_sha."
                ),
            )
        )
    if provenance is not None:
        error_message = provenance_shape_error(provenance)
        if error_message is not None:
            errors.append(
                ThreadResolutionDecisionIssue(
                    code="invalid_provenance_shape",
                    message=f"mode='planned' decision for {subject_label}: {error_message}.",
                )
            )
    return tuple(errors)
