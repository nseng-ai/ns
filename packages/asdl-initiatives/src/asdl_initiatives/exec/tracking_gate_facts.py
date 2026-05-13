"""``initiative exec tracking-gate-facts`` changed-path fact collector."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure, GitPathChange
from asdl_initiatives.context import InitiativeCliContext
from asdl_initiatives.exec.inventory import relative_record_path, relative_root_path

TrackingGateStatus = Literal["ok", "missing_base_ref", "invalid_selection"]
BranchFactStatus = Literal["branch", "detached", "failure"]
ChangeBucket = Literal["selected_initiative", "other_initiatives", "non_initiative"]
ChangeSource = Literal["working_tree", "index", "committed"]


@dataclass(frozen=True)
class NormalizedInitiativeSelection:
    slug: str
    path: str


@dataclass(frozen=True)
class InvalidInitiativeSelection:
    reason: str


@dataclass(frozen=True)
class ChangeClassification:
    bucket: ChangeBucket
    initiative_slugs: tuple[str, ...]


class TrackingGateFactsRequest(ClinkrModel):
    slug_or_path: Annotated[
        str,
        click.Argument(["slug_or_path"], type=click.STRING),
    ]
    base_ref: Annotated[
        str | None,
        click.Option(["--base-ref"], type=click.STRING, required=False, default=None),
    ] = None


class InitiativeSelectionFacts(ClinkrModel):
    input: str
    slug: str
    path: str
    exists: bool
    closed: bool


class CurrentBranchFacts(ClinkrModel):
    status: BranchFactStatus
    name: str | None
    error: str | None
    returncode: int | None


class TrackingGateChange(ClinkrModel):
    status: str
    path: str
    old_path: str | None = None
    initiative_slugs: tuple[str, ...]


class TrackingGateChangeSet(ClinkrModel):
    working_tree: tuple[TrackingGateChange, ...]
    index: tuple[TrackingGateChange, ...]
    committed: tuple[TrackingGateChange, ...]


class TrackingGateBuckets(ClinkrModel):
    selected_initiative: TrackingGateChangeSet
    other_initiatives: TrackingGateChangeSet
    non_initiative: TrackingGateChangeSet


class TrackingGateFactsResult(ClinkrModel):
    status: TrackingGateStatus
    error: str | None
    root_path: str
    root_exists: bool
    selected: InitiativeSelectionFacts | None
    base_ref: str | None
    current_branch: CurrentBranchFacts | None
    buckets: TrackingGateBuckets


def render_tracking_gate_facts(result: TrackingGateFactsResult) -> None:
    click.echo("# Initiative Tracking Gate Facts")
    click.echo()

    if result.selected is None:
        click.echo("Selected Initiative: _none_")
    else:
        presence = "present" if result.selected.exists else "missing"
        state = "closed" if result.selected.closed else "open"
        click.echo(
            f"Selected Initiative: `{result.selected.slug}` "
            f"(`{result.selected.path}`, {presence}, {state})"
        )
    click.echo(f"Base ref: `{result.base_ref or 'missing'}`")
    click.echo(f"Current branch: {_render_branch(result.current_branch)}")
    click.echo()

    click.echo("## Counts")
    click.echo()
    click.echo("| bucket | working tree | index | committed |")
    click.echo("| --- | ---: | ---: | ---: |")
    for bucket_name, change_set in _bucket_rows(result.buckets):
        click.echo(
            "| "
            f"{bucket_name} | "
            f"{len(change_set.working_tree)} | "
            f"{len(change_set.index)} | "
            f"{len(change_set.committed)} |"
        )
    click.echo()

    rows = tuple(_path_evidence_rows(result.buckets))
    if not rows:
        click.echo("_No path evidence found._")
        return

    click.echo("## Path Evidence")
    click.echo()
    click.echo("| source | bucket | status | path | old path | initiatives |")
    click.echo("| --- | --- | --- | --- | --- | --- |")
    for source, bucket, change in rows:
        click.echo(
            "| "
            f"{source} | "
            f"{bucket} | "
            f"{change.status} | "
            f"`{change.path}` | "
            f"{_render_optional_path(change.old_path)} | "
            f"{_render_initiative_slugs(change.initiative_slugs)} |"
        )


@clinkr_operation(
    name="tracking-gate-facts",
    help="Collect changed-path facts for an Initiative tracking gate.",
    human_renderer=render_tracking_gate_facts,
)
def run_tracking_gate_facts(
    ctx: click.Context,
    request: TrackingGateFactsRequest,
) -> ClinkrExit[TrackingGateFactsResult]:
    cwd = Path.cwd()
    base_ref = _clean_base_ref(request.base_ref)
    if base_ref is None:
        raise ClinkrExit.negative(
            _empty_result(
                status="missing_base_ref",
                error="missing_base_ref",
                base_ref=None,
                cwd=cwd,
            ),
            message="Missing base ref. Pass --base-ref <ref>.",
        )

    selection = normalize_initiative_selection(request.slug_or_path)
    if isinstance(selection, InvalidInitiativeSelection):
        raise ClinkrExit.negative(
            _empty_result(
                status="invalid_selection",
                error="invalid_selection",
                base_ref=base_ref,
                cwd=cwd,
            ),
            message=(
                f"Invalid Initiative selection {request.slug_or_path!r}. "
                "Pass a slug or path under .asdl/initiatives/<slug>/."
            ),
        )

    typed_context = load_typed_context(ctx, InitiativeCliContext)
    selected = _build_selection_facts(request.slug_or_path, selection, cwd)
    current_branch = _build_current_branch_facts(typed_context, cwd)
    buckets = _build_buckets(
        selected.slug,
        working_tree=_require_git_changes(typed_context.git_gateway.list_working_tree_changes(cwd)),
        index=_require_git_changes(typed_context.git_gateway.list_index_changes(cwd)),
        committed=_require_git_changes(typed_context.git_gateway.list_range_changes(cwd, base_ref)),
    )
    return ClinkrExit.ok(
        TrackingGateFactsResult(
            status="ok",
            error=None,
            root_path=relative_root_path().as_posix(),
            root_exists=(cwd / relative_root_path()).exists(),
            selected=selected,
            base_ref=base_ref,
            current_branch=current_branch,
            buckets=buckets,
        )
    )


def normalize_initiative_selection(
    slug_or_path: str,
) -> NormalizedInitiativeSelection | InvalidInitiativeSelection:
    if not slug_or_path or "\\" in slug_or_path:
        return InvalidInitiativeSelection(reason="invalid_selection")

    path = PurePosixPath(slug_or_path)
    if path.is_absolute():
        return InvalidInitiativeSelection(reason="invalid_selection")

    parts = path.parts
    if ".." in parts:
        return InvalidInitiativeSelection(reason="invalid_selection")

    if len(parts) == 1:
        slug = parts[0]
        if _is_valid_slug(slug):
            return NormalizedInitiativeSelection(
                slug=slug,
                path=relative_record_path(slug).as_posix(),
            )
        return InvalidInitiativeSelection(reason="invalid_selection")

    root_parts = relative_root_path().parts
    if len(parts) >= 3 and parts[:2] == root_parts:
        slug = parts[2]
        if _is_valid_slug(slug):
            return NormalizedInitiativeSelection(
                slug=slug,
                path=relative_record_path(slug).as_posix(),
            )

    return InvalidInitiativeSelection(reason="invalid_selection")


def classify_git_path_change(change: GitPathChange, selected_slug: str) -> ChangeClassification:
    initiative_slugs = _initiative_slugs_for_change(change)
    if selected_slug in initiative_slugs:
        return ChangeClassification(
            bucket="selected_initiative",
            initiative_slugs=initiative_slugs,
        )
    if initiative_slugs:
        return ChangeClassification(bucket="other_initiatives", initiative_slugs=initiative_slugs)
    return ChangeClassification(bucket="non_initiative", initiative_slugs=())


def _clean_base_ref(base_ref: str | None) -> str | None:
    if base_ref is None:
        return None
    cleaned = base_ref.strip()
    if not cleaned:
        return None
    return cleaned


def _empty_result(
    *,
    status: TrackingGateStatus,
    error: str,
    base_ref: str | None,
    cwd: Path,
) -> TrackingGateFactsResult:
    return TrackingGateFactsResult(
        status=status,
        error=error,
        root_path=relative_root_path().as_posix(),
        root_exists=(cwd / relative_root_path()).exists(),
        selected=None,
        base_ref=base_ref,
        current_branch=None,
        buckets=_empty_buckets(),
    )


def _build_selection_facts(
    raw_input: str,
    selection: NormalizedInitiativeSelection,
    cwd: Path,
) -> InitiativeSelectionFacts:
    absolute_path = cwd / selection.path
    return InitiativeSelectionFacts(
        input=raw_input,
        slug=selection.slug,
        path=selection.path,
        exists=absolute_path.is_dir(),
        closed=(absolute_path / "closed.md").is_file(),
    )


def _build_current_branch_facts(
    context: InitiativeCliContext,
    cwd: Path,
) -> CurrentBranchFacts:
    current = context.git_gateway.get_current_branch(cwd)
    if isinstance(current, str):
        return CurrentBranchFacts(status="branch", name=current, error=None, returncode=None)
    if isinstance(current, DetachedHead):
        return CurrentBranchFacts(status="detached", name=None, error=None, returncode=None)
    return CurrentBranchFacts(
        status="failure",
        name=None,
        error=current.message,
        returncode=current.returncode,
    )


def _require_git_changes(
    changes: tuple[GitPathChange, ...] | GitCommandFailure,
) -> tuple[GitPathChange, ...]:
    if isinstance(changes, GitCommandFailure):
        raise ClinkrExit.failure(error_type=changes.error_type, message=changes.message)
    return changes


def _build_buckets(
    selected_slug: str,
    *,
    working_tree: tuple[GitPathChange, ...],
    index: tuple[GitPathChange, ...],
    committed: tuple[GitPathChange, ...],
) -> TrackingGateBuckets:
    bucketed: dict[ChangeBucket, dict[ChangeSource, list[TrackingGateChange]]] = {
        "selected_initiative": {"working_tree": [], "index": [], "committed": []},
        "other_initiatives": {"working_tree": [], "index": [], "committed": []},
        "non_initiative": {"working_tree": [], "index": [], "committed": []},
    }
    _append_classified_changes(bucketed, selected_slug, "working_tree", working_tree)
    _append_classified_changes(bucketed, selected_slug, "index", index)
    _append_classified_changes(bucketed, selected_slug, "committed", committed)
    return TrackingGateBuckets(
        selected_initiative=_change_set(bucketed["selected_initiative"]),
        other_initiatives=_change_set(bucketed["other_initiatives"]),
        non_initiative=_change_set(bucketed["non_initiative"]),
    )


def _append_classified_changes(
    bucketed: dict[ChangeBucket, dict[ChangeSource, list[TrackingGateChange]]],
    selected_slug: str,
    source: ChangeSource,
    changes: tuple[GitPathChange, ...],
) -> None:
    for change in changes:
        classification = classify_git_path_change(change, selected_slug)
        bucketed[classification.bucket][source].append(
            TrackingGateChange(
                status=change.status,
                path=change.path,
                old_path=change.old_path,
                initiative_slugs=classification.initiative_slugs,
            )
        )


def _change_set(
    changes: dict[ChangeSource, list[TrackingGateChange]],
) -> TrackingGateChangeSet:
    return TrackingGateChangeSet(
        working_tree=tuple(changes["working_tree"]),
        index=tuple(changes["index"]),
        committed=tuple(changes["committed"]),
    )


def _empty_buckets() -> TrackingGateBuckets:
    empty = TrackingGateChangeSet(working_tree=(), index=(), committed=())
    return TrackingGateBuckets(
        selected_initiative=empty,
        other_initiatives=empty,
        non_initiative=empty,
    )


def _is_valid_slug(slug: str) -> bool:
    return slug not in {"", ".", ".."} and "/" not in slug and "\\" not in slug


def _initiative_slugs_for_change(change: GitPathChange) -> tuple[str, ...]:
    slugs: list[str] = []
    for path in (change.path, change.old_path):
        if path is None:
            continue
        slug = _initiative_slug_for_path(path)
        if slug is not None and slug not in slugs:
            slugs.append(slug)
    return tuple(slugs)


def _initiative_slug_for_path(path_text: str) -> str | None:
    path = PurePosixPath(path_text)
    if path.is_absolute():
        return None
    parts = path.parts
    if ".." in parts:
        return None
    root_parts = relative_root_path().parts
    if len(parts) < 4 or parts[:2] != root_parts:
        return None
    slug = parts[2]
    if not _is_valid_slug(slug):
        return None
    return slug


def _bucket_rows(
    buckets: TrackingGateBuckets,
) -> tuple[tuple[ChangeBucket, TrackingGateChangeSet], ...]:
    return (
        ("selected_initiative", buckets.selected_initiative),
        ("other_initiatives", buckets.other_initiatives),
        ("non_initiative", buckets.non_initiative),
    )


def _path_evidence_rows(
    buckets: TrackingGateBuckets,
) -> tuple[tuple[ChangeSource, ChangeBucket, TrackingGateChange], ...]:
    rows: list[tuple[ChangeSource, ChangeBucket, TrackingGateChange]] = []
    for bucket_name, change_set in _bucket_rows(buckets):
        for source, changes in (
            ("working_tree", change_set.working_tree),
            ("index", change_set.index),
            ("committed", change_set.committed),
        ):
            for change in changes:
                rows.append((source, bucket_name, change))
    return tuple(rows)


def _render_branch(branch: CurrentBranchFacts | None) -> str:
    if branch is None:
        return "not checked"
    if branch.status == "branch" and branch.name is not None:
        return f"`{branch.name}`"
    if branch.status == "detached":
        return "detached HEAD"
    return f"failure ({branch.error or 'unknown error'})"


def _render_optional_path(path: str | None) -> str:
    if path is None:
        return "—"
    return f"`{path}`"


def _render_initiative_slugs(slugs: tuple[str, ...]) -> str:
    if not slugs:
        return "—"
    return ", ".join(f"`{slug}`" for slug in slugs)
