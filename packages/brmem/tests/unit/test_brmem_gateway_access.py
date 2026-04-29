from __future__ import annotations

from pathlib import Path

import click
import pytest

from brmem.context import BrmemCliContext
from brmem.fake import FakeBranchMemoryGateway
from brmem.gateway_access import resolve_current_brmem_branch
from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure


def _ctx_with_git(git_gateway: FakeGitGateway) -> click.Context:
    brmem_ctx = BrmemCliContext(
        brmem_gateway=FakeBranchMemoryGateway(),
        git_gateway=git_gateway,
    )
    ctx = click.Context(click.Command("test"))
    ctx.obj = build_clinkr_context_object(lambda: brmem_ctx)
    return ctx


def test_resolve_returns_requested_branch_without_consulting_gateway() -> None:
    ctx = _ctx_with_git(FakeGitGateway())

    assert resolve_current_brmem_branch(ctx, "feature/x") == "feature/x"


def test_resolve_returns_current_branch_when_requested_is_none() -> None:
    ctx = _ctx_with_git(FakeGitGateway(current_branch_by_path={Path.cwd(): "main"}))

    assert resolve_current_brmem_branch(ctx, None) == "main"


def test_resolve_maps_detached_head_to_failure_exit() -> None:
    ctx = _ctx_with_git(FakeGitGateway(current_branch_by_path={Path.cwd(): DetachedHead()}))

    with pytest.raises(ClinkrFailure) as exc_info:
        resolve_current_brmem_branch(ctx, None)

    assert exc_info.value.error_type == "detached_head"
    assert exc_info.value.message == "Detached HEAD: requires a checked-out branch."


def test_resolve_maps_git_command_failure_to_failure_exit() -> None:
    ctx = _ctx_with_git(
        FakeGitGateway(
            current_branch_by_path={
                Path.cwd(): GitCommandFailure(message="boom", returncode=128),
            },
        ),
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        resolve_current_brmem_branch(ctx, None)

    assert exc_info.value.error_type == "git_failed"
    assert exc_info.value.message == "boom"
