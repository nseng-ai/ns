"""Present-state summary for a single objective slug."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click
from rich.markdown import Markdown

from brmem.gateway import BranchMemoryGateway, EntryRef, check_branch_name
from brmem.validation import first_failure
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.console import get_console
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import (
    BODY_FILE,
    NOTES_FILE,
    ROADMAP_FILE,
    BranchPresence,
)
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)


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
    ``packages/twerk-objectives/AGENTS.md``.
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
) -> ObjectiveFile | None:
    key = f"{slug}/{filename}"
    if requested_branch is not None:
        content = gateway.get(OBJECTIVE_NAMESPACE, key, requested_branch)
        if content is None:
            return None
        return ObjectiveFile(filename=filename, source_branch=requested_branch, content=content)
    if current_branch is not None and current_branch != trunk_branch:
        content = gateway.get(OBJECTIVE_NAMESPACE, key, current_branch)
        if content is not None:
            return ObjectiveFile(filename=filename, source_branch=current_branch, content=content)
    if canonical_present:
        content = gateway.get(OBJECTIVE_NAMESPACE, key, trunk_branch)
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
    if validation_failure is not None:
        error_type, message = validation_failure
        raise ClinkrExit.failure(error_type=error_type, message=message)

    resolution = resolve_slug(mctx, request.slug, requested_branch=request.branch)
    match resolution:
        case GitCommandFailure() as failure:
            raise ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case NoObjectiveOnBranch(branch=branch):
            raise ClinkrExit.failure(
                error_type="no_objective_on_branch",
                message=f"No objective on branch {branch!r}.",
            )
        case AmbiguousObjective(branch=branch, slugs=slugs):
            names = ", ".join(slugs)
            raise ClinkrExit.failure(
                error_type="ambiguous_objective",
                message=f"Multiple objectives on branch {branch!r}: {names}. Specify a SLUG.",
            )
        case SlugResolution(slug=requested_slug, current_branch=current_branch):
            pass

    trunk_branch = git_gateway.get_trunk_branch()
    all_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    slug_entries = _slug_entries(all_entries, requested_slug)
    if not slug_entries:
        empty = ObjectiveShowResult(
            slug=requested_slug,
            canonical_present=False,
            canonical_trunk=trunk_branch,
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
    canonical_present = any(e.branch == trunk_branch for e in slug_entries)
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
    )
    roadmap = _read_file(
        gateway,
        requested_slug,
        ROADMAP_FILE,
        current_branch=current_branch,
        canonical_present=canonical_present,
        requested_branch=request.branch,
        trunk_branch=trunk_branch,
    )
    notes = _read_file(
        gateway,
        requested_slug,
        NOTES_FILE,
        current_branch=current_branch,
        canonical_present=canonical_present,
        requested_branch=request.branch,
        trunk_branch=trunk_branch,
    )

    return ClinkrExit.ok(
        ObjectiveShowResult(
            slug=requested_slug,
            canonical_present=canonical_present,
            canonical_trunk=trunk_branch,
            branches=branches,
            files=files,
            body=body,
            roadmap=roadmap,
            notes=notes,
        )
    )
