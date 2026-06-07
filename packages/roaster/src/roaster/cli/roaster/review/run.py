from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.project_config import AsdlProjectConfigError
from roaster.context import RoasterCliContext
from roaster.models import (
    DiffLineLocation,
    DocumentReviewTarget,
    FindingsReview,
    GitDiffFailedError,
    GitInvocationFailedError,
    GlobalLocation,
    LocalReviewResult,
    ProseReview,
    RepoRootUnavailableError,
    ResolvedReviewRunPlan,
    ReviewContextFragment,
    ReviewDefinitionReadError,
    ReviewExecutorInvocationError,
    TextAnchorLocation,
)
from roaster.workflow import run_review_by_key


def _stderr_run_plan(plan: ResolvedReviewRunPlan) -> None:
    details = f"resolved model={plan.model} harness={plan.harness}"
    if plan.target_kind == "diff":
        details += f" base_ref={plan.base_ref} changed_paths={plan.changed_path_count}"
    else:
        details += f" target=document label={plan.target_label}"
    click.echo(f"  · {details}", err=True)


class ReviewRunRequest(ClinkrModel):
    key: str
    harness: Annotated[
        str | None,
        click.Option(
            ["--harness"],
            help="Harness name to dispatch the review through. Falls back to config.",
        ),
    ] = None
    model: Annotated[
        str | None,
        click.Option(
            ["--model"],
            help="Model name to pass to the harness.",
        ),
    ] = None
    base_ref: Annotated[
        str | None,
        click.Option(
            ["--base-ref"],
            help="Base branch to diff against. Defaults to the repo trunk branch.",
        ),
    ] = None
    review_format: Annotated[
        Literal["findings", "text"],
        click.Option(
            ["--review-format"],
            type=click.Choice(["findings", "text"]),
            default="text",
            show_default=True,
            help=(
                "Review content format. 'text' returns a human-readable markdown review. "
                "'findings' returns structured JSON findings."
            ),
        ),
    ] = "text"
    file: Annotated[
        str | None,
        click.Option(
            ["--file"],
            help="UTF-8 document/artifact file to review instead of the current branch diff.",
        ),
    ] = None
    stdin: Annotated[
        bool,
        click.Option(
            ["--stdin"],
            is_flag=True,
            default=False,
            help="Read a UTF-8 document/artifact target from stdin.",
        ),
    ] = False
    target_kind: Annotated[
        Literal["diff", "document"] | None,
        click.Option(
            ["--target-kind"],
            type=click.Choice(["diff", "document"]),
            default=None,
            help="Explicit target kind. Defaults to diff unless --file or --stdin is supplied.",
        ),
    ] = None
    context: Annotated[
        tuple[str, ...],
        click.Option(
            ["--context"],
            multiple=True,
            help="Add inline context for the review. May be repeated.",
        ),
    ] = ()
    context_file: Annotated[
        tuple[str, ...],
        click.Option(
            ["--context-file"],
            multiple=True,
            help="Read additive UTF-8 context from a file. May be repeated.",
        ),
    ] = ()


def _resolve_document_target(request: ReviewRunRequest) -> DocumentReviewTarget | None:
    has_file = request.file is not None and bool(request.file.strip())
    has_stdin = request.stdin
    if has_file and has_stdin:
        raise ClinkrFailure(
            error_type="review_target_invalid",
            message="Pass only one target source: --file or --stdin, not both.",
        )
    if request.target_kind == "diff" and (has_file or has_stdin):
        raise ClinkrFailure(
            error_type="review_target_invalid",
            message="--target-kind diff cannot be combined with --file or --stdin.",
        )
    if request.target_kind == "document" and not has_file and not has_stdin:
        raise ClinkrFailure(
            error_type="review_target_invalid",
            message="--target-kind document requires --file or --stdin.",
        )
    has_document_target = has_file or has_stdin or request.target_kind == "document"
    if request.base_ref is not None and has_document_target:
        raise ClinkrFailure(
            error_type="review_target_invalid",
            message="--base-ref is only valid for diff targets.",
        )

    if has_file:
        assert request.file is not None
        path = Path(request.file)
        if not path.exists() or not path.is_file():
            raise ClinkrFailure(
                error_type="review_target_invalid",
                message=f"Document target file does not exist or is not a file: {request.file}",
            )
        return DocumentReviewTarget(
            kind="document",
            content=path.read_text(encoding="utf-8"),
            label=request.file,
            source_path=str(path),
        )

    if has_stdin:
        return DocumentReviewTarget(
            kind="document",
            content=click.get_text_stream("stdin").read(),
            label="stdin",
            source_path=None,
        )

    return None


