from __future__ import annotations

import pytest

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRSummary
from asdl_core.git.testing import FakeGitGateway
from asdl_pr_address.cli.pr_address.reply_formatting import _resolution_summary
from asdl_pr_address.cli.pr_address.resolution_provenance import (
    ResolutionProvenance,
    ResolutionProvenanceInput,
)
from asdl_pr_address.cli.pr_address.resolve_thread_with_reply import (
    ResolveThreadWithReplyRequest,
    normalize_resolution_request,
)


def test_normalize_planned_local_branch_requires_only_git_gateway() -> None:
    normalized = normalize_resolution_request(
        ResolveThreadWithReplyRequest(
            thread_id="PRRT_plan",
            mode="planned",
            message="Reuse the branch.",
            commit_sha=None,
        ),
        pr_gateway=None,
        git_gateway=FakeGitGateway(
            branches=("reuse-worker",),
            branch_head_oid_by_branch={"reuse-worker": "abc1234"},
        ),
        provenance_input=ResolutionProvenanceInput(kind="local_branch", branch="reuse-worker"),
    )

    assert normalized.provenance is not None
    assert normalized.provenance.branch == "reuse-worker"
    assert normalized.provenance.branch_head_oid == "abc1234"


def test_normalize_planned_pr_requires_only_pr_gateway() -> None:
    normalized = normalize_resolution_request(
        ResolveThreadWithReplyRequest(
            thread_id="PRRT_plan_pr",
            mode="planned",
            message="Use the follow-up PR.",
            commit_sha=None,
        ),
        pr_gateway=FakePRGateway(
            prs=(
                PRSummary(
                    number=1073,
                    title="Follow-up",
                    url="https://github.com/dagster-io/asdl-tools/pull/1073",
                    head_ref_name="follow-up",
                    base_ref_name="master",
                    state="OPEN",
                    head_ref_oid="def5678",
                ),
            )
        ),
        git_gateway=None,
        provenance_input=ResolutionProvenanceInput(kind="pr", pr_number=1073),
    )

    assert normalized.provenance is not None
    assert normalized.provenance.pr_number == 1073
    assert normalized.provenance.pr_head_ref_oid == "def5678"


def test_planned_local_branch_summary_rejects_missing_branch() -> None:
    with pytest.raises(ValueError) as excinfo:
        _resolution_summary(
            mode="planned",
            message="Reuse the branch.",
            commit_sha=None,
            provenance=ResolutionProvenance(kind="local_branch"),
        )

    assert str(excinfo.value) == "kind='local_branch' provenance requires branch"


def test_planned_summary_rejects_missing_message() -> None:
    with pytest.raises(ValueError) as excinfo:
        _resolution_summary(
            mode="planned",
            message=None,
            commit_sha=None,
            provenance=ResolutionProvenance(kind="local_branch", branch="reuse-worker"),
        )

    assert str(excinfo.value) == "mode='planned' requires a non-empty message"


def test_planned_pr_summary_rejects_missing_pr_url() -> None:
    with pytest.raises(ValueError) as excinfo:
        _resolution_summary(
            mode="planned",
            message="Use the PR.",
            commit_sha=None,
            provenance=ResolutionProvenance(
                kind="pr",
                pr_number=1073,
                pr_state="OPEN",
                pr_head_ref_name="follow-up",
            ),
        )

    assert str(excinfo.value) == "kind='pr' provenance requires pr_url"
