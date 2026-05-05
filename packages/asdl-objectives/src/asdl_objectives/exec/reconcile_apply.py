"""``objective exec reconcile-apply`` — apply a reconcile plan serially.

Reads the JSON envelope produced by ``objective exec reconcile-plan`` plus
the agent-authored conservatively-rewritten Markdown files referenced from
disk, verifies each canonical file's SHA still matches the plan's
``expected_old_sha``, and writes the new content via ``brmem put`` to
canonical ``master`` one file at a time.

The serial write order — slug order in the plan, file order within each
slug — is the contract: all canonical objective files share the
``refs/brmem/ns/objectives/<encoded-master>`` snapshot ref, so parallelized
writes silently clobber each other. This serialization is enforced by the
code, not by skill prose.

Per-slug failures (drift, missing proposed file, malformed entry) become
gaps in the result envelope; the loop continues to the next slug. Whole-run
preconditions (missing/malformed plan-file, schema mismatch) are
hard failures.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel, ClinkrSchemaModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import BODY_FILE, NOTES_FILE, ROADMAP_FILE
from asdl_objectives.exec.reconcile_plan import PLAN_SCHEMA
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway


class ReconcileApplyRequest(ClinkrModel):
    plan_file: Annotated[
        Path,
        click.Option(
            ["--plan-file"],
            type=click.Path(exists=True, dir_okay=False, path_type=Path),
            required=True,
            help="Path to the JSON envelope emitted by `objective exec reconcile-plan`.",
        ),
    ]
    proposed_dir: Annotated[
        Path | None,
        click.Option(
            ["--proposed-dir"],
            type=click.Path(file_okay=False, path_type=Path),
            required=False,
            default=None,
            help=(
                "Directory containing <slug>/<file>.proposed files. Mutually exclusive "
                "with plan-file proposed_writes."
            ),
        ),
    ] = None


class FileWriteResult(ClinkrModel):
    """Result of one ``brmem put`` to canonical ``master``.

    ``old_head_sha`` is the snapshot commit SHA before this write — used
    to construct the recovery hint. ``new_head_sha`` is the commit SHA
    returned by ``brmem put``. ``old_blob_sha`` is the per-file content
    blob SHA that was matched against ``expected_old_blob_sha`` in the
    plan (the drift gate).
    """

    file: str
    key: str
    old_blob_sha: str | None
    old_head_sha: str | None
    new_head_sha: str
    recovery_command: str


class FileWriteSkip(ClinkrModel):
    """A proposed write that did not run (drift, missing file, error)."""

    file: str
    key: str
    reason: str


class SlugApplyResult(ClinkrModel):
    slug: str
    writes: tuple[FileWriteResult, ...]
    skipped: tuple[FileWriteSkip, ...]
    gaps: tuple[str, ...]


class ReconcileApplyResult(ClinkrSchemaModel):
    canonical_branch: str
    slugs: tuple[SlugApplyResult, ...]


def render_reconcile_apply(result: ReconcileApplyResult) -> None:
    total_writes = sum(len(s.writes) for s in result.slugs)
    total_skipped = sum(len(s.skipped) for s in result.slugs)
    click.echo(f"reconcile-apply ({result.schema}): {len(result.slugs)} slug(s)")
    click.echo(f"  total writes: {total_writes}, skipped: {total_skipped}")
    for s in result.slugs:
        if not s.writes and not s.skipped and not s.gaps:
            continue
        click.echo(f"- {s.slug}")
        for w in s.writes:
            old = w.old_head_sha or "(absent)"
            click.echo(f"  wrote {w.file}: {old} -> {w.new_head_sha}")
        for k in s.skipped:
            click.echo(f"  skipped {k.file}: {k.reason}")
        for g in s.gaps:
            click.echo(f"  gap: {g}")


@clinkr_operation(
    name="reconcile-apply",
    help=(
        "Apply a reconcile plan-file serially to canonical `master`. "
        "Reads each slug's `proposed_writes` or discovers <slug>/<file>.proposed "
        "under --proposed-dir, verifies `expected_old_sha` against canonical, "
        "then runs `brmem put` one file at a time. Per-slug failures are "
        "gaps; only schema or plan-file shape errors are hard failures."
    ),
    human_renderer=render_reconcile_apply,
)
def run_reconcile_apply_objective(
    ctx: click.Context,
    request: ReconcileApplyRequest,
) -> ClinkrExit[ReconcileApplyResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    trunk = resolve_trunk(mctx.git_gateway).trunk

    raw = request.plan_file.read_text(encoding="utf-8")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ClinkrFailure(
            error_type="malformed_plan_file",
            message=f"Plan file is not valid JSON: {exc}",
        ) from exc

    raw_envelope = Ensure.inst(
        parsed,
        dict,
        error_type="malformed_plan_file",
        message="Plan file must be a JSON object envelope.",
    )
    envelope = _extract_plan_envelope(raw_envelope)

    canonical_branch = envelope.get("canonical_branch")
    Ensure.true(
        canonical_branch == trunk,
        error_type="schema_mismatch",
        message=(
            f"Plan-file canonical_branch {canonical_branch!r} does not match expected {trunk!r}."
        ),
    )

    raw_slugs = Ensure.inst(
        envelope.get("slugs", []),
        list,
        error_type="malformed_plan_file",
        message="Plan-file 'slugs' must be a JSON array.",
    )

    if request.proposed_dir is not None:
        raw_slugs = _slugs_with_proposed_dir(raw_slugs, proposed_dir=request.proposed_dir)

    slug_results: list[SlugApplyResult] = []
    for raw_slug in raw_slugs:
        if not isinstance(raw_slug, dict):
            slug_results.append(
                SlugApplyResult(
                    slug="<unknown>",
                    writes=(),
                    skipped=(),
                    gaps=("malformed slug entry: not an object",),
                )
            )
            continue
        slug_results.append(_apply_slug_plan(gateway=gateway, raw_slug=raw_slug, trunk=trunk))

    return ClinkrExit.ok(
        ReconcileApplyResult(
            schema=PLAN_SCHEMA,
            canonical_branch=trunk,
            slugs=tuple(slug_results),
        )
    )


def _extract_plan_envelope(raw_envelope: dict[str, Any]) -> dict[str, Any]:
    if raw_envelope.get("schema") == PLAN_SCHEMA:
        return raw_envelope

    data = raw_envelope.get("data")
    if isinstance(data, dict) and data.get("schema") == PLAN_SCHEMA:
        return data

    found_schema = raw_envelope.get("schema")
    if found_schema is None and isinstance(data, dict):
        found_schema = data.get("schema")
    raise ClinkrFailure(
        error_type="schema_mismatch",
        message=(
            "Plan file must contain schema 'reconcile-plan/v1' either as the raw "
            "plan object or as a clinkr JSON envelope at data.schema; "
            f"found {found_schema!r}."
        ),
    )


def _slugs_with_proposed_dir(
    raw_slugs: list[Any],
    *,
    proposed_dir: Path,
) -> list[Any]:
    if not proposed_dir.exists() or not proposed_dir.is_dir():
        raise ClinkrFailure(
            error_type="proposed_dir_missing",
            message=f"Proposed directory does not exist or is not a directory: {proposed_dir}",
        )

    slug_names = {raw_slug.get("slug") for raw_slug in raw_slugs if isinstance(raw_slug, dict)}
    for raw_slug in raw_slugs:
        if not isinstance(raw_slug, dict):
            continue
        proposed_writes = raw_slug.get("proposed_writes", [])
        if proposed_writes:
            raise ClinkrFailure(
                error_type="ambiguous_proposed_writes",
                message=(
                    "Do not combine --proposed-dir with plan-file proposed_writes; "
                    "remove one input source."
                ),
            )

    discovered = _discover_proposed_writes(proposed_dir, slug_names=slug_names)
    enriched: list[Any] = []
    for raw_slug in raw_slugs:
        if not isinstance(raw_slug, dict):
            enriched.append(raw_slug)
            continue
        slug = raw_slug.get("slug")
        if not isinstance(slug, str):
            enriched.append(raw_slug)
            continue
        copied = dict(raw_slug)
        copied["proposed_writes"] = discovered.get(slug, [])
        enriched.append(copied)
    return enriched


_KNOWN_OBJECTIVE_FILES = (BODY_FILE, ROADMAP_FILE, NOTES_FILE)


def _discover_proposed_writes(
    proposed_dir: Path,
    *,
    slug_names: set[Any],
) -> dict[str, list[dict[str, str]]]:
    by_slug: dict[str, dict[str, Path]] = {}
    for path in sorted(proposed_dir.rglob("*.proposed")):
        relative = path.relative_to(proposed_dir)
        if len(relative.parts) != 2:
            raise ClinkrFailure(
                error_type="unknown_proposed_file",
                message=(
                    f"Proposed files must use <slug>/<file>.proposed layout; found {relative}"
                ),
            )
        slug, proposed_name = relative.parts
        if slug not in slug_names:
            raise ClinkrFailure(
                error_type="unknown_proposed_file",
                message=f"Proposed file {relative} references slug {slug!r} not present in plan.",
            )
        file = proposed_name.removesuffix(".proposed")
        if file not in _KNOWN_OBJECTIVE_FILES:
            raise ClinkrFailure(
                error_type="unknown_proposed_file",
                message=(
                    f"Unknown proposed objective file {relative}; expected one of "
                    f"{', '.join(_KNOWN_OBJECTIVE_FILES)}."
                ),
            )
        by_slug.setdefault(slug, {})[file] = path

    discovered: dict[str, list[dict[str, str]]] = {}
    for slug, paths_by_file in by_slug.items():
        discovered[slug] = [
            {"file": file, "proposed_path": str(paths_by_file[file])}
            for file in _KNOWN_OBJECTIVE_FILES
            if file in paths_by_file
        ]
    return discovered


def _apply_slug_plan(
    *,
    gateway: BranchMemoryGateway,
    raw_slug: dict[str, Any],
    trunk: str,
) -> SlugApplyResult:
    slug = raw_slug.get("slug")
    if not isinstance(slug, str) or not slug:
        return SlugApplyResult(
            slug="<unknown>",
            writes=(),
            skipped=(),
            gaps=("malformed slug entry: missing 'slug' field",),
        )

    proposed = raw_slug.get("proposed_writes", [])
    if not isinstance(proposed, list):
        return SlugApplyResult(
            slug=slug,
            writes=(),
            skipped=(),
            gaps=("'proposed_writes' must be a JSON array",),
        )

    canonical_files = raw_slug.get("canonical_files", [])
    if not isinstance(canonical_files, list):
        return SlugApplyResult(
            slug=slug,
            writes=(),
            skipped=(),
            gaps=("'canonical_files' must be a JSON array",),
        )

    expected_by_file: dict[str, _CanonicalFileExpectation] = {}
    for cf in canonical_files:
        if not isinstance(cf, dict):
            continue
        file = cf.get("file")
        key = cf.get("key")
        if not isinstance(file, str) or not isinstance(key, str):
            continue
        expected_old_blob_sha = cf.get("expected_old_blob_sha")
        if expected_old_blob_sha is not None and not isinstance(expected_old_blob_sha, str):
            continue
        expected_old_head_sha = cf.get("expected_old_head_sha")
        if expected_old_head_sha is not None and not isinstance(expected_old_head_sha, str):
            continue
        expected_by_file[file] = _CanonicalFileExpectation(
            key=key,
            expected_old_blob_sha=expected_old_blob_sha,
            expected_old_head_sha=expected_old_head_sha,
        )

    writes: list[FileWriteResult] = []
    skipped: list[FileWriteSkip] = []
    gaps: list[str] = []

    for entry in proposed:
        write_result, skip_result, gap = _apply_one_write(
            gateway=gateway,
            slug=slug,
            entry=entry,
            expected_by_file=expected_by_file,
            trunk=trunk,
        )
        if write_result is not None:
            writes.append(write_result)
        if skip_result is not None:
            skipped.append(skip_result)
        if gap is not None:
            gaps.append(gap)

    return SlugApplyResult(
        slug=slug,
        writes=tuple(writes),
        skipped=tuple(skipped),
        gaps=tuple(gaps),
    )


@dataclass(frozen=True)
class _CanonicalFileExpectation:
    key: str
    expected_old_blob_sha: str | None
    expected_old_head_sha: str | None


def _apply_one_write(
    *,
    gateway: BranchMemoryGateway,
    slug: str,
    entry: Any,
    expected_by_file: dict[str, _CanonicalFileExpectation],
    trunk: str,
) -> tuple[FileWriteResult | None, FileWriteSkip | None, str | None]:
    """Apply a single proposed write. Returns (write, skip, gap) — at most one set.

    A write is a successful ``brmem put``. A skip is a per-file refusal that
    is part of the protocol (drift, expected SHA missing). A gap is a per-
    slug-level note about a malformed entry.
    """
    if not isinstance(entry, dict):
        return None, None, "malformed proposed write: not an object"

    file = entry.get("file")
    if not isinstance(file, str) or not file:
        return None, None, "malformed proposed write: missing 'file'"

    proposed_path_raw = entry.get("proposed_path")
    if not isinstance(proposed_path_raw, str) or not proposed_path_raw:
        return None, None, f"malformed proposed write for {file!r}: missing 'proposed_path'"

    expectation = expected_by_file.get(file)
    if expectation is None:
        return (
            None,
            None,
            (
                f"proposed write references file {file!r} that is not in "
                f"plan canonical_files for slug {slug!r}"
            ),
        )

    proposed_path = Path(proposed_path_raw)
    if not proposed_path.exists():
        return (
            None,
            FileWriteSkip(
                file=file,
                key=expectation.key,
                reason=f"proposed file not found on disk: {proposed_path}",
            ),
            None,
        )

    try:
        new_content = proposed_path.read_text(encoding="utf-8")
    except OSError as exc:
        return (
            None,
            FileWriteSkip(
                file=file,
                key=expectation.key,
                reason=f"cannot read proposed file {proposed_path}: {exc}",
            ),
            None,
        )

    # Drift detection runs on the per-file blob sha so that a previous
    # within-slug write (which advanced the snapshot ref) does not look
    # like external drift on a sibling file.
    diagnostic = gateway.check(OBJECTIVE_NAMESPACE, expectation.key, trunk)
    actual_blob_sha = diagnostic.blob_sha if diagnostic is not None else None
    actual_head_sha = diagnostic.head_sha if diagnostic is not None else None
    if actual_blob_sha != expectation.expected_old_blob_sha:
        return (
            None,
            FileWriteSkip(
                file=file,
                key=expectation.key,
                reason=(
                    f"canonical drift detected: expected blob_sha "
                    f"{expectation.expected_old_blob_sha!r}, found "
                    f"{actual_blob_sha!r}"
                ),
            ),
            None,
        )

    new_head_sha = gateway.put(OBJECTIVE_NAMESPACE, expectation.key, trunk, new_content)
    recovery = _recovery_command(
        key=expectation.key,
        old_head_sha=actual_head_sha,
        trunk=trunk,
    )
    return (
        FileWriteResult(
            file=file,
            key=expectation.key,
            old_blob_sha=actual_blob_sha,
            old_head_sha=actual_head_sha,
            new_head_sha=new_head_sha,
            recovery_command=recovery,
        ),
        None,
        None,
    )


def _recovery_command(*, key: str, old_head_sha: str | None, trunk: str) -> str:
    """Mirror the existing reconcile skill's recovery hint format."""
    if old_head_sha is None:
        return f"# nothing to recover: {key} had no prior canonical content"
    return f"brmem get {key} --namespace {OBJECTIVE_NAMESPACE} --branch {trunk} --at {old_head_sha}"
