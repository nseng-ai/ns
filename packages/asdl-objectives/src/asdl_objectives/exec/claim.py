"""``objective exec claim`` — objective claim workflow for agents."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway, BrmemCopyConflictError, snapshot_ref_name

CLAIM_SCHEMA = "claim/v1"
ClaimStatus = Literal["claimed", "needs_selection", "blocked"]
SelectionKind = Literal["slug", "source_branch"]
SourceKind = Literal["branch", "local_file"]


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
            help="Target branch to write the snapshot to. Defaults to the current branch.",
        ),
    ] = None
    from_branch: Annotated[
        str | None,
        click.Option(
            ["--from"],
            "from_branch",
            type=click.STRING,
            default=None,
            help="Use this branch as the explicit source. Requires an explicit SLUG.",
        ),
    ] = None
    from_file: Annotated[
        str | None,
        click.Option(
            ["--from-file"],
            type=click.STRING,
            default=None,
            help=(
                "Bootstrap `<slug>/body.md` from this local file. Requires an explicit "
                "SLUG and is mutually exclusive with `--from`."
            ),
        ),
    ] = None


@dataclass(frozen=True)
class ClaimSelectionOption(JsonSerializable):
    """One user-selectable continuation for a claim command."""

    label: str
    value: str
    description: str | None
    rerun_args: tuple[str, ...]


@dataclass(frozen=True)
class ClaimSelection(JsonSerializable):
    """Generic selection payload for UI and non-UI callers."""

    kind: SelectionKind
    prompt: str
    options: tuple[ClaimSelectionOption, ...]


@dataclass(frozen=True)
class ClaimBlock(JsonSerializable):
    """Structured explanation for a claim that cannot continue automatically."""

    reason: str
    message: str


@dataclass(frozen=True)
class CarriedFile(JsonSerializable):
    """One file landed on the target branch by the apply."""

    file: str
    key: str


@dataclass(frozen=True)
class ClaimApplyResult(JsonSerializable):
    """Outcome of a successful apply (one slug, one target branch)."""

    slug: str
    target_branch: str
    source_kind: SourceKind
    source_branch: str | None
    source_label: str
    files_carried: tuple[CarriedFile, ...]
    destination_ref: str
    destination_commit_sha: str


@dataclass(frozen=True)
class ClaimCommandResult(JsonSerializable):
    """High-level objective claim result for skills and CLI callers."""

    schema: str
    status: ClaimStatus
    message: str
    result: ClaimApplyResult | None
    selection: ClaimSelection | None
    block: ClaimBlock | None


@dataclass(frozen=True)
class ClaimSource:
    """Resolved source for the carry-forward copy."""

    kind: SourceKind
    branch: str | None
    from_file_path: str | None
    label: str


@dataclass(frozen=True)
class ResolvedClaim:
    """Unique claim ready to apply."""

    slug: str
    target_branch: str
    source: ClaimSource


@dataclass(frozen=True)
class HardFailure:
    """Domain-side sentinel for a hard precondition failure."""

    error_type: str
    message: str


@dataclass(frozen=True)
class _CandidateBranch:
    """A branch that could carry the slug, with ``HEAD`` distance for ranking."""

    branch: str
    distance: int


def render_claim(result: ClaimCommandResult) -> None:
    click.echo(result.message)


@clinkr_operation(
    name="claim",
    help=(
        "Claim an existing objective snapshot onto a target branch. Returns "
        "generic selection options when a human choice is needed and applies "
        "the resolved claim when unique."
    ),
    human_renderer=render_claim,
)
def run_claim_objective(
    ctx: click.Context,
    request: ClaimRequest,
) -> ClinkrExit[ClaimCommandResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    outcome = resolve_claim(mctx, request)

    match outcome:
        case ClaimSelection() as selection:
            return ClinkrExit.ok(_selection_command_result(selection))
        case ClaimBlock() as block:
            return ClinkrExit.ok(_blocked_command_result(block))
        case ResolvedClaim() as claim:
            apply_result = apply_claim(mctx, claim)
            return ClinkrExit.ok(
                ClaimCommandResult(
                    schema=CLAIM_SCHEMA,
                    status="claimed",
                    message=_success_message(
                        apply_result,
                        canonical_branch=resolve_trunk(mctx.git_gateway).trunk,
                    ),
                    result=apply_result,
                    selection=None,
                    block=None,
                )
            )

    Ensure.fail(
        error_type="claim_resolution_unsupported_outcome",
        message=f"claim resolver returned unsupported outcome: {type(outcome).__name__}",
    )


def resolve_claim(
    mctx: ObjectiveCliContext,
    request: ClaimRequest,
) -> ResolvedClaim | ClaimSelection | ClaimBlock:
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway
    trunk_branch = resolve_trunk(git).trunk
    requested_slug = _normalize_slug(request.slug)

    _validate_claim_flags(request, requested_slug=requested_slug)

    target_branch = Ensure.ideal_state(_resolve_target_branch(git, request.target))
    Ensure.true(
        target_branch != trunk_branch,
        error_type="target_is_trunk",
        message=(
            f"--target must not be {trunk_branch!r}: claim attaches objectives "
            "to feature branches; canonical state is immutable here."
        ),
    )

    slug_outcome = _resolve_slug(
        gateway=gateway,
        git=git,
        request=request,
        requested_slug=requested_slug,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
    )
    if isinstance(slug_outcome, ClaimSelection | ClaimBlock):
        return slug_outcome

    slug = slug_outcome
    if target_carries_slug(gateway, slug=slug, branch=target_branch):
        return ClaimBlock(
            reason="target_collision",
            message=_target_collision_message(slug=slug, target_branch=target_branch),
        )

    source_outcome = _resolve_source(
        gateway=gateway,
        git=git,
        request=request,
        slug=slug,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
    )
    if isinstance(source_outcome, ClaimSelection | ClaimBlock):
        return source_outcome

    return ResolvedClaim(
        slug=slug,
        target_branch=target_branch,
        source=source_outcome,
    )


def apply_claim(mctx: ObjectiveCliContext, claim: ResolvedClaim) -> ClaimApplyResult:
    gateway = mctx.brmem_gateway
    Ensure.true(
        not target_carries_slug(gateway, slug=claim.slug, branch=claim.target_branch),
        error_type="target_collision",
        message=_target_collision_message(slug=claim.slug, target_branch=claim.target_branch),
    )

    if claim.source.kind == "local_file":
        return _apply_local_file_claim(gateway, claim)

    return _apply_branch_claim(gateway, claim)


def _validate_claim_flags(request: ClaimRequest, *, requested_slug: str | None) -> None:
    Ensure.true(
        not (request.from_branch is not None and request.from_file is not None),
        error_type="conflicting_source_flags",
        message="--from and --from-file are mutually exclusive.",
    )
    Ensure.true(
        not (
            (request.from_branch is not None or request.from_file is not None)
            and requested_slug is None
        ),
        error_type="source_flag_without_slug",
        message=(
            "--from and --from-file require an explicit SLUG; neither "
            "auto-resolves the objective name."
        ),
    )


def _resolve_target_branch(
    git: GitGateway,
    requested_target: str | None,
) -> str | HardFailure:
    if requested_target is not None:
        return requested_target
    match git.get_current_branch(Path.cwd()):
        case DetachedHead():
            return HardFailure(
                error_type="detached_head",
                message=(
                    "Detached HEAD: claim requires a checked-out branch or an explicit --target."
                ),
            )
        case GitCommandFailure() as failure:
            return HardFailure(error_type="git_failed", message=failure.message)
        case str() as branch:
            return branch


def _resolve_slug(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    request: ClaimRequest,
    requested_slug: str | None,
    target_branch: str,
    trunk_branch: str,
) -> str | ClaimSelection | ClaimBlock:
    if requested_slug is not None:
        return requested_slug

    ancestor_branches = _ranked_ancestors(
        gateway=gateway,
        git=git,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
    )
    for branch, _distance in ancestor_branches:
        slugs = _slugs_on_branch(gateway, branch)
        if slugs:
            return _classify_slug_candidates(
                request=request,
                slugs=slugs,
                available_on_branch=branch,
            )

    canonical_slugs = _slugs_on_branch(gateway, trunk_branch)
    if not canonical_slugs:
        return ClaimBlock(
            reason="no_slug_no_candidates",
            message=(
                f"No objectives reachable from any ancestor branch and no canonical "
                f"objectives on {trunk_branch!r}. Run `objective-create` to author "
                "a new objective, or pass an explicit SLUG with `--from-file <path>` "
                "to bootstrap `<slug>/body.md` from a local file."
            ),
        )
    return _classify_slug_candidates(
        request=request,
        slugs=canonical_slugs,
        available_on_branch=trunk_branch,
    )


def _classify_slug_candidates(
    *,
    request: ClaimRequest,
    slugs: tuple[str, ...],
    available_on_branch: str,
) -> str | ClaimSelection:
    if len(slugs) == 1:
        return slugs[0]

    return ClaimSelection(
        kind="slug",
        prompt="Multiple objectives are reachable. Choose one to claim:",
        options=tuple(
            ClaimSelectionOption(
                label=slug,
                value=slug,
                description=f"available on {available_on_branch}",
                rerun_args=_rerun_args(request, slug=slug),
            )
            for slug in slugs
        ),
    )


def _resolve_source(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    request: ClaimRequest,
    slug: str,
    target_branch: str,
    trunk_branch: str,
) -> ClaimSource | ClaimSelection | ClaimBlock:
    if request.from_file is not None:
        return _resolve_local_file_source(request.from_file)

    if request.from_branch is not None:
        return _resolve_explicit_branch_source(
            gateway=gateway,
            slug=slug,
            from_branch=request.from_branch,
        )

    candidates = _ancestor_branches_carrying_slug(
        gateway=gateway,
        git=git,
        slug=slug,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
    )
    if candidates:
        nearest_distance = candidates[0].distance
        tied = tuple(
            candidate for candidate in candidates if candidate.distance == nearest_distance
        )
        if len(tied) > 1:
            return _source_branch_selection(request=request, slug=slug, branches=tied)

        chosen = tied[0]
        return ClaimSource(
            kind="branch",
            branch=chosen.branch,
            from_file_path=None,
            label=f"ancestor branch {chosen.branch}",
        )

    if gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), trunk_branch) is not None:
        return ClaimSource(
            kind="branch",
            branch=trunk_branch,
            from_file_path=None,
            label="canonical objective",
        )

    return ClaimBlock(
        reason="explicit_slug_not_found",
        message=(
            f"Slug {slug!r} not found on any ancestor branch or in canonical storage. "
            "Pass an explicit SLUG with `--from-file <path>` to bootstrap "
            "`<slug>/body.md`, or run `objective-create` to author a new objective first."
        ),
    )


def _resolve_local_file_source(from_file: str) -> ClaimSource | ClaimBlock:
    path = Path(from_file)
    if not path.exists() or not path.is_file():
        return ClaimBlock(
            reason="from_file_unreadable",
            message=f"--from-file path does not exist or is not a file: {from_file}",
        )

    return ClaimSource(
        kind="local_file",
        branch=None,
        from_file_path=from_file,
        label=f"local file {from_file} (bootstrap body.md only)",
    )


def _resolve_explicit_branch_source(
    *,
    gateway: BranchMemoryGateway,
    slug: str,
    from_branch: str,
) -> ClaimSource | ClaimBlock:
    if gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), from_branch) is None:
        return ClaimBlock(
            reason="from_missing_slug",
            message=(
                f"Source branch {from_branch!r} does not carry {body_key(slug)!r}; "
                "choose a different --from or use --from-file."
            ),
        )

    return ClaimSource(
        kind="branch",
        branch=from_branch,
        from_file_path=None,
        label=f"branch {from_branch} (explicit --from)",
    )


def _source_branch_selection(
    *,
    request: ClaimRequest,
    slug: str,
    branches: tuple[_CandidateBranch, ...],
) -> ClaimSelection:
    return ClaimSelection(
        kind="source_branch",
        prompt="Multiple source branches are reachable. Choose one:",
        options=tuple(
            ClaimSelectionOption(
                label=branch.branch,
                value=branch.branch,
                description=f"distance {branch.distance}",
                rerun_args=_rerun_args(request, slug=slug, from_branch=branch.branch),
            )
            for branch in branches
        ),
    )


def _apply_local_file_claim(
    gateway: BranchMemoryGateway,
    claim: ResolvedClaim,
) -> ClaimApplyResult:
    from_file_path = Ensure.not_none(
        claim.source.from_file_path,
        error_type="from_file_unreadable",
        message="Local-file claim source is missing its path.",
    )
    path = Path(from_file_path)
    Ensure.true(
        path.exists() and path.is_file(),
        error_type="from_file_unreadable",
        message=f"Local-file source path no longer exists or is not a file: {from_file_path}",
    )
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ClinkrFailure(
            error_type="from_file_unreadable",
            message=f"Local-file source is not readable: {from_file_path}: {exc}",
        ) from exc

    body_key_value = body_key(claim.slug)
    commit_sha = gateway.put(OBJECTIVE_NAMESPACE, body_key_value, claim.target_branch, content)
    return ClaimApplyResult(
        slug=claim.slug,
        target_branch=claim.target_branch,
        source_kind=claim.source.kind,
        source_branch=None,
        source_label=claim.source.label,
        files_carried=(CarriedFile(file="body.md", key=body_key_value),),
        destination_ref=_ref_name(claim.target_branch),
        destination_commit_sha=commit_sha,
    )


def _apply_branch_claim(
    gateway: BranchMemoryGateway,
    claim: ResolvedClaim,
) -> ClaimApplyResult:
    source_branch = Ensure.not_none(
        claim.source.branch,
        error_type="source_missing_slug",
        message="Branch claim source is missing its source branch.",
    )
    Ensure.not_none(
        gateway.check(OBJECTIVE_NAMESPACE, body_key(claim.slug), source_branch),
        error_type="source_missing_slug",
        message=(
            f"Source branch {source_branch!r} no longer carries "
            f"{body_key(claim.slug)!r}; the snapshot may have been deleted since resolution."
        ),
    )

    try:
        copied = gateway.copy_entries(
            namespace=OBJECTIVE_NAMESPACE,
            from_branch=source_branch,
            to_branch=claim.target_branch,
            overwrite=False,
            key_glob=f"{claim.slug}/*",
        )
    except BrmemCopyConflictError as exc:
        raise ClinkrFailure(
            error_type="target_collision",
            message=_target_collision_message(slug=claim.slug, target_branch=claim.target_branch),
        ) from exc

    copied = Ensure.truthy(
        copied,
        error_type="source_missing_slug",
        message=(
            f"Source branch {source_branch!r} produced no files matching "
            f"{claim.slug!r}/* — the snapshot may have been deleted since resolution."
        ),
    )
    files_carried = tuple(
        CarriedFile(file=_filename_for_key(entry.key, claim.slug), key=entry.key)
        for entry in copied
    )

    diag_after = gateway.check(OBJECTIVE_NAMESPACE, copied[0].key, claim.target_branch)
    commit_sha = diag_after.head_sha if diag_after is not None else ""
    return ClaimApplyResult(
        slug=claim.slug,
        target_branch=claim.target_branch,
        source_kind=claim.source.kind,
        source_branch=source_branch,
        source_label=claim.source.label,
        files_carried=files_carried,
        destination_ref=_ref_name(claim.target_branch),
        destination_commit_sha=commit_sha,
    )


def target_carries_slug(
    gateway: BranchMemoryGateway,
    *,
    slug: str,
    branch: str,
) -> bool:
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
    return any(slug_for_key(entry.key) == slug for entry in entries)


def _slugs_on_branch(gateway: BranchMemoryGateway, branch: str) -> tuple[str, ...]:
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
    return tuple(sorted({slug_for_key(entry.key) for entry in entries}))


def _ranked_ancestors(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    target_branch: str,
    trunk_branch: str,
) -> tuple[tuple[str, int], ...]:
    seen_branches = _brmem_branches_with_namespace(gateway)

    candidates: list[tuple[str, int]] = []
    for branch in seen_branches:
        if branch == trunk_branch or branch == target_branch:
            continue
        if not git.branch_exists(branch):
            continue
        if not git.is_ancestor(branch, "HEAD"):
            continue
        distance_result = git.count_commits_in_range(f"{branch}..HEAD")
        if isinstance(distance_result, GitCommandFailure):
            continue
        candidates.append((branch, distance_result))

    candidates.sort(key=lambda item: (item[1], item[0]))
    return tuple(candidates)


def _brmem_branches_with_namespace(gateway: BranchMemoryGateway) -> tuple[str, ...]:
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    return tuple(sorted({entry.branch for entry in entries}))


def _ancestor_branches_carrying_slug(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
    target_branch: str,
    trunk_branch: str,
) -> tuple[_CandidateBranch, ...]:
    body_key_value = body_key(slug)
    branches_with_body = {
        entry.branch
        for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, key=body_key_value)
        if entry.branch != trunk_branch and entry.branch != target_branch
    }

    candidates: list[_CandidateBranch] = []
    for branch in sorted(branches_with_body):
        if not git.branch_exists(branch):
            continue
        if not git.is_ancestor(branch, "HEAD"):
            continue
        distance = git.count_commits_in_range(f"{branch}..HEAD")
        if isinstance(distance, GitCommandFailure):
            continue
        candidates.append(_CandidateBranch(branch=branch, distance=distance))

    candidates.sort(key=lambda candidate: (candidate.distance, candidate.branch))
    return tuple(candidates)


def _normalize_slug(raw: str | None) -> str | None:
    """Drop ``<slug>/<file>`` addressing the way the legacy skill normalized it."""
    if raw is None:
        return None
    stripped = raw.strip()
    if not stripped:
        return None
    return slug_for_key(stripped)


def _filename_for_key(key: str, slug: str) -> str:
    prefix = f"{slug}/"
    if key.startswith(prefix):
        return key[len(prefix) :]
    return key


def _ref_name(branch: str) -> str:
    return snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)


def _target_collision_message(*, slug: str, target_branch: str) -> str:
    return (
        f"Target branch {target_branch!r} already carries keys under {slug!r}/. "
        "Use objective-update or objective-reconcile to advance the existing snapshot, "
        "or claim a different target."
    )


def _selection_command_result(selection: ClaimSelection) -> ClaimCommandResult:
    return ClaimCommandResult(
        schema=CLAIM_SCHEMA,
        status="needs_selection",
        message=_selection_message(selection),
        result=None,
        selection=selection,
        block=None,
    )


def _blocked_command_result(block: ClaimBlock) -> ClaimCommandResult:
    return ClaimCommandResult(
        schema=CLAIM_SCHEMA,
        status="blocked",
        message=f"Cannot claim objective:\n{block.reason}: {block.message}",
        result=None,
        selection=None,
        block=block,
    )


def _rerun_args(
    request: ClaimRequest,
    *,
    slug: str,
    from_branch: str | None = None,
) -> tuple[str, ...]:
    args: list[str] = [slug]
    if request.target is not None:
        args.extend(("--target", request.target))
    if from_branch is not None:
        args.extend(("--from", from_branch))
    elif request.from_branch is not None:
        args.extend(("--from", request.from_branch))
    if request.from_file is not None:
        args.extend(("--from-file", request.from_file))
    return tuple(args)


def _selection_message(selection: ClaimSelection) -> str:
    if not selection.options:
        return selection.prompt
    lines = [selection.prompt]
    for option in selection.options:
        command = "objective exec claim " + " ".join(_shell_quote(arg) for arg in option.rerun_args)
        suffix = f" ({option.description})" if option.description else ""
        lines.append(f"- {option.label}{suffix}: {command}")
    return "\n".join(lines)


def _success_message(result: ClaimApplyResult, *, canonical_branch: str) -> str:
    files = "\n".join(f"- {file.file}" for file in result.files_carried) or "- none"
    return (
        f"Claimed objective: {result.slug}\n"
        f"Source: {result.source_label}\n"
        f"Target: {result.target_branch}\n\n"
        f"Files carried:\n{files}\n\n"
        f"Destination ref: {result.destination_ref}\n"
        f"Commit: {result.destination_commit_sha}\n\n"
        "Next:\n"
        "This branch is ready for implementation. After implementing the slice, merge\n"
        f"the PR and run objective-reconcile {result.slug} on {canonical_branch}. Run\n"
        f"objective-update {result.slug} only if another branch will claim from this\n"
        "branch before it lands."
    )


def _shell_quote(part: str) -> str:
    return part if _is_shell_safe(part) else json.dumps(part)


def _is_shell_safe(part: str) -> bool:
    return bool(part) and all(char.isalnum() or char in "_./:@%+=,-" for char in part)
