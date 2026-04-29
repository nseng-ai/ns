"""``objective exec claim-apply`` — apply a claim plan to the target branch.

Reads the JSON envelope produced by ``objective exec claim-plan`` and
executes the resolved carry-forward in one step:

- Branch source -> ``brmem copy --key-glob '<slug>/*'`` carries every file
  present under ``<slug>/`` from the source branch.
- Local-file source -> ``brmem put`` writes the file at ``from_file_path``
  to ``<slug>/body.md`` on the target branch (no synthesized siblings).

Apply re-validates the plan before mutating: target must still be free for
the slug, source must still carry ``<slug>/body.md`` (for branch sources),
and the local file must still exist and be readable. Any drift since plan
time fails the operation with a clear error.

Whole-run preconditions (missing/malformed plan-file, schema mismatch, plan
status != "plan") are hard failures.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from brmem.gateway import BranchMemoryGateway, snapshot_ref_name
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import body_key, slug_for_key
from twerk_objectives.exec.claim_plan import PLAN_SCHEMA
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE


@dataclass(frozen=True)
class _HardFailure:
    """Domain-side sentinel translated to ``ClinkrExit.failure`` at the entry point."""

    error_type: str
    message: str


@dataclass(frozen=True)
class ClaimApplyRequest:
    plan_file: Annotated[
        Path,
        click.Option(
            ["--plan-file"],
            type=click.Path(exists=True, dir_okay=False, path_type=Path),
            required=True,
            help="Path to the JSON envelope emitted by `objective exec claim-plan`.",
        ),
    ]


@dataclass(frozen=True)
class CarriedFile(JsonSerializable):
    """One file landed on the target branch by the apply."""

    file: str
    key: str


@dataclass(frozen=True)
class ClaimApplyResult(JsonSerializable):
    """Outcome of a successful apply (one slug, one target branch)."""

    schema: str
    slug: str
    target_branch: str
    source_kind: str
    source_branch: str | None
    source_label: str
    files_carried: tuple[CarriedFile, ...]
    destination_ref: str
    destination_commit_sha: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "slug": self.slug,
            "target_branch": self.target_branch,
            "source_kind": self.source_kind,
            "source_branch": self.source_branch,
            "source_label": self.source_label,
            "files_carried": [{"file": f.file, "key": f.key} for f in self.files_carried],
            "destination_ref": self.destination_ref,
            "destination_commit_sha": self.destination_commit_sha,
        }


def render_claim_apply(result: ClaimApplyResult) -> None:
    click.echo(f"claim-apply ({result.schema})")
    click.echo(f"  slug:   {result.slug}")
    click.echo(f"  target: {result.target_branch}")
    click.echo(f"  source: {result.source_label}")
    click.echo(f"  files:  {', '.join(f.file for f in result.files_carried)}")
    click.echo(f"  ref:    {result.destination_ref}")
    click.echo(f"  sha:    {result.destination_commit_sha}")


@clinkr_operation(
    name="claim-apply",
    help=(
        "Apply a claim plan to the target branch. Re-validates the plan "
        "before mutating (target empty for the slug, source still carries "
        "<slug>/body.md, local file still readable), then performs `brmem "
        "copy` for branch sources or `brmem put` for local-file sources. "
        "Returns destination ref / commit SHA + files actually carried."
    ),
    human_renderer=render_claim_apply,
)
def run_claim_apply_objective(
    ctx: click.Context,
    request: ClaimApplyRequest,
) -> ClinkrExit[ClaimApplyResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    trunk_branch = mctx.git_gateway.get_trunk_branch()

    raw = request.plan_file.read_text(encoding="utf-8")
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError as exc:
        return ClinkrExit.failure(
            error_type="malformed_plan_file",
            message=f"Plan file is not valid JSON: {exc}",
        )

    if not isinstance(envelope, dict):
        return ClinkrExit.failure(
            error_type="malformed_plan_file",
            message="Plan file must be a JSON object envelope.",
        )

    schema = envelope.get("schema")
    if schema != PLAN_SCHEMA:
        return ClinkrExit.failure(
            error_type="schema_mismatch",
            message=f"Plan-file schema {schema!r} does not match expected {PLAN_SCHEMA!r}.",
        )

    canonical_branch = envelope.get("canonical_branch")
    if canonical_branch != trunk_branch:
        return ClinkrExit.failure(
            error_type="schema_mismatch",
            message=(
                f"Plan-file canonical_branch {canonical_branch!r} does not match "
                f"expected {trunk_branch!r}."
            ),
        )

    status = envelope.get("status")
    if status != "plan":
        return ClinkrExit.failure(
            error_type="not_a_plan",
            message=(
                f"Plan-file status is {status!r}; claim-apply requires status='plan'. "
                f"Resolve the ambiguity or error first via claim-plan."
            ),
        )

    plan = envelope.get("plan")
    if not isinstance(plan, dict):
        return ClinkrExit.failure(
            error_type="malformed_plan_file",
            message="Plan-file 'plan' field must be a JSON object.",
        )

    parsed = _parse_plan_block(plan)
    if isinstance(parsed, _HardFailure):
        return ClinkrExit.failure(error_type=parsed.error_type, message=parsed.message)
    slug, target_branch, source_kind, source_branch, source_label, from_file_path = parsed

    # Re-validate: target free for slug.
    if _target_carries_slug(gateway, slug=slug, branch=target_branch):
        return ClinkrExit.failure(
            error_type="target_collision",
            message=(
                f"Target branch {target_branch!r} now carries keys under "
                f"{slug!r}/. Use objective-update or objective-reconcile to "
                f"advance the existing snapshot, or claim a different target."
            ),
        )

    if source_kind == "local_file":
        if from_file_path is None:
            return ClinkrExit.failure(
                error_type="malformed_plan_file",
                message="Local-file plan must carry 'plan.source.from_file_path'.",
            )
        path = Path(from_file_path)
        if not path.exists() or not path.is_file():
            return ClinkrExit.failure(
                error_type="from_file_unreadable",
                message=(
                    f"Local-file source path no longer exists or is not a file: {from_file_path}"
                ),
            )
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as exc:
            return ClinkrExit.failure(
                error_type="from_file_unreadable",
                message=f"Local-file source is not readable: {from_file_path}: {exc}",
            )
        body_key_value = body_key(slug)
        commit_sha = gateway.put(OBJECTIVE_NAMESPACE, body_key_value, target_branch, content)
        ref_name = _ref_name(target_branch)
        return ClinkrExit.ok(
            ClaimApplyResult(
                schema=PLAN_SCHEMA,
                slug=slug,
                target_branch=target_branch,
                source_kind=source_kind,
                source_branch=None,
                source_label=source_label,
                files_carried=(CarriedFile(file="body.md", key=body_key_value),),
                destination_ref=ref_name,
                destination_commit_sha=commit_sha,
            )
        )

    # Branch source (kind in {"branch", "canonical"}).
    if source_branch is None:
        return ClinkrExit.failure(
            error_type="malformed_plan_file",
            message="Branch-source plan must carry 'plan.source.branch'.",
        )

    # Re-validate: source still carries <slug>/body.md.
    diagnostic = gateway.check(OBJECTIVE_NAMESPACE, body_key(slug), source_branch)
    if diagnostic is None:
        return ClinkrExit.failure(
            error_type="source_missing_slug",
            message=(
                f"Source branch {source_branch!r} no longer carries "
                f"{body_key(slug)!r}; the snapshot may have been deleted "
                f"since plan time."
            ),
        )

    copied = gateway.copy_entries(
        namespace=OBJECTIVE_NAMESPACE,
        from_branch=source_branch,
        to_branch=target_branch,
        overwrite=False,
        key_glob=f"{slug}/*",
    )
    if not copied:
        return ClinkrExit.failure(
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
    return ClinkrExit.ok(
        ClaimApplyResult(
            schema=PLAN_SCHEMA,
            slug=slug,
            target_branch=target_branch,
            source_kind=source_kind,
            source_branch=source_branch,
            source_label=source_label,
            files_carried=files_carried,
            destination_ref=ref_name,
            destination_commit_sha=commit_sha,
        )
    )


def _parse_plan_block(
    plan: dict[str, Any],
) -> tuple[str, str, str, str | None, str, str | None] | _HardFailure:
    """Extract ``(slug, target_branch, kind, branch, label, from_file_path)`` from the plan dict."""
    slug = plan.get("slug")
    target_branch = plan.get("target_branch")
    source = plan.get("source")
    if not isinstance(slug, str) or not slug:
        return _HardFailure(
            error_type="malformed_plan_file",
            message="Plan 'slug' must be a non-empty string.",
        )
    if not isinstance(target_branch, str) or not target_branch:
        return _HardFailure(
            error_type="malformed_plan_file",
            message="Plan 'target_branch' must be a non-empty string.",
        )
    if not isinstance(source, dict):
        return _HardFailure(
            error_type="malformed_plan_file",
            message="Plan 'source' must be a JSON object.",
        )

    kind = source.get("kind")
    if kind not in ("local_file", "branch", "canonical"):
        return _HardFailure(
            error_type="malformed_plan_file",
            message=f"Plan source.kind {kind!r} is not a recognized SourceKind.",
        )

    label = source.get("label")
    if not isinstance(label, str):
        return _HardFailure(
            error_type="malformed_plan_file",
            message="Plan source.label must be a string.",
        )

    branch = source.get("branch")
    if branch is not None and not isinstance(branch, str):
        return _HardFailure(
            error_type="malformed_plan_file",
            message="Plan source.branch must be a string or null.",
        )

    from_file_path = source.get("from_file_path")
    if from_file_path is not None and not isinstance(from_file_path, str):
        return _HardFailure(
            error_type="malformed_plan_file",
            message="Plan source.from_file_path must be a string or null.",
        )

    return slug_for_key(slug), target_branch, kind, branch, label, from_file_path


def _target_carries_slug(
    gateway: BranchMemoryGateway,
    *,
    slug: str,
    branch: str,
) -> bool:
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)
    return any(slug_for_key(entry.key) == slug for entry in entries)


def _filename_for_key(key: str, slug: str) -> str:
    prefix = f"{slug}/"
    if key.startswith(prefix):
        return key[len(prefix) :]
    return key


def _ref_name(branch: str) -> str:
    """Return the brmem snapshot ref for the target branch.

    Branch encoding is owned by brmem; we delegate to
    :func:`brmem.gateway.snapshot_ref_name` instead of formatting the string
    locally so the encoding stays consistent if brmem ever changes the ref
    shape.
    """
    return snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)
