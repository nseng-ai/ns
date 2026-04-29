"""``objective exec create-precheck`` — read-only validation for ``objective-create``.

Confirms that the agent's chosen slug is well-formed and does not collide
with an existing canonical objective on the repo's trunk branch before the agent invests
effort in drafting ``body.md`` / ``roadmap.md`` from the templates. Hard
preconditions (not in a git repo, detached HEAD) translate to
:class:`ClinkrExit.failure`; recoverable conditions (slug-format invalid,
slug collision) surface via the JSON envelope's structured ``status="error"``
detail so the skill can report and adjust.

Per the helpers-only scope (``docs/objective-system-canonicalization-plan.md``,
"Markdown prose is not schema"): this command does not load templates, draft
prose, parse Markdown, or generate slug names. It only validates what the
agent supplies.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.create_validation import (
    slug_collides_on_trunk,
    validate_slug_format,
)

PRECHECK_SCHEMA = "create-precheck/v1"

PrecheckStatus = Literal["ok", "error"]
PrecheckErrorReason = Literal["invalid_slug_format", "slug_collision"]


@dataclass(frozen=True)
class CreatePrecheckRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]


@dataclass(frozen=True)
class CreatePrecheckError(JsonSerializable):
    """Structured "skill can recover by picking a different slug" payload."""

    reason: PrecheckErrorReason
    message: str


@dataclass(frozen=True)
class CreatePrecheckResult(JsonSerializable):
    """Top-level envelope. Exactly one of ``status="ok"`` or ``status="error"``."""

    schema: str
    canonical_branch: str
    requested_slug: str
    status: PrecheckStatus
    slug: str | None
    error: CreatePrecheckError | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "canonical_branch": self.canonical_branch,
            "requested_slug": self.requested_slug,
            "status": self.status,
            "slug": self.slug,
            "error": (
                {"reason": self.error.reason, "message": self.error.message}
                if self.error is not None
                else None
            ),
        }


def render_create_precheck(result: CreatePrecheckResult) -> None:
    click.echo(f"create-precheck ({result.schema}): status={result.status}")
    if result.status == "ok":
        click.echo(f"  slug: {result.slug}")
    elif result.status == "error" and result.error is not None:
        click.echo(f"  error:   {result.error.reason}")
        click.echo(f"  message: {result.error.message}")


@clinkr_operation(
    name="create-precheck",
    help=(
        "Validate a candidate objective slug before the agent drafts body/roadmap. "
        "Confirms repo + non-detached-HEAD, slug format (lowercase ASCII, "
        "hyphen-separated, <=50 chars, no 'objective-' prefix, no 'body.md' "
        "suffix), and absence of an existing canonical snapshot under <slug>/ "
        "on the trunk branch. Returns status='ok' (slug echoed) or status='error' "
        "(skill picks a different slug or routes to objective-update). "
        "No template loading, no prose synthesis."
    ),
    human_renderer=render_create_precheck,
)
def run_create_precheck_objective(
    ctx: click.Context,
    request: CreatePrecheckRequest,
) -> ClinkrExit[CreatePrecheckResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway

    cwd = Path.cwd()
    if git.get_git_common_dir(cwd) is None:
        return ClinkrExit.failure(
            error_type="not_in_repo",
            message=(
                "Not inside a git repository. Run objective-create from a checked-out "
                "repo with canonical state on the trunk branch."
            ),
        )

    trunk_branch = git.get_trunk_branch()

    match git.get_current_branch(cwd):
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message=(
                    "Detached HEAD: objective-create requires a checked-out branch "
                    "so the agent has stable context. Canonical writes always go to "
                    f"{trunk_branch!r} regardless of the current branch."
                ),
            )
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case str():
            pass

    invalid = validate_slug_format(request.slug)
    if invalid is not None:
        return ClinkrExit.ok(
            CreatePrecheckResult(
                schema=PRECHECK_SCHEMA,
                canonical_branch=trunk_branch,
                requested_slug=request.slug,
                status="error",
                slug=None,
                error=CreatePrecheckError(
                    reason="invalid_slug_format",
                    message=invalid.message,
                ),
            )
        )

    if slug_collides_on_trunk(gateway, slug=request.slug, trunk_branch=trunk_branch):
        return ClinkrExit.ok(
            CreatePrecheckResult(
                schema=PRECHECK_SCHEMA,
                canonical_branch=trunk_branch,
                requested_slug=request.slug,
                status="error",
                slug=None,
                error=CreatePrecheckError(
                    reason="slug_collision",
                    message=(
                        f"Canonical state on {trunk_branch!r} already carries an "
                        f"objective under {request.slug!r}/. Pick a different slug or "
                        f"run `objective-update {request.slug}` to advance the existing one."
                    ),
                ),
            )
        )

    return ClinkrExit.ok(
        CreatePrecheckResult(
            schema=PRECHECK_SCHEMA,
            canonical_branch=trunk_branch,
            requested_slug=request.slug,
            status="ok",
            slug=request.slug,
            error=None,
        )
    )
