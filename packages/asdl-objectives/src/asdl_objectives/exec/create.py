"""``objective exec create`` — validate and write a new canonical objective.

One command serves both phases of ``objective-create``:

* ``--dry-run`` runs only the validation phase (repo + non-detached HEAD,
  slug format, slug collision on canonical trunk) so the skill can fail
  fast on a bad slug before drafting prose.
* Without ``--dry-run`` the same validation runs immediately before the
  brmem writes — body.md first, then roadmap.md when ``--roadmap-file`` is
  supplied. Both files are pre-read before any write so an unreadable
  roadmap cannot fail after body.md has already landed for a trivial
  reason.

If the roadmap write itself fails after body.md has succeeded, the command
raises a hard failure whose message carries the body.md commit SHA and a
recovery hint. Brmem is append-only; this command does not roll back.

Per "Markdown prose is not schema" in
``docs/objective-system-canonicalization-plan.md``: this command does not
load templates, draft prose, parse Markdown, or generate slug names — the
agent supplies the slug and the body/roadmap content via on-disk files.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrJsonSchemaModel, ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.create_validation import (
    slug_collides_on_trunk,
    validate_slug_format,
)
from asdl_objectives.discovery import (
    BODY_FILE,
    ROADMAP_FILE,
    body_key,
    roadmap_key,
)
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE

CREATE_SCHEMA = "create/v1"

CreateStatus = Literal["ok", "error"]
CreateErrorReason = Literal[
    "invalid_slug_format",
    "slug_collision",
    "body_file_unreadable",
    "roadmap_file_unreadable",
]


class CreateRequest(ClinkrModel):
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    body_file: Annotated[
        Path | None,
        click.Option(
            ["--body-file"],
            type=click.Path(exists=True, dir_okay=False, path_type=Path),
            default=None,
            help="Absolute path to the agent-drafted body.md content. Required unless --dry-run.",
        ),
    ] = None
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
    dry_run: Annotated[
        bool,
        click.Option(
            ["--dry-run"],
            is_flag=True,
            default=False,
            help=(
                "Validate only (repo + slug format + slug collision on canonical trunk); "
                "do not perform any brmem writes."
            ),
        ),
    ] = False


class WrittenFile(ClinkrModel):
    """One file landed on canonical trunk."""

    file: str
    key: str
    commit_sha: str


class CreateError(ClinkrModel):
    """Structured "skill can recover" payload."""

    reason: CreateErrorReason
    message: str


class CreateResult(ClinkrJsonSchemaModel):
    """Top-level envelope. Exactly one of ``status="ok"`` or ``status="error"``.

    ``files_written`` is empty in dry-run and error cases; non-empty only on
    a successful real write.
    """

    canonical_branch: str
    requested_slug: str
    dry_run: bool
    status: CreateStatus
    slug: str | None
    files_written: tuple[WrittenFile, ...]
    error: CreateError | None


def render_create(result: CreateResult) -> None:
    label = "create (dry-run)" if result.dry_run else "create"
    click.echo(f"{label} ({result.json_schema}): status={result.status}")
    if result.status == "ok":
        click.echo(f"  slug:   {result.slug}")
        click.echo(f"  target: {result.canonical_branch}")
        for f in result.files_written:
            click.echo(f"  wrote {f.file}: {f.commit_sha}")
    elif result.error is not None:
        click.echo(f"  error:   {result.error.reason}")
        click.echo(f"  message: {result.error.message}")


@clinkr_operation(
    name="create",
    help=(
        "Validate and write a new canonical objective in one step. Confirms "
        "repo + non-detached HEAD, slug format (lowercase ASCII, hyphen-"
        "separated, <=50 chars, no 'objective-' prefix, no 'body.md' suffix), "
        "and absence of an existing canonical snapshot under <slug>/ on the "
        "trunk branch. With --body-file (and optional --roadmap-file), "
        "performs `brmem put` for body.md first and roadmap.md second; with "
        "--dry-run, runs only the validation phase. Recoverable conditions "
        "(invalid slug, collision, unreadable file) surface as status='error' "
        "in the JSON envelope; hard preconditions and post-body roadmap-write "
        "failures exit with ClinkrExit.failure (the failure message carries "
        "body.md's commit SHA and a recovery hint)."
    ),
    human_renderer=render_create,
)
def run_create_objective(
    ctx: click.Context,
    request: CreateRequest,
) -> ClinkrExit[CreateResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway

    cwd = Path.cwd()
    if git.get_git_common_dir(cwd) is None:
        raise ClinkrFailure(
            error_type="not_in_repo",
            message=(
                "Not inside a git repository. Run objective-create from a checked-out "
                "repo with canonical state on the trunk branch."
            ),
        )

    trunk_branch = git.get_trunk_branch()

    match git.get_current_branch(cwd):
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message=(
                    "Detached HEAD: objective-create requires a checked-out branch "
                    "so the agent has stable context. Canonical writes always go to "
                    f"{trunk_branch!r} regardless of the current branch."
                ),
            )
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case str():
            pass

    if not request.dry_run and request.body_file is None:
        raise ClinkrFailure(
            error_type="body_file_required",
            message="--body-file is required unless --dry-run is supplied.",
        )

    invalid = validate_slug_format(request.slug)
    if invalid is not None:
        return ClinkrExit.ok(
            _envelope_error(
                requested_slug=request.slug,
                trunk_branch=trunk_branch,
                dry_run=request.dry_run,
                reason="invalid_slug_format",
                message=invalid.message,
            )
        )

    if slug_collides_on_trunk(gateway, slug=request.slug, trunk_branch=trunk_branch):
        return ClinkrExit.ok(
            _envelope_error(
                requested_slug=request.slug,
                trunk_branch=trunk_branch,
                dry_run=request.dry_run,
                reason="slug_collision",
                message=(
                    f"Canonical state on {trunk_branch!r} already carries an "
                    f"objective under {request.slug!r}/. Pick a different slug or "
                    f"run `objective-update {request.slug}` to advance the existing one."
                ),
            )
        )

    if request.dry_run:
        return ClinkrExit.ok(
            CreateResult(
                json_schema=CREATE_SCHEMA,
                canonical_branch=trunk_branch,
                requested_slug=request.slug,
                dry_run=True,
                status="ok",
                slug=request.slug,
                files_written=(),
                error=None,
            )
        )

    # body_file is non-None when not dry_run (guarded above).
    body_file = request.body_file
    assert body_file is not None
    body_content = _read_text_or_error(body_file)
    if isinstance(body_content, _ReadFailure):
        return ClinkrExit.ok(
            _envelope_error(
                requested_slug=request.slug,
                trunk_branch=trunk_branch,
                dry_run=False,
                reason="body_file_unreadable",
                message=f"--body-file is not readable: {body_file}: {body_content.message}",
            )
        )

    roadmap_content: str | None = None
    if request.roadmap_file is not None:
        roadmap_read = _read_text_or_error(request.roadmap_file)
        if isinstance(roadmap_read, _ReadFailure):
            return ClinkrExit.ok(
                _envelope_error(
                    requested_slug=request.slug,
                    trunk_branch=trunk_branch,
                    dry_run=False,
                    reason="roadmap_file_unreadable",
                    message=(
                        f"--roadmap-file is not readable: {request.roadmap_file}: "
                        f"{roadmap_read.message}"
                    ),
                )
            )
        roadmap_content = roadmap_read

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
        except Exception as exc:  # noqa: BLE001 - surface any brmem failure
            raise ClinkrFailure(
                error_type="roadmap_write_failed",
                message=(
                    f"body.md landed on {trunk_branch!r} at commit {body_sha}, but "
                    f"roadmap.md write failed: {exc}. Brmem is append-only; the "
                    f"body.md commit is permanent. Run `objective-update {request.slug}` "
                    f"to advance the snapshot, or run `brmem put` directly with the "
                    f"roadmap content to recover."
                ),
            ) from exc
        files_written.append(
            WrittenFile(file=ROADMAP_FILE, key=roadmap_key_value, commit_sha=roadmap_sha)
        )

    return ClinkrExit.ok(
        CreateResult(
            json_schema=CREATE_SCHEMA,
            canonical_branch=trunk_branch,
            requested_slug=request.slug,
            dry_run=False,
            status="ok",
            slug=request.slug,
            files_written=tuple(files_written),
            error=None,
        )
    )


def _envelope_error(
    *,
    requested_slug: str,
    trunk_branch: str,
    dry_run: bool,
    reason: CreateErrorReason,
    message: str,
) -> CreateResult:
    return CreateResult(
        json_schema=CREATE_SCHEMA,
        canonical_branch=trunk_branch,
        requested_slug=requested_slug,
        dry_run=dry_run,
        status="error",
        slug=None,
        files_written=(),
        error=CreateError(reason=reason, message=message),
    )


@dataclass(frozen=True)
class _ReadFailure:
    """Internal sentinel translated into a structured envelope error."""

    message: str


def _read_text_or_error(path: Path) -> str | _ReadFailure:
    """Read ``path`` as UTF-8 text or return a structured failure.

    ``click.Path(exists=True, dir_okay=False)`` already validates existence
    at parse time; this second pass guards against a file vanishing between
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