def _context_fragments(request: ReviewRunRequest) -> tuple[ReviewContextFragment, ...]:
    fragments: list[ReviewContextFragment] = []
    for index, content in enumerate(request.context, start=1):
        fragments.append(ReviewContextFragment(label=f"inline context {index}", content=content))
    for context_file in request.context_file:
        path = Path(context_file)
        if not path.exists() or not path.is_file():
            raise ClinkrFailure(
                error_type="review_context_invalid",
                message=f"Context file does not exist or is not a file: {context_file}",
            )
        fragments.append(
            ReviewContextFragment(
                label=f"context file: {context_file}",
                content=path.read_text(encoding="utf-8"),
            )
        )
    return tuple(fragments)


def render_review_run(result: LocalReviewResult) -> None:
    """Render review output for the human CLI."""
    click.echo(f"Reviewer: {result.review_name}")
    click.echo(f"Model: {result.model}")
    if result.target_kind == "diff":
        click.echo(f"Base ref: {result.base_ref}")
    else:
        click.echo(f"Target: {result.target_label}")
    if result.usage is not None:
        usage = result.usage
        click.echo(
            f"Tokens: {usage.total_input_tokens:,} in / {usage.output_tokens:,} out "
            f"(cache read: {usage.cache_read_input_tokens:,}, "
            f"cache create: {usage.cache_creation_input_tokens:,})"
        )
        click.echo(f"Cost: ${usage.total_cost_usd:.4f} USD")
        click.echo(f"Duration: {usage.duration_ms / 1000:.1f}s ({usage.num_turns} turns)")

    match result.payload:
        case ProseReview(prose=prose):
            click.echo("")
            click.echo(prose)
        case FindingsReview(findings=findings):
            if not findings:
                click.echo("No findings.")
                return
            click.echo(f"Findings: {len(findings)}")
            for finding in findings:
                location = _finding_location_display(finding_location=finding.location)
                click.echo(f"- [{finding.severity}] {location} {finding.summary}")
                click.echo(f"  {finding.details}")


def _finding_location_display(
    *,
    finding_location: GlobalLocation | TextAnchorLocation | DiffLineLocation,
) -> str:
    if isinstance(finding_location, GlobalLocation):
        return "global"
    if isinstance(finding_location, DiffLineLocation):
        if finding_location.line is None:
            return finding_location.path
        return f"{finding_location.path}:{finding_location.line}"

    pieces: list[str] = []
    if finding_location.section is not None:
        pieces.append(finding_location.section)
    anchor = finding_location.text.replace("\n", " ")
    if len(anchor) > 80:
        anchor = anchor[:77].rstrip() + "..."
    pieces.append(f'"{anchor}"')
    return " · ".join(pieces)


@clinkr_operation(
    name="run",
    help="Run a reviewer by key (looks up reviews/<key>.md).",
    human_renderer=render_review_run,
)
def run_review_command(
    ctx: click.Context,
    request: ReviewRunRequest,
) -> ClinkrExit[LocalReviewResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    click.echo(f"▶ Running review '{request.key}'", err=True)
    try:
        document_target = _resolve_document_target(request)
        context_fragments = _context_fragments(request)
        result = run_review_by_key(
            key=request.key,
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            requested_harness=request.harness,
            requested_format=request.review_format,
            catalog=roaster_context.catalog,
            diff=roaster_context.diff,
            harness_runtime=roaster_context.harness_runtime,
            requested_document_target=document_target,
            context_fragments=context_fragments,
            progress=_stderr_run_plan,
        )
    except ReviewDefinitionReadError as exc:
        raise ClinkrFailure(error_type="review_definition_read_failed", message=str(exc)) from exc
    except ReviewExecutorInvocationError as exc:
        raise ClinkrFailure(
            error_type="review_execution_invocation_failed", message=str(exc)
        ) from exc
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except AsdlProjectConfigError as exc:
        raise ClinkrFailure(error_type="asdl_config_invalid", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc
    except GitDiffFailedError as exc:
        raise ClinkrFailure(error_type="git_diff_failed", message=str(exc)) from exc

    result = Ensure.ideal_state(result)
    return ClinkrExit.ok(result)
