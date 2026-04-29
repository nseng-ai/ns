"""``objective exec create-write`` — atomic re-validate + brmem write.

Runs the same hard preconditions and slug checks as ``create-precheck`` so a
race between precheck and write is caught, then performs the canonical
``brmem put`` writes for ``<slug>/body.md`` and (optionally)
``<slug>/roadmap.md`` in that fixed order. The agent supplies prose via
on-disk file paths; this command does not load templates, parse Markdown,
infer scope, or generate slug names.

Atomicity contract: if only ``--body-file`` is supplied, only ``body.md`` is
written. If ``--roadmap-file`` is also supplied, both files are pre-validated
(exists, readable, decodable as UTF-8) before any write so the second file
cannot fail after the first has landed for a trivial reason. If a write
itself fails for an unforeseeable reason (filesystem, brmem internals) after
``body.md`` has succeeded, the structured failure carries the body's commit
SHA so the skill can render a recovery hint. Brmem is append-only; rollback
would require additional writes that themselves could fail, so we surface
the partial-success state and stop. See "atomic write semantics" in
``docs/objective-system-canonicalization-plan.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.create_validation import (
    slug_collides_on_trunk,
    validate_slug_format,
)
from twerk_objectives.discovery import (
    BODY_FILE,
    ROADMAP_FILE,
    body_key,
    roadmap_key,
)
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE

WRITE_SCHEMA = "create-write/v1"

WriteStatus = Literal["ok", "error"]
WriteErrorReason = Literal[
    "invalid_slug_format",
    "slug_collision",
    "body_file_unreadable",
    "roadmap_file_unreadable",
    "partial_write",
]


@dataclass(frozen=True)
class CreateWriteRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    body_file: Annotated[
        Path,
        click.Option(
            ["--body-file"],
            type=click.Path(exists=True, dir_okay=False, path_type=Path),
            required=True,
            help="Absolute path to the agent-drafted body.md content.",
        ),
    ]
    roadmap_file: Annotated[
        Path | None,
        click.Option(
            ["--roadmap-file"],
            type=click.Path(exists=True, dir_okay=False, path_type=Path),
            default=None,
            help=(
                "Optional absolute path to the agent-drafted roadmap.md content. "
                "Omit when the conversation does not yet contain a concrete slice plan."
            ),
        ),
    ] = None


@dataclass(frozen=True)
class WrittenFile(JsonSerializable):
    """One file landed on canonical ``master``."""

    file: str
    key: str
    commit_sha: str


@dataclass(frozen=True)
class CreateWriteError(JsonSerializable):
    """Structured failure payload.

    ``partial_write`` carries ``files_written`` (the subset that succeeded
    before the failing write) so the skill can render a recovery hint.
    Other reasons leave ``files_written`` empty.
    """

    reason: WriteErrorReason
    message: str
    files_written: tuple[WrittenFile, ...]


@dataclass(frozen=True)
class CreateWriteResult(JsonSerializable):
    """Top-level envelope. Exactly one of ``status="ok"`` or ``status="error"``."""

    schema: str
    canonical_branch: str
    requested_slug: str
    status: WriteStatus
    slug: str | None
    target_branch: str
    files_written: tuple[WrittenFile, ...]
    error: CreateWriteError | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "canonical_branch": self.canonical_branch,
            "requested_slug": self.requested_slug,
            "status": self.status,
            "slug": self.slug,
            "target_branch": self.target_branch,
            "files_written": [
                {"file": f.file, "key": f.key, "commit_sha": f.commit_sha}
                for f in self.files_written
            ],
            "error": (
                {
                    "reason": self.error.reason,
                    "message": self.error.message,
                    "files_written": [
                        {"file": f.file, "key": f.key, "commit_sha": f.commit_sha}
                        for f in self.error.files_written
                    ],
                }
                if self.error is not None
                else None
            ),
        }


def render_create_write(result: CreateWriteResult) -> None:
    click.echo(f"create-write ({result.schema}): status={result.status}")
    click.echo(f"  slug:   {result.slug}")
    click.echo(f"  target: {result.target_branch}")
    if result.status == "ok":
        for f in result.files_written:
            click.echo(f"  wrote {f.file}: {f.commit_sha}")
    elif result.error is not None:
        click.echo(f"  error:   {result.error.reason}")
        click.echo(f"  message: {result.error.message}")
        for f in result.error.files_written:
            click.echo(f"  partially wrote {f.file}: {f.commit_sha}")


@clinkr_operation(
    name="create-write",
    help=(
        "Atomically validate and write a new canonical objective. Re-runs the "
        "create-precheck checks (repo + branch, slug format, slug collision), "
        "verifies the agent's body and (optional) roadmap files exist and are "
        "readable, then performs `brmem put` for body.md first and roadmap.md "
        "second. Returns the brmem commit SHAs. If the second write fails, "
        "surfaces a structured 'partial_write' error including the first "
        "write's SHA — brmem is append-only; this command does not roll back."
    ),
    human_renderer=render_create_write,
)
def run_create_write_objective(
    ctx: click.Context,
    request: CreateWriteRequest,
) -> ClinkrExit[CreateWriteResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway

    cwd = Path.cwd()
    if git.get_git_common_dir(cwd) is None:
        return ClinkrExit.failure(
            error_type="not_in_repo",
            message=(
                "Not inside a git repository. Run objective-create from a checked-out "
                "repo with canonical state on the trunk branch."
            ),
        )

    trunk_branch = git.get_trunk_branch()

    match git.get_current_branch(cwd):
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message=("Detached HEAD: objective-create requires a checked-out branch."),
            )
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case str():
            pass

    invalid = validate_slug_format(request.slug)
    if invalid is not None:
        return ClinkrExit.ok(
            _envelope_error(
                requested_slug=request.slug,
                trunk_branch=trunk_branch,
                reason="invalid_slug_format",
                message=invalid.message,
            )
        )

    if slug_collides_on_trunk(gateway, slug=request.slug, trunk_branch=trunk_branch):
        return ClinkrExit.ok(
            _envelope_error(
                requested_slug=request.slug,
                trunk_branch=trunk_branch,
                reason="slug_collision",
                message=(
                    f"Canonical state on {trunk_branch!r} already carries an "
                    f"objective under {request.slug!r}/. Pick a different slug or "
                    f"run `objective-update {request.slug}` to advance it."
                ),
            )
        )

    # Pre-read both inputs before any write so an unreadable roadmap can't
    # fail after body.md has already been committed for a trivial reason.
    body_content = _read_text_or_error(request.body_file)
    if isinstance(body_content, _ReadFailure):
        return ClinkrExit.ok(
            _envelope_error(
                requested_slug=request.slug,
                trunk_branch=trunk_branch,
                reason="body_file_unreadable",
                message=(
                    f"--body-file is not readable: {request.body_file}: {body_content.message}"
                ),
            )
        )

    roadmap_content: str | None = None
    if request.roadmap_file is not None:
        result = _read_text_or_error(request.roadmap_file)
        if isinstance(result, _ReadFailure):
            return ClinkrExit.ok(
                _envelope_error(
                    requested_slug=request.slug,
                    trunk_branch=trunk_branch,
                    reason="roadmap_file_unreadable",
                    message=(
                        f"--roadmap-file is not readable: {request.roadmap_file}: {result.message}"
                    ),
                )
            )
        roadmap_content = result

    body_key_value = body_key(request.slug)
    body_sha = gateway.put(OBJECTIVE_NAMESPACE, body_key_value, trunk_branch, body_content)
    files_written: list[WrittenFile] = [
        WrittenFile(file=BODY_FILE, key=body_key_value, commit_sha=body_sha),
    ]

    if roadmap_content is not None:
        roadmap_key_value = roadmap_key(request.slug)
        try:
            roadmap_sha = gateway.put(
                OBJECTIVE_NAMESPACE,
                roadmap_key_value,
                trunk_branch,
                roadmap_content,
            )
        except Exception as exc:  # noqa: BLE001 - surface any brmem failure as partial write
            return ClinkrExit.ok(
                CreateWriteResult(
                    schema=WRITE_SCHEMA,
                    canonical_branch=trunk_branch,
                    requested_slug=request.slug,
                    status="error",
                    slug=request.slug,
                    target_branch=trunk_branch,
                    files_written=tuple(files_written),
                    error=CreateWriteError(
                        reason="partial_write",
                        message=(
                            f"body.md landed at {body_sha}, but roadmap.md write "
                            f"failed: {exc}. Brmem is append-only; the body.md "
                            f"commit is permanent. Re-run with --roadmap-file alone "
                            f"is not supported by this command — use `brmem put` "
                            f"directly to recover, or run `objective-update "
                            f"{request.slug}` to advance the snapshot."
                        ),
                        files_written=tuple(files_written),
                    ),
                )
            )
        files_written.append(
            WrittenFile(file=ROADMAP_FILE, key=roadmap_key_value, commit_sha=roadmap_sha)
        )

    return ClinkrExit.ok(
        CreateWriteResult(
            schema=WRITE_SCHEMA,
            canonical_branch=trunk_branch,
            requested_slug=request.slug,
            status="ok",
            slug=request.slug,
            target_branch=trunk_branch,
            files_written=tuple(files_written),
            error=None,
        )
    )


def _envelope_error(
    *,
    requested_slug: str,
    trunk_branch: str,
    reason: WriteErrorReason,
    message: str,
) -> CreateWriteResult:
    return CreateWriteResult(
        schema=WRITE_SCHEMA,
        canonical_branch=trunk_branch,
        requested_slug=requested_slug,
        status="error",
        slug=None,
        target_branch=trunk_branch,
        files_written=(),
        error=CreateWriteError(reason=reason, message=message, files_written=()),
    )


@dataclass(frozen=True)
class _ReadFailure:
    """Internal sentinel translated into a structured envelope error."""

    message: str


def _read_text_or_error(path: Path) -> str | _ReadFailure:
    """Read ``path`` as UTF-8 text or return a structured failure.

    ``click.Path(exists=True, dir_okay=False)`` already validates existence
    at parse time. This second pass guards against a file vanishing between
    parse and read, and against permission / decoding failures.
    """
    if not path.exists() or not path.is_file():
        return _ReadFailure(message=f"path does not exist or is not a file: {path}")
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        return _ReadFailure(message=str(exc))
    except UnicodeDecodeError as exc:
        return _ReadFailure(message=f"file is not valid UTF-8: {exc}")
