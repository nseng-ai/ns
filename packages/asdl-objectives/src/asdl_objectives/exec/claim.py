"""``objective exec claim`` — attach an objective snapshot to a branch.

The command is intentionally narrow: it resolves a slug and a source snapshot,
then writes the selected objective directory into the target branch's brmem
snapshot. It never edits objective prose, mutates canonical state, merges work,
or synthesizes companion files. Ambiguity is returned as structured
``needs_selection`` output so the driving skill can ask the user instead of
silently choosing among valid claims.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import BODY_FILE, body_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import (
    BranchMemoryGateway,
    BrmemCopyConflictError,
    EntryRef,
    snapshot_ref_name,
)

CLAIM_SCHEMA = "claim/v1"

ClaimStatus = Literal["claimed", "needs_selection", "blocked"]
ClaimSourceKind = Literal["branch", "local_file"]
SelectionKind = Literal["slug", "source_branch"]
BlockReason = Literal[
    "no_objective_available",
    "explicit_slug_not_found",
    "target_collision",
    "from_missing_slug",
]


@dataclass(frozen=True)
class ClaimRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None
    target: Annotated[
        str | None,
        click.Option(
            ["--target"],
            type=click.STRING,
            default=None,
            help="Destination branch; defaults to the current branch.",
        ),
    ] = None
    from_branch: Annotated[
        str | None,
        click.Option(
            ["--from"],
            type=click.STRING,
            default=None,
            help="Explicit source branch carrying <slug>/body.md.",
        ),
    ] = None
    from_file: Annotated[
        Path | None,
        click.Option(
            ["--from-file"],
            type=click.Path(path_type=Path),
            default=None,
            help="Bootstrap <slug>/body.md from a local UTF-8 file.",
        ),
    ] = None


@dataclass(frozen=True)
class ClaimSource:
    kind: ClaimSourceKind
    branch: str | None
    from_file_path: str | None
    label: str


@dataclass(frozen=True)
class ResolvedClaim:
    slug: str
    target_branch: str
    source: ClaimSource


@dataclass(frozen=True)
class CarriedFile(JsonSerializable):
    file: str
    key: str


@dataclass(frozen=True)
class ClaimApplyResult(JsonSerializable):
    files_carried: tuple[CarriedFile, ...]
    destination_ref: str
    destination_commit_sha: str


@dataclass(frozen=True)
class ClaimedResult(JsonSerializable):
    slug: str
    target_branch: str
    source_kind: ClaimSourceKind
    source_branch: str | None
    source_label: str
    files_carried: tuple[CarriedFile, ...]
    destination_ref: str
    destination_commit_sha: str


@dataclass(frozen=True)
class SelectionOption(JsonSerializable):
    label: str
    value: str
    description: str
    rerun_args: tuple[str, ...]


@dataclass(frozen=True)
class ClaimSelection(JsonSerializable):
    kind: SelectionKind
    prompt: str
    options: tuple[SelectionOption, ...]


@dataclass(frozen=True)
class ClaimBlock(JsonSerializable):
    reason: BlockReason
    message: str


@dataclass(frozen=True)
class ClaimOutput(JsonSerializable):
    schema: str
    status: ClaimStatus
    message: str
    result: ClaimedResult | None
    selection: ClaimSelection | None
    block: ClaimBlock | None

    @classmethod
    def json_schema(cls) -> dict[str, object]:
        return {
            "type": "object",
            "properties": {
                "schema": {"type": "string", "enum": [CLAIM_SCHEMA]},
                "status": {
                    "type": "string",
                    "enum": ["claimed", "needs_selection", "blocked"],
                },
                "message": {"type": "string"},
                "result": {"type": ["object", "null"]},
                "selection": {"type": ["object", "null"]},
                "block": {"type": ["object", "null"]},
            },
            "required": ["block", "message", "result", "schema", "selection", "status"],
        }


@dataclass(frozen=True)
class _AncestorObjectiveBranch:
    branch: str
    distance: int
    slugs: tuple[str, ...]


@dataclass(frozen=True)
class _SourceCandidate:
    branch: str
    distance: int


def render_claim(result: ClaimOutput) -> None:
    click.echo(result.message)


@clinkr_operation(
    name="claim",
    help=(
        "Attach one objective snapshot to a target branch. SLUG may be omitted "
        "when the command can infer a single reachable objective. Snapshot "
        "claims copy <slug>/* from --from, a nearest ancestor, or canonical "
        "trunk; --from-file bootstraps only <slug>/body.md. Ambiguous choices "
        "return status='needs_selection'; blocked preconditions return "
        "status='blocked'; invalid flags, detached HEAD target resolution, git "
        "failures, and apply-time drift exit non-zero."
    ),
    human_renderer=render_claim,
)
def run_claim_objective(
    ctx: click.Context,
    request: ClaimRequest,
) -> ClinkrExit[ClaimOutput]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    git = mctx.git_gateway
    gateway = mctx.brmem_gateway

    explicit_slug = _normalize_slug(request.slug)
    _validate_source_flags(request, explicit_slug)

    trunk_branch = resolve_trunk(git).trunk
    target_branch = _resolve_target_branch(git, request.target)
    if target_branch == trunk_branch:
        raise ClinkrFailure(
            error_type="target_is_trunk",
            message=(
                f"Cannot claim an objective onto trunk branch {trunk_branch!r}. "
                "Canonical objective state already lives there."
            ),
        )

    slug_or_output = _resolve_slug_for_claim(
        gateway,
        git,
        explicit_slug=explicit_slug,
        target_branch=target_branch,
        requested_target=request.target,
        trunk_branch=trunk_branch,
    )
    if isinstance(slug_or_output, ClaimOutput):
        return ClinkrExit.ok(slug_or_output)
    slug = slug_or_output

    target_entries = _entries_for_slug(gateway, branch=target_branch, slug=slug)
    if target_entries:
        return ClinkrExit.ok(_blocked_target_collision(slug, target_branch, target_entries))

    source_or_output = _resolve_source(
        gateway,
        git,
        request,
        slug=slug,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
    )
    if isinstance(source_or_output, ClaimOutput):
        return ClinkrExit.ok(source_or_output)

    claim = ResolvedClaim(slug=slug, target_branch=target_branch, source=source_or_output)
    applied = apply_claim(mctx, claim)
    result = ClaimedResult(
        slug=slug,
        target_branch=target_branch,
        source_kind=claim.source.kind,
        source_branch=claim.source.branch,
        source_label=claim.source.label,
        files_carried=applied.files_carried,
        destination_ref=applied.destination_ref,
        destination_commit_sha=applied.destination_commit_sha,
    )
    return ClinkrExit.ok(
        ClaimOutput(
            schema=CLAIM_SCHEMA,
            status="claimed",
            message=_claimed_message(result, trunk_branch=trunk_branch),
            result=result,
            selection=None,
            block=None,
        )
    )


def apply_claim(ctx: ObjectiveCliContext, claim: ResolvedClaim) -> ClaimApplyResult:
    """Apply a resolved claim, raising hard failures on apply-time drift."""
    gateway = ctx.brmem_gateway
    target_entries = _entries_for_slug(gateway, branch=claim.target_branch, slug=claim.slug)
    if target_entries:
        raise ClinkrFailure(
            error_type="target_collision",
            message=_target_collision_message(claim.slug, claim.target_branch, target_entries),
        )

    if claim.source.kind == "local_file":
        return _apply_from_file(gateway, claim)

    if claim.source.branch is None:
        raise ClinkrFailure(
            error_type="source_missing_slug",
            message=f"Source branch is missing for snapshot claim of {claim.slug!r}.",
        )

    if gateway.get(OBJECTIVE_NAMESPACE, body_key(claim.slug), claim.source.branch) is None:
        raise ClinkrFailure(
            error_type="source_missing_slug",
            message=(
                f"Source branch {claim.source.branch!r} no longer carries "
                f"{body_key(claim.slug)!r}. Re-run objective exec claim to refresh the plan."
            ),
        )

    try:
        copied = gateway.copy_entries(
            namespace=OBJECTIVE_NAMESPACE,
            from_branch=claim.source.branch,
            to_branch=claim.target_branch,
            overwrite=False,
            key_glob=f"{claim.slug}/*",
        )
    except BrmemCopyConflictError as exc:
        raise ClinkrFailure(
            error_type="target_collision",
            message=_target_collision_message(claim.slug, claim.target_branch, exc.conflicts),
        ) from exc

    files_carried = tuple(_carried_file(entry.key, claim.slug) for entry in copied)
    destination_commit_sha = _destination_commit_sha(
        gateway,
        branch=claim.target_branch,
        files_carried=files_carried,
    )
    return ClaimApplyResult(
        files_carried=files_carried,
        destination_ref=snapshot_ref_name(OBJECTIVE_NAMESPACE, claim.target_branch),
        destination_commit_sha=destination_commit_sha,
    )


def _apply_from_file(gateway: BranchMemoryGateway, claim: ResolvedClaim) -> ClaimApplyResult:
    if claim.source.from_file_path is None:
        raise ClinkrFailure(
            error_type="from_file_unreadable",
            message="--from-file claim source did not include a path.",
        )

    content = _read_utf8_file_or_fail(Path(claim.source.from_file_path))
    key = body_key(claim.slug)
    commit_sha = gateway.put(OBJECTIVE_NAMESPACE, key, claim.target_branch, content)
    return ClaimApplyResult(
        files_carried=(CarriedFile(file=BODY_FILE, key=key),),
        destination_ref=snapshot_ref_name(OBJECTIVE_NAMESPACE, claim.target_branch),
        destination_commit_sha=commit_sha,
    )


def _validate_source_flags(request: ClaimRequest, explicit_slug: str | None) -> None:
    if request.from_branch is not None and request.from_file is not None:
        raise ClinkrFailure(
            error_type="conflicting_source_flags",
            message="--from and --from-file are mutually exclusive.",
        )
    if explicit_slug is None and (request.from_branch is not None or request.from_file is not None):
        raise ClinkrFailure(
            error_type="source_flag_without_slug",
            message="--from and --from-file require an explicit SLUG argument.",
        )


def _resolve_target_branch(git: GitGateway, requested_target: str | None) -> str:
    if requested_target is not None:
        return requested_target

    branch = git.get_current_branch(Path.cwd())
    if isinstance(branch, DetachedHead):
        raise ClinkrFailure(
            error_type="detached_head",
            message="Detached HEAD: objective exec claim needs --target or a checked-out branch.",
        )
    if isinstance(branch, GitCommandFailure):
        raise ClinkrFailure(error_type=branch.error_type, message=branch.message)
    return branch


def _resolve_slug_for_claim(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    *,
    explicit_slug: str | None,
    target_branch: str,
    requested_target: str | None,
    trunk_branch: str,
) -> str | ClaimOutput:
    del target_branch  # Target is resolved before slug selection but does not affect ranking.
    if explicit_slug is not None:
        return explicit_slug

    ancestor = _nearest_ancestor_objective_branch(gateway, git, trunk_branch=trunk_branch)
    if ancestor is not None:
        if len(ancestor.slugs) == 1:
            return ancestor.slugs[0]
        return _selection_output(
            kind="slug",
            prompt="Multiple objectives are reachable. Choose one to claim:",
            options=tuple(
                SelectionOption(
                    label=slug,
                    value=slug,
                    description=(
                        f"Claim objective {slug!r} from reachable branch {ancestor.branch!r}."
                    ),
                    rerun_args=_slug_rerun_args(slug, requested_target=requested_target),
                )
                for slug in ancestor.slugs
            ),
        )

    canonical_slugs = _slugs_on_branch(gateway, trunk_branch)
    if len(canonical_slugs) == 1:
        return canonical_slugs[0]
    if len(canonical_slugs) > 1:
        return _selection_output(
            kind="slug",
            prompt="Multiple canonical objectives are available. Choose one to claim:",
            options=tuple(
                SelectionOption(
                    label=slug,
                    value=slug,
                    description=f"Claim canonical objective {slug!r}.",
                    rerun_args=_slug_rerun_args(slug, requested_target=requested_target),
                )
                for slug in canonical_slugs
            ),
        )

    return _blocked(
        reason="no_objective_available",
        message=(
            "Cannot claim objective: no reachable ancestor branch or canonical trunk snapshot "
            "carries an objective. Supply a SLUG with --from-file to bootstrap one."
        ),
    )


def _resolve_source(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    request: ClaimRequest,
    *,
    slug: str,
    target_branch: str,
    trunk_branch: str,
) -> ClaimSource | ClaimOutput:
    if request.from_file is not None:
        return ClaimSource(
            kind="local_file",
            branch=None,
            from_file_path=str(request.from_file),
            label=f"local file {request.from_file} (bootstrap body.md only)",
        )

    if request.from_branch is not None:
        if gateway.get(OBJECTIVE_NAMESPACE, body_key(slug), request.from_branch) is None:
            return _blocked(
                reason="from_missing_slug",
                message=(
                    f"Cannot claim objective {slug!r}: source branch "
                    f"{request.from_branch!r} does not carry {body_key(slug)!r}."
                ),
            )
        return ClaimSource(
            kind="branch",
            branch=request.from_branch,
            from_file_path=None,
            label=f"branch {request.from_branch} (explicit --from)",
        )

    candidates = _ancestor_source_candidates(
        gateway,
        git,
        slug=slug,
        trunk_branch=trunk_branch,
    )
    if candidates:
        nearest_distance = candidates[0].distance
        nearest = tuple(
            candidate for candidate in candidates if candidate.distance == nearest_distance
        )
        if len(nearest) > 1:
            return _selection_output(
                kind="source_branch",
                prompt="Multiple source branches are equally near. Choose one to claim from:",
                options=tuple(
                    SelectionOption(
                        label=candidate.branch,
                        value=candidate.branch,
                        description=(
                            f"Copy {slug!r} from ancestor branch {candidate.branch!r} "
                            f"({candidate.distance} commits behind HEAD)."
                        ),
                        rerun_args=_source_rerun_args(
                            slug,
                            requested_target=request.target,
                            source_branch=candidate.branch,
                        ),
                    )
                    for candidate in nearest
                ),
            )
        source_branch = nearest[0].branch
        return ClaimSource(
            kind="branch",
            branch=source_branch,
            from_file_path=None,
            label=f"ancestor branch {source_branch}",
        )

    if gateway.get(OBJECTIVE_NAMESPACE, body_key(slug), trunk_branch) is not None:
        return ClaimSource(
            kind="branch",
            branch=trunk_branch,
            from_file_path=None,
            label="canonical objective",
        )

    return _blocked(
        reason="explicit_slug_not_found",
        message=(
            f"Cannot claim objective {slug!r}: no ancestor branch or canonical trunk "
            f"snapshot carries {body_key(slug)!r}."
        ),
    )


def _nearest_ancestor_objective_branch(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    *,
    trunk_branch: str,
) -> _AncestorObjectiveBranch | None:
    candidates: list[_AncestorObjectiveBranch] = []
    for branch in _branches_with_objectives(gateway, exclude_branch=trunk_branch):
        if not git.is_ancestor(branch, "HEAD"):
            continue
        distance = _commit_distance_or_fail(git, branch)
        candidates.append(
            _AncestorObjectiveBranch(
                branch=branch,
                distance=distance,
                slugs=_slugs_on_branch(gateway, branch),
            )
        )
    if not candidates:
        return None
    candidates.sort(key=lambda candidate: (candidate.distance, candidate.branch))
    return candidates[0]


def _ancestor_source_candidates(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    *,
    slug: str,
    trunk_branch: str,
) -> tuple[_SourceCandidate, ...]:
    candidates: list[_SourceCandidate] = []
    for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, key=body_key(slug)):
        if entry.branch == trunk_branch:
            continue
        if not git.is_ancestor(entry.branch, "HEAD"):
            continue
        candidates.append(
            _SourceCandidate(
                branch=entry.branch,
                distance=_commit_distance_or_fail(git, entry.branch),
            )
        )
    candidates.sort(key=lambda candidate: (candidate.distance, candidate.branch))
    return tuple(candidates)


def _commit_distance_or_fail(git: GitGateway, branch: str) -> int:
    distance = git.count_commits_in_range(f"{branch}..HEAD")
    if isinstance(distance, GitCommandFailure):
        raise ClinkrFailure(error_type=distance.error_type, message=distance.message)
    return distance


def _branches_with_objectives(
    gateway: BranchMemoryGateway,
    *,
    exclude_branch: str,
) -> tuple[str, ...]:
    branches = {
        entry.branch
        for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
        if entry.branch != exclude_branch
    }
    return tuple(sorted(branches))


def _slugs_on_branch(gateway: BranchMemoryGateway, branch: str) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                slug_for_key(entry.key)
                for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
            }
        )
    )


def _entries_for_slug(
    gateway: BranchMemoryGateway,
    *,
    branch: str,
    slug: str,
) -> tuple[EntryRef, ...]:
    prefix = f"{slug}/"
    return tuple(
        entry
        for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
        if entry.key.startswith(prefix)
    )


def _destination_commit_sha(
    gateway: BranchMemoryGateway,
    *,
    branch: str,
    files_carried: tuple[CarriedFile, ...],
) -> str:
    if not files_carried:
        raise ClinkrFailure(
            error_type="source_missing_slug",
            message="Source snapshot had no entries to copy after apply-time re-check.",
        )
    diagnostic = gateway.check(OBJECTIVE_NAMESPACE, files_carried[0].key, branch)
    if diagnostic is None:
        raise ClinkrFailure(
            error_type="source_missing_slug",
            message="Destination snapshot is missing copied entries after apply.",
        )
    return diagnostic.head_sha


def _read_utf8_file_or_fail(path: Path) -> str:
    if not path.exists() or not path.is_file():
        raise ClinkrFailure(
            error_type="from_file_unreadable",
            message=f"--from-file is not readable: {path}: path does not exist or is not a file.",
        )
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ClinkrFailure(
            error_type="from_file_unreadable",
            message=f"--from-file is not readable: {path}: {exc}",
        ) from exc
    except UnicodeDecodeError as exc:
        raise ClinkrFailure(
            error_type="from_file_unreadable",
            message=f"--from-file is not readable: {path}: file is not valid UTF-8: {exc}",
        ) from exc


def _normalize_slug(raw_slug: str | None) -> str | None:
    if raw_slug is None:
        return None
    stripped = raw_slug.strip()
    if not stripped:
        return None
    slug = stripped.split("/", 1)[0].strip()
    if not slug:
        return None
    return slug


def _carried_file(key: str, slug: str) -> CarriedFile:
    prefix = f"{slug}/"
    if key.startswith(prefix):
        filename = key[len(prefix) :]
    else:
        filename = key
    return CarriedFile(file=filename, key=key)


def _blocked_target_collision(
    slug: str,
    target_branch: str,
    entries: tuple[EntryRef, ...],
) -> ClaimOutput:
    return _blocked(
        reason="target_collision",
        message=_target_collision_message(slug, target_branch, entries),
    )


def _target_collision_message(slug: str, target_branch: str, entries: tuple[EntryRef, ...]) -> str:
    keys = ", ".join(sorted(entry.key for entry in entries))
    return (
        f"Cannot claim objective {slug!r}: target branch {target_branch!r} "
        f"already carries keys under {slug!r}/: {keys}."
    )


def _blocked(*, reason: BlockReason, message: str) -> ClaimOutput:
    return ClaimOutput(
        schema=CLAIM_SCHEMA,
        status="blocked",
        message=message,
        result=None,
        selection=None,
        block=ClaimBlock(reason=reason, message=message),
    )


def _selection_output(
    *,
    kind: SelectionKind,
    prompt: str,
    options: tuple[SelectionOption, ...],
) -> ClaimOutput:
    lines = [prompt]
    for option in options:
        lines.append(f"- {option.label}: objective exec claim {_join_args(option.rerun_args)}")
    return ClaimOutput(
        schema=CLAIM_SCHEMA,
        status="needs_selection",
        message="\n".join(lines),
        result=None,
        selection=ClaimSelection(kind=kind, prompt=prompt, options=options),
        block=None,
    )


def _slug_rerun_args(slug: str, *, requested_target: str | None) -> tuple[str, ...]:
    args: list[str] = [slug]
    if requested_target is not None:
        args.extend(["--target", requested_target])
    return tuple(args)


def _source_rerun_args(
    slug: str,
    *,
    requested_target: str | None,
    source_branch: str,
) -> tuple[str, ...]:
    args = list(_slug_rerun_args(slug, requested_target=requested_target))
    args.extend(["--from", source_branch])
    return tuple(args)


def _join_args(args: tuple[str, ...]) -> str:
    return " ".join(args)


def _claimed_message(result: ClaimedResult, *, trunk_branch: str) -> str:
    files = ", ".join(file.file for file in result.files_carried)
    return (
        f"Claimed objective: {result.slug}\n"
        f"Target branch: {result.target_branch}\n"
        f"Source: {result.source_label}\n"
        f"Files carried: {files}\n"
        f"Destination ref: {result.destination_ref}\n"
        f"Destination commit: {result.destination_commit_sha}\n"
        f"Next: run objective-reconcile {result.slug} on {trunk_branch} when the branch "
        "snapshot is ready to merge back."
    )
