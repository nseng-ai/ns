"""Delete one directed handoff artifact."""

from __future__ import annotations

import subprocess
import sys
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_handoff.cli.handoff.context import HandoffCliContext
from asdl_handoff.cli.handoff.inventory import HANDOFF_NAMESPACE
from brmem.gateway import KeyNotFoundError
from brmem.key_validation import check_key
from brmem.ref_layout import check_branch_name, ref_name_for_entry

HANDOFF_KEY_SUFFIX = ".md"


class DeleteHandoffRequest(ClinkrModel):
    slug: Annotated[str, click.Argument(["slug"], type=click.STRING)]
    branch: str | None = None
    force: Annotated[
        bool,
        click.Option(["-f", "--force"], is_flag=True, default=False),
    ] = False


class DeleteHandoffResult(ClinkrModel):
    branch: str
    slug: str
    key: str
    entry_locator: str
    deleted: bool
    cancelled: bool = False
    commit: str | None = None


def render_delete_handoff(result: DeleteHandoffResult) -> None:
    if result.cancelled:
        click.echo("Cancelled — no handoff deleted.")
        return

    click.echo(
        "\n".join(
            [
                f"Deleted handoff `{result.slug}` on branch `{result.branch}`.",
                f"Entry Locator: {result.entry_locator}",
                f"Commit: {result.commit}",
            ]
        )
    )


@clinkr_operation(
    name="delete",
    help="Delete one saved handoff by exact slug.",
    human_renderer=render_delete_handoff,
)
def run_delete_handoff(
    ctx: click.Context,
    request: DeleteHandoffRequest,
) -> ClinkrExit[DeleteHandoffResult]:
    handoff_context = load_typed_context(ctx, HandoffCliContext)
    key = _handoff_key_from_slug(request.slug)
    branch = _resolve_branch(handoff_context, request.branch)
    entry_locator = ref_name_for_entry(HANDOFF_NAMESPACE, key, branch)

    _ensure_handoff_exists(handoff_context, slug=request.slug, key=key, branch=branch)

    if not request.force and not _confirm_delete_handoff(request.slug, branch):
        return ClinkrExit.ok(
            DeleteHandoffResult(
                branch=branch,
                slug=request.slug,
                key=key,
                entry_locator=entry_locator,
                deleted=False,
                cancelled=True,
            )
        )

    try:
        commit = handoff_context.brmem_gateway.delete(HANDOFF_NAMESPACE, key, branch)
    except KeyNotFoundError as exc:
        raise ClinkrFailure(
            error_type="handoff_not_found",
            message=f"No handoff `{request.slug}` found on branch `{branch}`.",
        ) from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip() or str(exc)
        raise ClinkrFailure(
            error_type="git_failure",
            message=f"Failed to delete handoff: {details}",
        ) from exc

    return ClinkrExit.ok(
        DeleteHandoffResult(
            branch=branch,
            slug=request.slug,
            key=key,
            entry_locator=entry_locator,
            deleted=True,
            commit=commit,
        )
    )


def _handoff_key_from_slug(slug: str) -> str:
    Ensure.true(
        slug != "",
        error_type="invalid_handoff_slug",
        message="Pass a non-empty handoff slug without `.md`.",
    )
    Ensure.true(
        not slug.endswith(HANDOFF_KEY_SUFFIX),
        error_type="invalid_handoff_slug",
        message=("Pass the handoff slug without `.md` (for example, `alpha`, not `alpha.md`)."),
    )
    Ensure.true(
        "/" not in slug,
        error_type="invalid_handoff_slug",
        message="Pass a flat handoff slug without `/` or `.md`.",
    )

    key = f"{slug}{HANDOFF_KEY_SUFFIX}"
    validation_failure = check_key(key)
    Ensure.true(
        validation_failure is None,
        error_type="invalid_handoff_slug",
        message=validation_failure or "invalid handoff slug",
    )
    return key


def _resolve_branch(context: HandoffCliContext, requested_branch: str | None) -> str:
    if requested_branch is not None:
        _validate_branch_name(requested_branch)
        return requested_branch

    current = context.git_gateway.get_current_branch(context.cwd)
    if isinstance(current, DetachedHead):
        Ensure.fail(
            error_type="detached_head",
            message="Cannot delete handoff in detached HEAD; pass --branch <branch>.",
        )
    if isinstance(current, GitCommandFailure):
        Ensure.fail(error_type=current.error_type, message=current.message)

    _validate_branch_name(current)
    return current


def _validate_branch_name(branch: str) -> None:
    validation_failure = check_branch_name(branch)
    Ensure.true(
        validation_failure is None,
        error_type="invalid_branch_name",
        message=validation_failure or "invalid branch name",
    )


def _ensure_handoff_exists(
    context: HandoffCliContext,
    *,
    slug: str,
    key: str,
    branch: str,
) -> None:
    diagnostic = context.brmem_gateway.check(HANDOFF_NAMESPACE, key, branch)
    Ensure.true(
        diagnostic is not None,
        error_type="handoff_not_found",
        message=f"No handoff `{slug}` found on branch `{branch}`.",
    )


def _confirm_delete_handoff(slug: str, branch: str) -> bool:
    while True:
        click.echo(f"Delete handoff `{slug}` on branch `{branch}`? [y/N]: ", err=True, nl=False)
        sys.stderr.flush()
        raw_value = sys.stdin.readline()
        if raw_value == "":
            raise click.Abort()

        value = raw_value.strip().lower()
        if value in ("y", "yes"):
            return True
        if value in ("", "n", "no"):
            return False
        click.echo("Error: invalid input", err=True)
