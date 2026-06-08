from __future__ import annotations

import pytest

from asdl_pr_address.cli.pr_address.reply_formatting import _resolution_summary
from asdl_pr_address.cli.pr_address.resolution_provenance import ResolutionProvenance


def test_resolution_summary_rejects_unknown_mode_and_names_valid_modes() -> None:
    with pytest.raises(ValueError) as excinfo:
        # Test subject: `mode` outside the Literal — verifies the runtime ValueError guard.
        _resolution_summary(mode="addressed", message="m", commit_sha="s")  # type: ignore[arg-type]

    message = str(excinfo.value)
    assert "Unsupported resolution mode: addressed" in message
    assert "Valid modes:" in message
    for expected in ("pre_existing", "fixed", "explained", "planned"):
        assert expected in message


def test_resolution_summary_formats_planned_local_branch_provenance() -> None:
    summary = _resolution_summary(
        mode="planned",
        message="Reuse the metadata worker.",
        commit_sha=None,
        provenance=ResolutionProvenance(
            kind="local_branch",
            branch="reuse-worker",
            branch_head_oid="abc1234",
        ),
    )

    assert summary == (
        "Planned follow-up: Reuse the metadata worker.\n"
        "\n"
        "Provenance:\n"
        "- Local branch: `reuse-worker`\n"
        "- Branch HEAD snapshot: `abc1234`"
    )


def test_resolution_summary_formats_planned_pr_provenance() -> None:
    summary = _resolution_summary(
        mode="planned",
        message="Move the fix into the follow-up PR.",
        commit_sha=None,
        provenance=ResolutionProvenance(
            kind="pr",
            pr_number=1073,
            pr_url="https://github.com/dagster-io/asdl/pull/1073",
            pr_state="OPEN",
            pr_head_ref_name="follow-up",
            pr_head_ref_oid="def5678",
        ),
    )

    assert "Planned follow-up: Move the fix into the follow-up PR." in summary
    assert "- PR: #1073 https://github.com/dagster-io/asdl/pull/1073" in summary
    assert "- PR state snapshot: OPEN" in summary
    assert "- PR head snapshot: `follow-up` at `def5678`" in summary
