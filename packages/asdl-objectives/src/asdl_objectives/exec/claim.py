"""``objective exec claim`` — objective claim workflow for agents.

This command is the single skill-facing claim contract. The deterministic
planner and applier live in this module as implementation details so callers do
not need to juggle separate plan/apply exec commands or intermediate JSON plan
files.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal, TypeAlias

import click
from pydantic import Field

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrJsonSchemaModel, ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway, snapshot_ref_name

PLAN_SCHEMA = "claim-plan/v1"

# Stable kind codes for the source of the carry-forward copy.
SourceKind = Literal["local_file", "branch", "canonical"]

# Stable reason codes for the structured ambiguity / error envelope.
PlanStatus = Literal["plan", "ambiguous", "error"]
AmbiguityReason = Literal[
    "ambiguous_slug_candidates",
    "ambiguous_source_branches",
    "no_slug_no_candidates",
]
ErrorReason = Literal[
    "explicit_slug_not_found",
    "from_missing_slug",
    "from_file_unreadable",
    "target_collision",
]


class ClaimPlanRequest(ClinkrModel):
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
                "Use this absolute path as the source for `<slug>/body.md`. "
                "Requires an explicit SLUG and is mutually exclusive with `--from`."
            ),
        ),
    ] = None


class CandidateBranch(ClinkrModel):
    """A branch that could carry the slug, with ``HEAD`` distance for ranking."""

    branch: str
    distance: int


class SlugAlternative(ClinkrModel):
    """One slug a user could pick when multiple are reachable."""

    slug: str
    available_on_branch: str


class PlanSource(ClinkrModel):
    """Resolved source for the carry-forward copy.

    ``kind == "local_file"`` -> ``from_file_path`` is set, ``branch`` is None.
    ``kind == "branch"`` -> ``branch`` is set, ``from_file_path`` is None.
    ``kind == "canonical"`` -> ``branch`` is the repo's trunk branch,
    ``from_file_path`` is None.

    ``label`` is the human-readable source descriptor that the skill renders
    in its final output (e.g. ``branch feat/x (explicit --from)``).
    """

    kind: SourceKind
    branch: str | None
    from_file_path: str | None
    label: str


class ClaimPlan(ClinkrModel):
    """Unique deterministic plan ready to apply."""

    slug: str
    target_branch: str
    source: PlanSource


class ClaimPlanAmbiguity(ClinkrModel):
    """Structured "I need a human pick" payload.

    ``slug_alternatives`` is non-empty when the reason is
    ``ambiguous_slug_candidates``; ``branch_alternatives`` is non-empty when
    the reason is ``ambiguous_source_branches``. Both are empty when the
    reason is ``no_slug_no_candidates`` (nothing reachable).
    """

    reason: AmbiguityReason
    message: str
    slug_alternatives: tuple[SlugAlternative, ...]
    branch_alternatives: tuple[CandidateBranch, ...]


class ClaimPlanError(ClinkrModel):
    """Structured "the inputs are impossible to satisfy" payload."""

    reason: ErrorReason
    message: str


class ClaimPlanResultBase(ClinkrJsonSchemaModel):
    """Common fields for every claim-plan status envelope."""

    canonical_branch: str
    requested_slug: str | None
    resolved_slug: str | None
    requested_target: str | None
    requested_from_branch: str | None
    requested_from_file: str | None


class ClaimPlanReadyResult(ClaimPlanResultBase):
    """A unique deterministic plan is ready to apply."""

    status: Literal["plan"]
    plan: ClaimPlan
    ambiguity: None = None
    error: None = None


class ClaimPlanAmbiguousResult(ClaimPlanResultBase):
    """A human selection is required before claim can proceed."""

    status: Literal["ambiguous"]
    plan: None = None
    ambiguity: ClaimPlanAmbiguity
    error: None = None


class ClaimPlanErrorResult(ClaimPlanResultBase):
    """The requested claim inputs are impossible to satisfy."""

    status: Literal["error"]
    plan: None = None
    ambiguity: None = None
    error: ClaimPlanError


ClaimPlanResult: TypeAlias = Annotated[
    ClaimPlanReadyResult | ClaimPlanAmbiguousResult | ClaimPlanErrorResult,
    Field(discriminator="status"),
]


def plan_claim_objective(
    mctx: ObjectiveCliContext,
    request: ClaimPlanRequest,
) -> ClaimPlanResult:
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway
    trunk_branch = resolve_trunk(git).trunk

    Ensure.true(
        not (request.from_branch is not None and request.from_file is not None),
        error_type="conflicting_source_flags",
        message="--from and --from-file are mutually exclusive.",
    )

    requested_slug = _normalize_slug(request.slug)

    Ensure.true(
        not (
            (request.from_branch is not None or request.from_file is not None)
            and requested_slug is None
        ),
        error_type="source_flag_without_slug",
        message=(
            "--from and --from-file require an explicit SLUG; "
            "neither auto-resolves the objective name."
        ),
    )

    target_branch = Ensure.ideal_state(_resolve_target_branch(git, request.target))

    Ensure.true(
        target_branch != trunk_branch,
        error_type="target_is_trunk",
        message=(
            f"--target must not be {trunk_branch!r}: claim attaches "
            f"objectives to feature branches; canonical state is immutable here."
        ),
    )

    if requested_slug is None:
        outcome = _resolve_slug_from_ancestors(
            gateway=gateway,
            git=git,
            target_branch=target_branch,
            trunk_branch=trunk_branch,
        )
        if isinstance(outcome, _AmbiguityOutcome):
            return _envelope_for_request(
                request=request,
                requested_slug=requested_slug,
                target_branch=target_branch,
                trunk_branch=trunk_branch,
                status="ambiguous",
                ambiguity=outcome.ambiguity,
            )
        slug = outcome
    else:
        slug = requested_slug

    if target_carries_slug(gateway, slug=slug, branch=target_branch):
        return _envelope_for_request(
            request=request,
            requested_slug=requested_slug,
            target_branch=target_branch,
            trunk_branch=trunk_branch,
            resolved_slug=slug,
            status="error",
            error=ClaimPlanError(
                reason="target_collision",
                message=(
                    f"Target branch {target_branch!r} already carries "
                    f"keys under {slug!r}/. Use objective-update or "
                    f"objective-reconcile to advance the existing snapshot."
                ),
            ),
        )

    source_outcome = _resolve_source(
        gateway=gateway,
        git=git,
        slug=slug,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
        from_branch=request.from_branch,
        from_file=request.from_file,
    )
    if isinstance(source_outcome, ClaimPlanError):
        return _envelope_for_request(
            request=request,
            requested_slug=requested_slug,
            target_branch=target_branch,
            trunk_branch=trunk_branch,
            resolved_slug=slug,
            status="error",
            error=source_outcome,
        )
    if isinstance(source_outcome, ClaimPlanAmbiguity):
        return _envelope_for_request(
            request=request,
            requested_slug=requested_slug,
            target_branch=target_branch,
            trunk_branch=trunk_branch,
            resolved_slug=slug,
            status="ambiguous",
            ambiguity=source_outcome,
        )

    return _envelope_for_request(
        request=request,
        requested_slug=requested_slug,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
        resolved_slug=slug,
        status="plan",
        plan=ClaimPlan(
            slug=slug,
            target_branch=target_branch,
            source=source_outcome,
        ),
    )


def _envelope_for_request(
    *,
    request: ClaimPlanRequest,
    requested_slug: str | None,
    target_branch: str,
    trunk_branch: str,
    status: PlanStatus,
    resolved_slug: str | None = None,
    plan: ClaimPlan | None = None,
    ambiguity: ClaimPlanAmbiguity | None = None,
    error: ClaimPlanError | None = None,
) -> ClaimPlanResult:
    if status == "plan" and plan is not None:
        return ClaimPlanReadyResult(
            json_schema=PLAN_SCHEMA,
            canonical_branch=trunk_branch,
            requested_slug=requested_slug,
            resolved_slug=resolved_slug,
            requested_target=request.target,
            requested_from_branch=request.from_branch,
            requested_from_file=request.from_file,
            status="plan",
            plan=plan,
        )
    if status == "ambiguous" and ambiguity is not None:
        return ClaimPlanAmbiguousResult(
            json_schema=PLAN_SCHEMA,
            canonical_branch=trunk_branch,
            requested_slug=requested_slug,
            resolved_slug=resolved_slug,
            requested_target=request.target,
            requested_from_branch=request.from_branch,
            requested_from_file=request.from_file,
            status="ambiguous",
            ambiguity=ambiguity,
        )
    if status == "error" and error is not None:
        return ClaimPlanErrorResult(
            json_schema=PLAN_SCHEMA,
            canonical_branch=trunk_branch,
            requested_slug=requested_slug,
            resolved_slug=resolved_slug,
            requested_target=request.target,
            requested_from_branch=request.from_branch,
            requested_from_file=request.from_file,
            status="error",
            error=error,
        )
    raise ValueError(f"Invalid claim-plan envelope state: {status}")


def _normalize_slug(raw: str | None) -> str | None:
    """Drop ``<slug>/<file>`` addressing the way the legacy skill normalized it."""
    if raw is None:
        return None
    stripped = raw.strip()
    if not stripped:
        return None
    return slug_for_key(stripped)


@dataclass(frozen=True)
class HardFailure:
    """Domain-side sentinel for "this run cannot produce a structured envelope."

    Translated into :class:`ClinkrFailure` at the CLI entry point. Keeping
    the helper return as a frozen dataclass rather than ``ClinkrExit`` keeps
    helpers reusable and avoids ``ty`` narrowing pain across generic envelope
    types.
    """

    error_type: str
    message: str


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


def target_carries_slug(
    gateway: BranchMemoryGateway,
    *,
    slug: str,
    branch: str,
) -> bool:
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
    return any(slug_for_key(entry.key) == slug for entry in entries)


@dataclass(frozen=True)
class _AmbiguityOutcome:
    """Internal sentinel: ancestor walk produced a structured ambiguity, not a slug."""

    ambiguity: ClaimPlanAmbiguity


def _resolve_slug_from_ancestors(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    target_branch: str,
    trunk_branch: str,
) -> str | _AmbiguityOutcome:
    """Walk ancestors nearest-first; return slug, ambiguity, or fall through to canonical.

    Mirrors the legacy skill rule: stop at the **nearest** ancestor that
    carries any objectives and use its slug set as candidates. Do not merge
    slugs across ancestor levels. If no live ancestor carries any
    objectives, fall through to canonical (the repo's trunk branch) and
    use the trunk's slug set as candidates.
    """
    ancestor_branches = _ranked_ancestors(
        gateway=gateway,
        git=git,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
    )

    nearest_ancestor: str | None = None
    nearest_slugs: tuple[str, ...] = ()
    for branch, _distance in ancestor_branches:
        slugs = _slugs_on_branch(gateway, branch)
        if slugs:
            nearest_ancestor = branch
            nearest_slugs = slugs
            break

    if nearest_ancestor is not None:
        return _classify_slug_candidates(
            slugs=nearest_slugs,
            available_on_branch=nearest_ancestor,
        )

    canonical_slugs = _slugs_on_branch(gateway, trunk_branch)
    if not canonical_slugs:
        return _AmbiguityOutcome(
            ambiguity=ClaimPlanAmbiguity(
                reason="no_slug_no_candidates",
                message=(
                    f"No objectives reachable from any ancestor branch and no "
                    f"canonical objectives on {trunk_branch!r}. Run "
                    f"`objective-create` to author a new objective or pass "
                    f"`--from-file <path>`."
                ),
                slug_alternatives=(),
                branch_alternatives=(),
            )
        )
    return _classify_slug_candidates(
        slugs=canonical_slugs,
        available_on_branch=trunk_branch,
    )


def _classify_slug_candidates(
    *,
    slugs: tuple[str, ...],
    available_on_branch: str,
) -> str | _AmbiguityOutcome:
    if len(slugs) == 1:
        return slugs[0]
    return _AmbiguityOutcome(
        ambiguity=ClaimPlanAmbiguity(
            reason="ambiguous_slug_candidates",
            message=(
                f"Multiple objectives reachable on {available_on_branch!r}: "
                f"{', '.join(slugs)}. Re-run with an explicit SLUG."
            ),
            slug_alternatives=tuple(
                SlugAlternative(slug=s, available_on_branch=available_on_branch) for s in slugs
            ),
            branch_alternatives=(),
        )
    )


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
    """Return ``(branch, distance)`` for every brmem branch that is an ancestor of HEAD.

    Excludes ``trunk_branch`` and ``target_branch`` itself. Sorts by distance
    ascending (smaller = nearer to HEAD), then alphabetically as a stable
    tie-breaker. Branches that fail liveness or distance computation are
    dropped silently — the walk continues with the rest.
    """
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
    """Enumerate every brmem branch that carries any entry in the objectives namespace.

    The brmem gateway owns ``/`` <-> ``---`` encoding; ``EntryRef.branch``
    values are already decoded. We sort alphabetically for determinism;
    ranking by distance happens in the caller.
    """
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    return tuple(sorted({entry.branch for entry in entries}))


def _resolve_source(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
    target_branch: str,
    trunk_branch: str,
    from_branch: str | None,
    from_file: str | None,
) -> PlanSource | ClaimPlanError | ClaimPlanAmbiguity:
    """Apply the locked source cascade and return one resolved source.

    Cascade order:
      1. ``--from-file`` -> local file source.
      2. ``--from <branch>`` -> explicit branch source.
      3. Nearest live ancestor branch carrying ``<slug>/body.md``.
      4. Canonical ``master``.

    Returns :class:`ClaimPlanError` for unresolvable inputs (e.g. local file
    missing) and :class:`ClaimPlanAmbiguity` when multiple ancestor branches
    tie for nearest.
    """
    if from_file is not None:
        path = Path(from_file)
        if not path.exists() or not path.is_file():
            return ClaimPlanError(
                reason="from_file_unreadable",
                message=f"--from-file path does not exist or is not a file: {from_file}",
            )
        try:
            with path.open("rb"):
                pass
        except OSError as exc:
            return ClaimPlanError(
                reason="from_file_unreadable",
                message=f"--from-file path is not readable: {from_file}: {exc}",
            )
        return PlanSource(
            kind="local_file",
            branch=None,
            from_file_path=from_file,
            label=f"local file {from_file}",
        )

    if from_branch is not None:
        diagnostic = gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), from_branch)
        if diagnostic is None:
            return ClaimPlanError(
                reason="from_missing_slug",
                message=(
                    f"Source branch {from_branch!r} does not carry "
                    f"{body_key(slug)!r}; choose a different --from or use "
                    f"--from-file."
                ),
            )
        return PlanSource(
            kind="branch",
            branch=from_branch,
            from_file_path=None,
            label=f"branch {from_branch} (explicit --from)",
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
        tied = tuple(c for c in candidates if c.distance == nearest_distance)
        if len(tied) > 1:
            return ClaimPlanAmbiguity(
                reason="ambiguous_source_branches",
                message=(
                    f"Multiple ancestor branches tie for nearest source of "
                    f"{slug!r} (distance {nearest_distance}): "
                    f"{', '.join(c.branch for c in tied)}. Re-run with --from."
                ),
                slug_alternatives=(),
                branch_alternatives=tied,
            )
        chosen = tied[0]
        return PlanSource(
            kind="branch",
            branch=chosen.branch,
            from_file_path=None,
            label=f"ancestor branch {chosen.branch}",
        )

    diagnostic = gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), trunk_branch)
    if diagnostic is not None:
        return PlanSource(
            kind="canonical",
            branch=trunk_branch,
            from_file_path=None,
            label="canonical objective",
        )

    return ClaimPlanError(
        reason="explicit_slug_not_found",
        message=(
            f"Slug {slug!r} not found on any ancestor branch or in canonical "
            f"storage. Pass --from-file <path> or run `objective-create` to "
            f"author a new objective first."
        ),
    )


def _ancestor_branches_carrying_slug(
    *,
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
    target_branch: str,
    trunk_branch: str,
) -> tuple[CandidateBranch, ...]:
    """Live ancestor branches (skipping target / trunk) that carry ``<slug>/body.md``."""
    body_key_value = body_key(slug)
    branches_with_body = {
        entry.branch
        for entry in gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, key=body_key_value)
        if entry.branch != trunk_branch and entry.branch != target_branch
    }

    out: list[CandidateBranch] = []
    for branch in sorted(branches_with_body):
        if not git.branch_exists(branch):
            continue
        if not git.is_ancestor(branch, "HEAD"):
            continue
        distance = git.count_commits_in_range(f"{branch}..HEAD")
        if isinstance(distance, GitCommandFailure):
            continue
        out.append(CandidateBranch(branch=branch, distance=distance))

    out.sort(key=lambda c: (c.distance, c.branch))
    return tuple(out)


@dataclass(frozen=True)
class _ParsedPlan:
    slug: str
    target_branch: str
    source_kind: SourceKind
    source_branch: str | None
    source_label: str
    from_file_path: str | None


class CarriedFile(ClinkrModel):
    """One file landed on the target branch by the apply."""

    file: str
    key: str


class ClaimApplyResult(ClinkrJsonSchemaModel):
    """Outcome of a successful apply (one slug, one target branch)."""

    slug: str
    target_branch: str
    source_kind: str
    source_branch: str | None
    source_label: str
    files_carried: tuple[CarriedFile, ...]
    destination_ref: str
    destination_commit_sha: str


def apply_claim_plan_file(mctx: ObjectiveCliContext, plan_file: Path) -> ClaimApplyResult:
    trunk_branch = resolve_trunk(mctx.git_gateway).trunk

    raw = plan_file.read_text(encoding="utf-8")
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ClinkrFailure(
            error_type="malformed_plan_file",
            message=f"Plan file is not valid JSON: {exc}",
        ) from exc

    envelope = Ensure.inst(
        envelope,
        dict,
        error_type="malformed_plan_file",
        message="Plan file must be a JSON object envelope.",
    )

    json_schema = envelope.get("json_schema")
    Ensure.true(
        json_schema == PLAN_SCHEMA,
        error_type="schema_mismatch",
        message=f"Plan-file json_schema {json_schema!r} does not match expected {PLAN_SCHEMA!r}.",
    )

    canonical_branch = envelope.get("canonical_branch")
    Ensure.true(
        canonical_branch == trunk_branch,
        error_type="schema_mismatch",
        message=(
            f"Plan-file canonical_branch {canonical_branch!r} does not match "
            f"expected {trunk_branch!r}."
        ),
    )

    status = envelope.get("status")
    Ensure.true(
        status == "plan",
        error_type="not_a_plan",
        message=(
            f"Plan-file status is {status!r}; claim apply requires status='plan'. "
            f"Resolve the ambiguity or error before applying."
        ),
    )

    plan = envelope.get("plan")
    plan = Ensure.inst(
        plan,
        dict,
        error_type="malformed_plan_file",
        message="Plan-file 'plan' field must be a JSON object.",
    )

    parsed = Ensure.ideal_state(_parse_plan_block(plan))
    return _apply_parsed_claim_plan(mctx, parsed)


def apply_claim_plan_result(
    mctx: ObjectiveCliContext,
    plan_result: ClaimPlanResult,
) -> ClaimApplyResult:
    trunk_branch = resolve_trunk(mctx.git_gateway).trunk
    Ensure.true(
        plan_result.json_schema == PLAN_SCHEMA,
        error_type="schema_mismatch",
        message=(
            f"Plan result json_schema {plan_result.json_schema!r} does not match "
            f"expected {PLAN_SCHEMA!r}."
        ),
    )
    Ensure.true(
        plan_result.canonical_branch == trunk_branch,
        error_type="schema_mismatch",
        message=(
            f"Plan result canonical_branch {plan_result.canonical_branch!r} does not "
            f"match expected {trunk_branch!r}."
        ),
    )
    Ensure.true(
        plan_result.status == "plan",
        error_type="not_a_plan",
        message=(
            f"Plan result status is {plan_result.status!r}; claim apply requires status='plan'."
        ),
    )
    plan = Ensure.not_none(
        plan_result.plan,
        error_type="malformed_plan_file",
        message="Plan result status='plan' without plan details.",
    )
    return _apply_parsed_claim_plan(
        mctx,
        _ParsedPlan(
            slug=slug_for_key(plan.slug),
            target_branch=plan.target_branch,
            source_kind=plan.source.kind,
            source_branch=plan.source.branch,
            source_label=plan.source.label,
            from_file_path=plan.source.from_file_path,
        ),
    )


def _apply_parsed_claim_plan(
    mctx: ObjectiveCliContext,
    parsed: _ParsedPlan,
) -> ClaimApplyResult:
    gateway = mctx.brmem_gateway
    slug = parsed.slug
    target_branch = parsed.target_branch
    source_kind = parsed.source_kind
    source_branch = parsed.source_branch
    source_label = parsed.source_label
    from_file_path = parsed.from_file_path

    Ensure.true(
        not target_carries_slug(gateway, slug=slug, branch=target_branch),
        error_type="target_collision",
        message=(
            f"Target branch {target_branch!r} now carries keys under "
            f"{slug!r}/. Use objective-update or objective-reconcile to "
            f"advance the existing snapshot, or claim a different target."
        ),
    )

    if source_kind == "local_file":
        from_file_path = Ensure.not_none(
            from_file_path,
            error_type="malformed_plan_file",
            message="Local-file plan must carry 'plan.source.from_file_path'.",
        )
        path = Path(from_file_path)
        Ensure.true(
            path.exists() and path.is_file(),
            error_type="from_file_unreadable",
            message=(f"Local-file source path no longer exists or is not a file: {from_file_path}"),
        )
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ClinkrFailure(
                error_type="from_file_unreadable",
                message=f"Local-file source is not readable: {from_file_path}: {exc}",
            ) from exc
        body_key_value = body_key(slug)
        commit_sha = gateway.put(OBJECTIVE_NAMESPACE, body_key_value, target_branch, content)
        ref_name = _ref_name(target_branch)
        return ClaimApplyResult(
            json_schema=PLAN_SCHEMA,
            slug=slug,
            target_branch=target_branch,
            source_kind=source_kind,
            source_branch=None,
            source_label=source_label,
            files_carried=(CarriedFile(file="body.md", key=body_key_value),),
            destination_ref=ref_name,
            destination_commit_sha=commit_sha,
        )

    source_branch = Ensure.not_none(
        source_branch,
        error_type="malformed_plan_file",
        message="Branch-source plan must carry 'plan.source.branch'.",
    )

    Ensure.not_none(
        gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), source_branch),
        error_type="source_missing_slug",
        message=(
            f"Source branch {source_branch!r} no longer carries "
            f"{body_key(slug)!r}; the snapshot may have been deleted "
            f"since plan time."
        ),
    )

    copied = Ensure.truthy(
        gateway.copy_entries(
            namespace=OBJECTIVE_NAMESPACE,
            from_branch=source_branch,
            to_branch=target_branch,
            overwrite=False,
            key_glob=f"{slug}/*",
        ),
        error_type="source_missing_slug",
        message=(
            f"Source branch {source_branch!r} produced no files matching "
            f"{slug!r}/* — the snapshot may have been deleted since plan time."
        ),
    )

    files_carried = tuple(
        CarriedFile(file=_filename_for_key(entry.key, slug), key=entry.key) for entry in copied
    )

    diag_after = gateway.check(OBJECTIVE_NAMESPACE, copied[0].key, target_branch)
    commit_sha = diag_after.head_sha if diag_after is not None else ""
    ref_name = _ref_name(target_branch)
    return ClaimApplyResult(
        json_schema=PLAN_SCHEMA,
        slug=slug,
        target_branch=target_branch,
        source_kind=source_kind,
        source_branch=source_branch,
        source_label=source_label,
        files_carried=files_carried,
        destination_ref=ref_name,
        destination_commit_sha=commit_sha,
    )


def _parse_plan_block(plan: dict[str, Any]) -> _ParsedPlan | HardFailure:
    slug = plan.get("slug")
    target_branch = plan.get("target_branch")
    source = plan.get("source")
    if not isinstance(slug, str) or not slug:
        return HardFailure(
            error_type="malformed_plan_file",
            message="Plan 'slug' must be a non-empty string.",
        )
    if not isinstance(target_branch, str) or not target_branch:
        return HardFailure(
            error_type="malformed_plan_file",
            message="Plan 'target_branch' must be a non-empty string.",
        )
    if not isinstance(source, dict):
        return HardFailure(
            error_type="malformed_plan_file",
            message="Plan 'source' must be a JSON object.",
        )

    kind = source.get("kind")
    if kind not in ("local_file", "branch", "canonical"):
        return HardFailure(
            error_type="malformed_plan_file",
            message=f"Plan source.kind {kind!r} is not a recognized SourceKind.",
        )

    label = source.get("label")
    if not isinstance(label, str):
        return HardFailure(
            error_type="malformed_plan_file",
            message="Plan source.label must be a string.",
        )

    branch = source.get("branch")
    if branch is not None and not isinstance(branch, str):
        return HardFailure(
            error_type="malformed_plan_file",
            message="Plan source.branch must be a string or null.",
        )

    from_file_path = source.get("from_file_path")
    if from_file_path is not None and not isinstance(from_file_path, str):
        return HardFailure(
            error_type="malformed_plan_file",
            message="Plan source.from_file_path must be a string or null.",
        )

    return _ParsedPlan(
        slug=slug_for_key(slug),
        target_branch=target_branch,
        source_kind=kind,
        source_branch=branch,
        source_label=label,
        from_file_path=from_file_path,
    )


def _filename_for_key(key: str, slug: str) -> str:
    prefix = f"{slug}/"
    if key.startswith(prefix):
        return key[len(prefix) :]
    return key


def _ref_name(branch: str) -> str:
    return snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)


CLAIM_SCHEMA = "claim/v1"
ClaimStatus = Literal["claimed", "needs_selection", "blocked"]
SelectionKind = Literal["slug", "source_branch"]


class ClaimSelectionOption(ClinkrModel):
    """One user-selectable continuation for a blocked claim command."""

    label: str
    value: str
    description: str | None
    rerun_args: tuple[str, ...]


class ClaimSelection(ClinkrModel):
    """Generic selection payload for UI and non-UI callers."""

    kind: SelectionKind
    prompt: str
    options: tuple[ClaimSelectionOption, ...]


class ClaimBlock(ClinkrModel):
    """Structured explanation for a claim that cannot continue automatically."""

    reason: str
    message: str


class ClaimCommandResult(ClinkrJsonSchemaModel):
    """High-level objective claim result for skills and CLI callers."""

    status: ClaimStatus
    message: str
    result: ClaimApplyResult | None
    selection: ClaimSelection | None
    block: ClaimBlock | None


def render_claim(result: ClaimCommandResult) -> None:
    click.echo(result.message)


@clinkr_operation(
    name="claim",
    help=(
        "Claim an existing objective snapshot onto a target branch. Runs the "
        "deterministic claim planner, returns generic selection options when "
        "a human choice is needed, and applies the resolved plan when unique."
    ),
    human_renderer=render_claim,
)
def run_claim_objective(
    ctx: click.Context,
    request: ClaimPlanRequest,
) -> ClinkrExit[ClaimCommandResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    plan_result = plan_claim_objective(mctx, request)

    if plan_result.status == "ambiguous":
        return ClinkrExit.ok(_result_for_ambiguity(request=request, plan_result=plan_result))

    if plan_result.status == "error":
        plan_error = Ensure.not_none(
            plan_result.error,
            error_type="claim_plan_missing_error",
            message="claim planner returned status='error' without error details.",
        )
        return ClinkrExit.ok(_blocked_result(plan_error.reason, plan_error.message))

    Ensure.true(
        plan_result.status == "plan" and plan_result.plan is not None,
        error_type="claim_plan_unsupported_status",
        message=f"claim planner returned unsupported status: {plan_result.status!r}.",
    )

    apply_result = apply_claim_plan_result(mctx, plan_result)
    return ClinkrExit.ok(
        ClaimCommandResult(
            json_schema=CLAIM_SCHEMA,
            status="claimed",
            message=_success_message(
                apply_result,
                canonical_branch=plan_result.canonical_branch,
            ),
            result=apply_result,
            selection=None,
            block=None,
        )
    )


def _result_for_ambiguity(
    *,
    request: ClaimPlanRequest,
    plan_result: ClaimPlanResult,
) -> ClaimCommandResult:
    ambiguity = Ensure.not_none(
        plan_result.ambiguity,
        error_type="claim_plan_missing_ambiguity",
        message="claim planner returned status='ambiguous' without ambiguity details.",
    )

    if ambiguity.reason == "ambiguous_slug_candidates":
        return _selection_result_for_slugs(request=request, ambiguity=ambiguity)

    if ambiguity.reason == "ambiguous_source_branches":
        slug = plan_result.resolved_slug or plan_result.requested_slug
        if slug is None:
            return _blocked_result(
                "ambiguous_source_branches",
                "claim planner found multiple source branches but did not "
                "return the resolved slug.",
            )
        return _selection_result_for_source_branches(
            request=request,
            slug=slug,
            ambiguity=ambiguity,
        )

    if ambiguity.reason == "no_slug_no_candidates":
        return _blocked_result(ambiguity.reason, ambiguity.message)

    return _blocked_result(ambiguity.reason, ambiguity.message)


def _selection_result_for_slugs(
    *,
    request: ClaimPlanRequest,
    ambiguity: ClaimPlanAmbiguity,
) -> ClaimCommandResult:
    options = tuple(
        ClaimSelectionOption(
            label=alternative.slug,
            value=alternative.slug,
            description=f"available on {alternative.available_on_branch}",
            rerun_args=_rerun_args(request, slug=alternative.slug),
        )
        for alternative in ambiguity.slug_alternatives
    )
    selection = ClaimSelection(
        kind="slug",
        prompt="Multiple objectives are reachable. Choose one to claim:",
        options=options,
    )
    return ClaimCommandResult(
        json_schema=CLAIM_SCHEMA,
        status="needs_selection",
        message=_selection_message(selection),
        result=None,
        selection=selection,
        block=None,
    )


def _selection_result_for_source_branches(
    *,
    request: ClaimPlanRequest,
    slug: str,
    ambiguity: ClaimPlanAmbiguity,
) -> ClaimCommandResult:
    options = tuple(
        ClaimSelectionOption(
            label=alternative.branch,
            value=alternative.branch,
            description=f"distance {alternative.distance}",
            rerun_args=_rerun_args(request, slug=slug, from_branch=alternative.branch),
        )
        for alternative in ambiguity.branch_alternatives
    )
    selection = ClaimSelection(
        kind="source_branch",
        prompt="Multiple source branches are reachable. Choose one:",
        options=options,
    )
    return ClaimCommandResult(
        json_schema=CLAIM_SCHEMA,
        status="needs_selection",
        message=_selection_message(selection),
        result=None,
        selection=selection,
        block=None,
    )


def _blocked_result(reason: str, message: str) -> ClaimCommandResult:
    return ClaimCommandResult(
        json_schema=CLAIM_SCHEMA,
        status="blocked",
        message=f"Cannot claim objective:\n{reason}: {message}",
        result=None,
        selection=None,
        block=ClaimBlock(reason=reason, message=message),
    )


def _rerun_args(
    request: ClaimPlanRequest,
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
        f"Next:\n"
        f"This branch is ready for implementation. After implementing the slice, merge\n"
        f"the PR and run objective-reconcile {result.slug} on {canonical_branch}. Run\n"
        f"objective-update {result.slug} only if another branch will claim from this\n"
        f"branch before it lands."
    )


def _shell_quote(part: str) -> str:
    return part if _is_shell_safe(part) else json.dumps(part)


def _is_shell_safe(part: str) -> bool:
    return bool(part) and all(char.isalnum() or char in "_./:@%+=,-" for char in part)
