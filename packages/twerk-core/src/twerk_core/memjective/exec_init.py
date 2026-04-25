"""Initialize the master-branch state.json blob for a memjective slug."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.discovery import MASTER_BRANCH
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE
from twerk_core.memjective.state import (
    STATE_BRANCH,
    STATE_NAMESPACE,
    STATE_VERSION,
    MemjectiveState,
    StateAbsent,
    StateInvalid,
    load_state,
    state_key,
)
from twerk_core.memjective.tree_model import build_memjective_tree_model


@dataclass(frozen=True)
class ExecInitRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]


@dataclass(frozen=True)
class ExecInitResult:
    slug: str
    created: bool
    commit_sha: str | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "created": self.created,
            "commit_sha": self.commit_sha,
        }


def render_exec_init(result: ExecInitResult) -> None:
    if result.created:
        click.echo(f"Initialized state for {result.slug!r}.")
        click.echo(f"Commit: {result.commit_sha}")
    else:
        click.echo(f"State already initialized for {result.slug!r}; no change.")


def _initial_state_payload(slug: str) -> dict[str, Any]:
    return {
        "version": STATE_VERSION,
        "slug": slug,
        "root": {
            "namespace": MEMJECTIVE_NAMESPACE,
            "branch": MASTER_BRANCH,
            "path": slug,
        },
        "entries": [],
    }


def serialize_state_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


@clinkr_operation(
    name="init",
    help=(
        "Initialize the master-branch state.json for a memjective slug. "
        "Idempotent when state already exists for the same slug."
    ),
    human_renderer=render_exec_init,
)
def run_exec_init(
    ctx: click.Context,
    request: ExecInitRequest,
) -> ClinkrExit[ExecInitResult]:
    mctx = load_typed_context(ctx, MemjectiveCliContext)

    tree_model = build_memjective_tree_model(
        slug=request.slug,
        brmem_gateway=mctx.brmem_gateway,
        git_gateway=mctx.git_gateway,
        pr_gateway=mctx.pr_gateway,
    )
    if not tree_model.seed_present:
        return ClinkrExit.failure(
            error_type="missing_root_memjective",
            message=(
                f"No root memjective at {MEMJECTIVE_NAMESPACE}/{MASTER_BRANCH}:{request.slug}/. "
                "Run dev-memjective-create first."
            ),
        )

    existing = load_state(slug=request.slug, brmem_gateway=mctx.brmem_gateway)
    match existing:
        case MemjectiveState():
            return ClinkrExit.ok(
                ExecInitResult(slug=request.slug, created=False, commit_sha=None),
            )
        case StateInvalid(reason=reason):
            return ClinkrExit.failure(
                error_type="state_invalid",
                message=(
                    f"Existing state for {request.slug!r} is invalid: {reason}. "
                    "Resolve before re-running init."
                ),
            )
        case StateAbsent():
            pass

    payload = _initial_state_payload(request.slug)
    content = serialize_state_payload(payload)
    try:
        commit_sha = mctx.brmem_gateway.put(
            STATE_NAMESPACE,
            state_key(request.slug),
            STATE_BRANCH,
            content,
        )
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or str(exc)).strip()
        return ClinkrExit.failure(
            error_type="git_failure",
            message=f"Failed to write state.json: {details}",
        )

    return ClinkrExit.ok(
        ExecInitResult(slug=request.slug, created=True, commit_sha=commit_sha),
    )
