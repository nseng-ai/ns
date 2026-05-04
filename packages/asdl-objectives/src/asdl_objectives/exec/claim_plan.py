"""``objective exec claim-plan`` — deterministic plan for ``objective-claim``.

Pulls the deterministic mechanics of ``objective-claim`` out of skill prose
into Python: target collision check, slug candidate enumeration via ancestor
walking, source cascade selection (local file -> ``--from`` branch ->
nearest live ancestor branch carrying ``<slug>/body.md`` -> canonical
``master``), and structured ambiguity reporting. Higher-level callers should
prefer ``objective exec claim``, which converts those plans and ambiguities
into a single agent-facing contract.

The CLI does **not** prompt for user input. Anywhere the original skill
asked the human a question (multi-candidate ancestor, multi-slug ancestor,
no slug + no candidates), this command emits a structured ambiguity payload
with a stable reason code.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import (
    body_key,
    slug_for_key,
)
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway

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


@dataclass(frozen=True)
class ClaimPlanRequest:
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


@dataclass(frozen=True)
class CandidateBranch(JsonSerializable):
    """A branch that could carry the slug, with ``HEAD`` distance for ranking."""

    branch: str
    distance: int


@dataclass(frozen=True)
class SlugAlternative(JsonSerializable):
    """One slug a user could pick when multiple are reachable."""

    slug: str
    available_on_branch: str


@dataclass(frozen=True)
class PlanSource(JsonSerializable):
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


@dataclass(frozen=True)
class ClaimPlan(JsonSerializable):
    """Unique deterministic plan ready for ``claim-apply``."""

    slug: str
    target_branch: str
    source: PlanSource


@dataclass(frozen=True)
class ClaimPlanAmbiguity(JsonSerializable):
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


@dataclass(frozen=True)
class ClaimPlanError(JsonSerializable):
    """Structured "the inputs are impossible to satisfy" payload."""

    reason: ErrorReason
    message: str


@dataclass(frozen=True)
class ClaimPlanResult(JsonSerializable):
    """Top-level envelope. Exactly one of ``plan`` / ``ambiguity`` / ``error`` is set."""

    schema: str
    canonical_branch: str
    requested_slug: str | None
    resolved_slug: str | None
    requested_target: str | None
    requested_from_branch: str | None
    requested_from_file: str | None
    status: PlanStatus
    plan: ClaimPlan | None
    ambiguity: ClaimPlanAmbiguity | None
    error: ClaimPlanError | None


def render_claim_plan(result: ClaimPlanResult) -> None:
    click.echo(f"claim-plan ({result.schema}): status={result.status}")
    if result.status == "plan" and result.plan is not None:
        click.echo(
            f"  slug:   {result.plan.slug}\n"
            f"  target: {result.plan.target_branch}\n"
            f"  source: {result.plan.source.label}"
        )
    elif result.status == "ambiguous" and result.ambiguity is not None:
        click.echo(f"  ambiguity: {result.ambiguity.reason}")
        click.echo(f"  message: {result.ambiguity.message}")
        for s in result.ambiguity.slug_alternatives:
            click.echo(f"    - slug={s.slug} (on {s.available_on_branch})")
        for b in result.ambiguity.branch_alternatives:
            click.echo(f"    - branch={b.branch} (distance {b.distance})")
    elif result.status == "error" and result.error is not None:
        click.echo(f"  error: {result.error.reason}")
        click.echo(f"  message: {result.error.message}")


@clinkr_operation(
    name="claim-plan",
    help=(
        "Plan a one-slug objective claim deterministically. Resolves target, "
        "checks for slug collision, walks ancestor brmem snapshots to suggest "
        "candidate slugs when none was supplied, and selects the source via "
        "the locked cascade: local file -> --from branch -> nearest live "
        "ancestor branch -> canonical master. Returns a structured envelope "
        "containing exactly one of `plan`, `ambiguity`, or `error`. Prefer "
        "`objective exec claim` for the high-level agent workflow."
    ),
    human_renderer=render_claim_plan,
)
def run_claim_plan_objective(
    ctx: click.Context,
    request: ClaimPlanRequest,
) -> ClinkrExit[ClaimPlanResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    return ClinkrExit.ok(plan_claim_objective(mctx, request))


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
    return ClaimPlanResult(
        schema=PLAN_SCHEMA,
        canonical_branch=trunk_branch,
        requested_slug=requested_slug,
        resolved_slug=resolved_slug,
        requested_target=request.target,
        requested_from_branch=request.from_branch,
        requested_from_file=request.from_file,
        status=status,
        plan=plan,
        ambiguity=ambiguity,
        error=error,
    )


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
