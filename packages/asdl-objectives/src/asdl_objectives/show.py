"""Present-state summary for a single objective slug."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click
from rich.markdown import Markdown

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.closed_marker import ClosedMarker, load_closed_marker
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import (
    BODY_FILE,
    NOTES_FILE,
    ROADMAP_FILE,
    BranchPresence,
    ObjectiveState,
    closed_key,
)
from asdl_objectives.gateway_access import OBJECTIVE_ARCHIVE_NAMESPACE, OBJECTIVE_NAMESPACE
from asdl_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from brmem.gateway import BranchMemoryGateway, EntryRef, check_branch_name
from brmem.validation import first_failure


@dataclass(frozen=True)
class ObjectiveShowRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None
    branch: str | None = None


@dataclass(frozen=True)
class ObjectiveFile:
    filename: str
    source_branch: str
    content: str


@dataclass(frozen=True)
class ObjectiveShowResult(JsonSerializable):
    slug: str
    canonical_present: bool
    canonical_trunk: str
    state: ObjectiveState
    closed_at: str | None
    closed_reason: str | None
    branches: tuple[BranchPresence, ...]
    files: tuple[str, ...]
    body: ObjectiveFile | None
    roadmap: ObjectiveFile | None
    notes: ObjectiveFile | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "canonical_present": self.canonical_present,
            "canonical_trunk": self.canonical_trunk,
            "state": self.state,
            "closed_at": self.closed_at,
            "closed_reason": self.closed_reason,
            "branches": [{"branch": bp.branch, "deleted": bp.deleted} for bp in self.branches],
            "files": list(self.files),
            "body": _file_to_json(self.body),
            "roadmap": _file_to_json(self.roadmap),
            "notes": _file_to_json(self.notes),
        }


def _file_to_json(file: ObjectiveFile | None) -> dict[str, str] | None:
    if file is None:
        return None
    return {"source_branch": file.source_branch, "content": file.content}


def render_objective_show(result: ObjectiveShowResult) -> None:
    click.echo(f"slug: {result.slug}")
    canonical_str = f"present ({result.canonical_trunk})" if result.canonical_present else "absent"
    click.echo(f"canonical: {canonical_str}")
    state_line = f"state: {result.state}"
    if result.state == "closed" and result.closed_at is not None:
        state_line = f"{state_line} (closed_at={result.closed_at}"
        if result.closed_reason is not None:
            state_line = f"{state_line}, reason={result.closed_reason!r}"
        state_line = f"{state_line})"
    click.echo(state_line)
    if result.branches:
        click.echo("branches:")
        for bp in result.branches:
            marker = " [deleted]" if bp.deleted else ""
            click.echo(f"  - {bp.branch}{marker}")
    else:
        click.echo("branches: (none)")
    if result.files:
        click.echo("files:")
        for path in result.files:
            click.echo(f"  - {path}")

    console = get_console()
    for file in (result.body, result.roadmap, result.notes):
        if file is None:
            continue
        console.print()
        console.rule(_format_file_header(file, trunk_branch=result.canonical_trunk))
        console.print(Markdown(file.content))


def _format_file_header(file: ObjectiveFile, *, trunk_branch: str) -> str:
    """Label each file with its source so the mixed-fallback view is unambiguous.

    Without ``--branch``, ``objective show`` resolves each file
    independently (current branch first, canonical trunk fallback), so a
    single render may combine sources. The label distinguishes canonical
    storage from a branch snapshot in both human and JSON callers, matching
    the documented "Effective view" boundary in
    ``packages/asdl-objectives/AGENTS.md``.
    """
    if file.source_branch == trunk_branch:
        source = f"canonical: {trunk_branch}"
    else:
        source = f"branch: {file.source_branch}"
    return f"{file.filename} ({source})"


def _read_file(
    gateway: BranchMemoryGateway,
    slug: str,
    filename: str,
    *,
    current_branch: str | None,
    canonical_present: bool,
    requested_branch: str | None,
    trunk_branch: str,
    namespace: str,
) -> ObjectiveFile | None:
    key = f"{slug}/{filename}"
    if requested_branch is not None:
        content = gateway.get(namespace, key, requested_branch)
        if content is None:
            return None
        return ObjectiveFile(filename=filename, source_branch=requested_branch, content=content)
    if current_branch is not None and current_branch != trunk_branch:
        content = gateway.get(namespace, key, current_branch)
        if content is not None:
            return ObjectiveFile(filename=filename, source_branch=current_branch, content=content)
    if canonical_present:
        content = gateway.get(namespace, key, trunk_branch)
        if content is not None:
            return ObjectiveFile(filename=filename, source_branch=trunk_branch, content=content)
    return None


def _slug_entries(entries: list[EntryRef], slug: str) -> list[EntryRef]:
    prefix = f"{slug}/"
    return [e for e in entries if e.key.startswith(prefix)]


@clinkr_operation(
    name="show",
    help=(
        "Summarize where a objective currently exists: whether the "
        "canonical objective is present and which branches carry a "
        "snapshot. If SLUG is omitted and exactly one objective is "
        "attached to the current branch, it is selected automatically. "
        "Pass --branch <name> to render file content strictly from that "
        "branch's snapshot (no canonical fallback) and to auto-resolve "
        "SLUG from <name> instead of HEAD."
    ),
    human_renderer=render_objective_show,
)
def run_show_objective(
    ctx: click.Context,
    request: ObjectiveShowRequest,
) -> ClinkrExit[ObjectiveShowResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git_gateway = mctx.git_gateway

    validation_failure = first_failure(
        (
            "invalid_branch_name",
            None if request.branch is None else check_branch_name(request.branch),
        ),
    )
    error_type, message = validation_failure or ("", "")
    Ensure.true(
        validation_failure is None,
        error_type=error_type,
        message=message,
    )

    match resolve_slug(mctx, request.slug, requested_branch=request.branch):
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case NoObjectiveOnBranch() as missing:
            raise ClinkrFailure(
                error_type="no_objective_on_branch",
                message=f"No objective on branch {missing.branch!r}.",
            )
        case AmbiguousObjective() as ambiguity:
            names = ", ".join(ambiguity.slugs)
            raise ClinkrFailure(
                error_type="ambiguous_objective",
                message=(
                    f"Multiple objectives on branch {ambiguity.branch!r}: {names}. Specify a SLUG."
                ),
            )
        case SlugResolution() as resolution:
            requested_slug = resolution.slug
            current_branch = resolution.current_branch

    trunk_branch = git_gateway.get_trunk_branch()
    active_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    slug_entries = _slug_entries(active_entries, requested_slug)
    namespace = OBJECTIVE_NAMESPACE
    if not slug_entries:
        archive_entries = gateway.list_entries(namespace=OBJECTIVE_ARCHIVE_NAMESPACE)
        slug_entries = _slug_entries(archive_entries, requested_slug)
        namespace = OBJECTIVE_ARCHIVE_NAMESPACE
    if not slug_entries:
        empty = ObjectiveShowResult(
            slug=requested_slug,
            canonical_present=False,
            canonical_trunk=trunk_branch,
            state="open",
            closed_at=None,
            closed_reason=None,
            branches=(),
            files=(),
            body=None,
            roadmap=None,
            notes=None,
        )
        raise ClinkrExit.negative(
            empty,
            message=f"No objective found for slug {requested_slug!r}.",
        )

    files = tuple(sorted({e.key[len(requested_slug) + 1 :] for e in slug_entries}))
    canonical_present = any(
        e.branch == trunk_branch and e.key != closed_key(requested_slug) for e in slug_entries
    )
    closed_present = any(
        e.branch == trunk_branch and e.key == closed_key(requested_slug) for e in slug_entries
    )
    state: ObjectiveState = "closed" if namespace == OBJECTIVE_ARCHIVE_NAMESPACE else "open"
    closed_marker: ClosedMarker = (
        load_closed_marker(
            gateway,
            slug=requested_slug,
            trunk_branch=trunk_branch,
            namespace=OBJECTIVE_ARCHIVE_NAMESPACE,
        )
        if state == "closed" and closed_present
        else ClosedMarker(present=False, closed_at=None, reason=None, diagnostics=())
    )
    branch_names = sorted({e.branch for e in slug_entries if e.branch != trunk_branch})
    branches = tuple(
        BranchPresence(branch=name, deleted=not git_gateway.branch_exists(name))
        for name in branch_names
    )
    body = _read_file(
        gateway,
        requested_slug,
        BODY_FILE,
        current_branch=current_branch,
        canonical_present=canonical_present,
        requested_branch=request.branch,
        trunk_branch=trunk_branch,
        namespace=namespace,
    )
    roadmap = _read_file(
        gateway,
        requested_slug,
        ROADMAP_FILE,
        current_branch=current_branch,
        canonical_present=canonical_present,
        requested_branch=request.branch,
        trunk_branch=trunk_branch,
        namespace=namespace,
    )
    notes = _read_file(
        gateway,
        requested_slug,
        NOTES_FILE,
        current_branch=current_branch,
        canonical_present=canonical_present,
        requested_branch=request.branch,
        trunk_branch=trunk_branch,
        namespace=namespace,
    )

    return ClinkrExit.ok(
        ObjectiveShowResult(
            slug=requested_slug,
            canonical_present=canonical_present,
            canonical_trunk=trunk_branch,
            state=state,
            closed_at=closed_marker.closed_at,
            closed_reason=closed_marker.reason,
            branches=branches,
            files=files,
            body=body,
            roadmap=roadmap,
            notes=notes,
        )
    )
