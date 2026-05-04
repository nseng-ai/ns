"""Focused unit coverage for private claim helpers and apply-time drift checks."""

from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.claim import ClaimSource, ResolvedClaim, _normalize_slug, apply_claim
from brmem.fake import FakeBranchMemoryGateway


def _make_ctx(gateway: FakeBranchMemoryGateway) -> ObjectiveCliContext:
    return ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=FakeGitGateway(
            current_branch_by_path={Path.cwd(): "feat/x"},
            branches=("master", "feat/x", "feat/source"),
            trunk_branch="master",
        ),
        pr_gateway=FakePRGateway(),
    )


def _branch_claim() -> ResolvedClaim:
    return ResolvedClaim(
        slug="widget-rewrite",
        target_branch="feat/x",
        source=ClaimSource(
            kind="branch",
            branch="feat/source",
            from_file_path=None,
            label="branch feat/source (explicit --from)",
        ),
    )


def test_normalize_slug_none_passes_through() -> None:
    assert _normalize_slug(None) is None


def test_normalize_slug_empty_string_becomes_none() -> None:
    assert _normalize_slug("") is None
    assert _normalize_slug("   ") is None


def test_normalize_slug_trims_and_strips_addressing() -> None:
    assert _normalize_slug(" widget-rewrite ") == "widget-rewrite"
    assert _normalize_slug("widget-rewrite/body.md") == "widget-rewrite"


def test_apply_claim_rejects_when_target_now_carries_slug() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/source", "# source\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# already there\n")

    with pytest.raises(ClinkrFailure) as exc_info:
        apply_claim(_make_ctx(gateway), _branch_claim())

    assert exc_info.value.error_type == "target_collision"
    assert gateway.get("objectives", "widget-rewrite/body.md", "feat/x") == "# already there\n"


def test_apply_claim_rejects_when_source_no_longer_has_body() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(ClinkrFailure) as exc_info:
        apply_claim(_make_ctx(gateway), _branch_claim())

    assert exc_info.value.error_type == "source_missing_slug"


def test_apply_claim_rejects_when_from_file_no_longer_exists(tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    missing_path = tmp_path / "missing.md"
    claim = ResolvedClaim(
        slug="widget-rewrite",
        target_branch="feat/x",
        source=ClaimSource(
            kind="local_file",
            branch=None,
            from_file_path=str(missing_path),
            label=f"local file {missing_path} (bootstrap body.md only)",
        ),
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        apply_claim(_make_ctx(gateway), claim)

    assert exc_info.value.error_type == "from_file_unreadable"
