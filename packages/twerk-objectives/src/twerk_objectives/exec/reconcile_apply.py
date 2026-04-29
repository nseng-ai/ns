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

from brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.exec.reconcile_plan import PLAN_SCHEMA
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.trunk_resolution import resolve_trunk


@dataclass(frozen=True)
class ReconcileApplyRequest:
    plan_file: Annotated[
        Path,
        click.Option(
            ["--plan-file"],
            type=click.Path(exists=True, dir_okay=False, path_type=Path),
            required=True,
            help="Path to the JSON envelope emitted by `objective exec reconcile-plan`, "
            "extended in-place by the agent with `proposed_writes` per slug.",
        ),
    ]


@dataclass(frozen=True)
class FileWriteResult(JsonSerializable):
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


@dataclass(frozen=True)
class FileWriteSkip(JsonSerializable):
    """A proposed write that did not run (drift, missing file, error)."""

    file: str
    key: str
    reason: str


@dataclass(frozen=True)
class SlugApplyResult(JsonSerializable):
    slug: str
    writes: tuple[FileWriteResult, ...]
    skipped: tuple[FileWriteSkip, ...]
    gaps: tuple[str, ...]


@dataclass(frozen=True)
class ReconcileApplyResult(JsonSerializable):
    schema: str
    canonical_branch: str
    slugs: tuple[SlugApplyResult, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "canonical_branch": self.canonical_branch,
            "slugs": [
                {
                    "slug": s.slug,
                    "writes": [
                        {
                            "file": w.file,
                            "key": w.key,
                            "old_blob_sha": w.old_blob_sha,
                            "old_head_sha": w.old_head_sha,
                            "new_head_sha": w.new_head_sha,
                            "recovery_command": w.recovery_command,
                        }
                        for w in s.writes
                    ],
                    "skipped": [
                        {"file": k.file, "key": k.key, "reason": k.reason} for k in s.skipped
                    ],
                    "gaps": list(s.gaps),
                }
                for s in self.slugs
            ],
        }


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
        "Reads each slug's `proposed_writes` (paths added to the envelope "
        "by the agent), verifies `expected_old_sha` against canonical, "
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
            message=(f"Plan-file schema {schema!r} does not match expected {PLAN_SCHEMA!r}."),
        )

    canonical_branch = envelope.get("canonical_branch")
    if canonical_branch != trunk:
        return ClinkrExit.failure(
            error_type="schema_mismatch",
            message=(
                f"Plan-file canonical_branch {canonical_branch!r} does not match "
                f"expected {trunk!r}."
            ),
        )

    raw_slugs = envelope.get("slugs", [])
    if not isinstance(raw_slugs, list):
        return ClinkrExit.failure(
            error_type="malformed_plan_file",
            message="Plan-file 'slugs' must be a JSON array.",
        )

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
