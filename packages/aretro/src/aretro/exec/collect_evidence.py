"""Collect compact aretro evidence from shared session sources."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal, TypeAlias

import click

from aretro.gateway_access import get_git_gateway, get_session_source
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_core.sessions.evidence import SessionEvidenceItem, collect_session_evidence
from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionMessageCounts,
    SessionQuery,
    SessionQueryResult,
    SessionSourceInfo,
    SessionSourceRef,
    SessionWarning,
)

BranchSource: TypeAlias = Literal["explicit", "git_current_branch", "detached", "unresolved"]


class CollectEvidenceRequest(ClinkrModel):
    """Request for collecting compact session evidence for one branch."""

    repo: Annotated[
        Path | None,
        click.Option(
            ["--repo"],
            type=click.Path(path_type=Path, file_okay=False, dir_okay=True),
            default=None,
            help="Repository or worktree path. Defaults to the current working directory.",
        ),
    ] = None
    branch: Annotated[
        str | None,
        click.Option(
            ["--branch"],
            type=click.STRING,
            default=None,
            help="Branch to collect evidence for. Defaults to the current git branch.",
        ),
    ] = None
    session_root: Annotated[
        Path | None,
        click.Option(
            ["--session-root"],
            type=click.Path(path_type=Path, file_okay=False, dir_okay=True),
            default=None,
            help="Session root to query. Defaults to the session source's configured root.",
        ),
    ] = None
    max_sessions: Annotated[
        int,
        click.Option(
            ["--max-sessions"],
            type=click.INT,
            default=20,
            show_default=True,
            help="Maximum number of sessions to return.",
        ),
    ] = 20


class CollectEvidenceError(ClinkrModel):
    code: str
    message: str


class RepoContextDto(ClinkrModel):
    repo_root: str | None
    cwd: str
    branch: str | None
    branch_source: BranchSource


class SessionQueryDto(ClinkrModel):
    repo_root: str | None
    session_root: str | None
    max_sessions: int | None


class SessionSourceInfoDto(ClinkrModel):
    harness: str
    adapter_name: str
    record_format: str


class SessionSourceRefDto(ClinkrModel):
    path: str | None
    uri: str | None
    line_number: int | None


class SessionWarningDto(ClinkrModel):
    code: str
    message: str
    source_ref: SessionSourceRefDto | None
    harness: str | None
    adapter_name: str | None


class SessionAssociationDto(ClinkrModel):
    repo_root: str | None
    cwd: str | None
    branch: str | None
    confidence: str
    evidence: tuple[str, ...]


class MessageCountsDto(ClinkrModel):
    user: int
    assistant: int
    tool_result: int
    command_execution: int
    system: int
    other: int


class SessionSummaryDto(ClinkrModel):
    session_id: str | None
    started_at_iso: str | None
    ended_at_iso: str | None
    source_ref: SessionSourceRefDto
    association: SessionAssociationDto
    message_counts: MessageCountsDto
    model_event_count: int
    tool_call_count: int
    tool_result_count: int
    command_execution_count: int
    usage_event_count: int
    warning_count: int


class AggregateMetricsDto(ClinkrModel):
    session_count: int
    message_counts: MessageCountsDto
    tool_call_count: int
    tool_result_count: int
    command_execution_count: int
    usage_event_count: int
    warning_count: int


class EvidenceItemDto(ClinkrModel):
    kind: str
    subject: str | None
    summary: str
    count: int | None
    session_count: int | None
    source_refs: tuple[SessionSourceRefDto, ...]
    metadata: dict[str, str | int | bool | None]


class CollectEvidenceResult(ClinkrModel):
    success: bool
    error: CollectEvidenceError | None
    repo: RepoContextDto
    query: SessionQueryDto
    source: SessionSourceInfoDto
    aggregate_metrics: AggregateMetricsDto
    sessions: tuple[SessionSummaryDto, ...]
    warnings: tuple[SessionWarningDto, ...]
    evidence_items: tuple[EvidenceItemDto, ...]


@dataclass(frozen=True)
class _ResolvedBranch:
    branch: str | None
    branch_source: BranchSource
    error: CollectEvidenceError | None = None


def render_collect_evidence(result: CollectEvidenceResult) -> None:
    """Render a compact human summary for ad hoc CLI use."""
    branch = result.repo.branch or "<unresolved>"
    click.echo(
        "Collected "
        f"{result.aggregate_metrics.session_count} session(s) "
        f"from {result.source.harness}/{result.source.adapter_name} "
        f"for branch {branch}."
    )
    click.echo(f"Warnings: {result.aggregate_metrics.warning_count}")
    click.echo("Run with --format json for the skill-facing evidence envelope.")


@clinkr_operation(
    name="collect-evidence",
    help="Collect compact session evidence for a branch retrospective.",
    human_renderer=render_collect_evidence,
)
def run_collect_evidence(
    ctx: click.Context,
    request: CollectEvidenceRequest,
) -> ClinkrExit[CollectEvidenceResult]:
    git_gateway = get_git_gateway(ctx)
    session_source = get_session_source(ctx)
    cwd = Path.cwd()
    repo_input = request.repo or cwd
    source_info = session_source.source_info

    git_common_dir = _get_git_common_dir(git_gateway, repo_input)
    if isinstance(git_common_dir, CollectEvidenceError):
        result = _empty_result(
            request=request,
            cwd=cwd,
            repo_root=None,
            branch=request.branch,
            branch_source=_branch_source_for_unresolved_repo(request),
            source_info=source_info,
            error=git_common_dir,
            warnings=(),
        )
        return ClinkrExit.negative(result, message=git_common_dir.message)
    if git_common_dir is None:
        error = CollectEvidenceError(
            code="not_a_git_repo",
            message=f"Not a git repository: {repo_input}. Pass --repo with a git repository path.",
        )
        result = _empty_result(
            request=request,
            cwd=cwd,
            repo_root=None,
            branch=request.branch,
            branch_source=_branch_source_for_unresolved_repo(request),
            source_info=source_info,
            error=error,
            warnings=(),
        )
        return ClinkrExit.negative(result, message=error.message)

    repo_root = _get_repository_root(git_gateway, repo_input)
    if isinstance(repo_root, CollectEvidenceError):
        result = _empty_result(
            request=request,
            cwd=cwd,
            repo_root=None,
            branch=request.branch,
            branch_source=_branch_source_for_unresolved_repo(request),
            source_info=source_info,
            error=repo_root,
            warnings=(),
        )
        return ClinkrExit.negative(result, message=repo_root.message)

    resolved_branch = _resolve_branch(git_gateway, repo_root, request.branch)
    if resolved_branch.error is not None:
        result = _empty_result(
            request=request,
            cwd=cwd,
            repo_root=repo_root,
            branch=resolved_branch.branch,
            branch_source=resolved_branch.branch_source,
            source_info=source_info,
            error=resolved_branch.error,
            warnings=(),
        )
        return ClinkrExit.negative(result, message=resolved_branch.error.message)

    repo = RepoContextDto(
        repo_root=_path_to_string(repo_root),
        cwd=str(cwd),
        branch=resolved_branch.branch,
        branch_source=resolved_branch.branch_source,
    )
    query = SessionQuery(
        repo_root=repo_root,
        session_root=request.session_root,
        max_sessions=request.max_sessions,
    )
    query_result = session_source.query(query)
    return ClinkrExit.ok(_result_from_query_result(request, repo, query_result))


def summarize_session(session: ParsedSession) -> SessionSummaryDto:
    """Convert a normalized session dataclass into the public summary DTO."""
    return SessionSummaryDto(
        session_id=session.session_id,
        started_at_iso=session.started_at_iso,
        ended_at_iso=session.ended_at_iso,
        source_ref=_source_ref_to_dto(session.source_ref),
        association=_association_to_dto(session.association),
        message_counts=_message_counts_to_dto(session.message_counts),
        model_event_count=len(session.model_events),
        tool_call_count=len(session.tool_calls),
        tool_result_count=len(session.tool_results),
        command_execution_count=len(session.command_executions),
        usage_event_count=len(session.usage_events),
        warning_count=len(session.warnings),
    )


def aggregate_metrics_from_summaries(
    summaries: tuple[SessionSummaryDto, ...],
    warnings: tuple[SessionWarningDto, ...],
) -> AggregateMetricsDto:
    """Build aggregate counts from compact session summaries and source warnings."""
    return AggregateMetricsDto(
        session_count=len(summaries),
        message_counts=MessageCountsDto(
            user=sum(summary.message_counts.user for summary in summaries),
            assistant=sum(summary.message_counts.assistant for summary in summaries),
            tool_result=sum(summary.message_counts.tool_result for summary in summaries),
            command_execution=sum(
                summary.message_counts.command_execution for summary in summaries
            ),
            system=sum(summary.message_counts.system for summary in summaries),
            other=sum(summary.message_counts.other for summary in summaries),
        ),
        tool_call_count=sum(summary.tool_call_count for summary in summaries),
        tool_result_count=sum(summary.tool_result_count for summary in summaries),
        command_execution_count=sum(summary.command_execution_count for summary in summaries),
        usage_event_count=sum(summary.usage_event_count for summary in summaries),
        warning_count=len(warnings),
    )


def _result_from_query_result(
    request: CollectEvidenceRequest,
    repo: RepoContextDto,
    query_result: SessionQueryResult,
) -> CollectEvidenceResult:
    summaries = tuple(summarize_session(session) for session in query_result.sessions)
    warnings = tuple(_warning_to_dto(warning) for warning in query_result.warnings)
    return CollectEvidenceResult(
        success=True,
        error=None,
        repo=repo,
        query=_query_to_dto(request, repo.repo_root),
        source=_source_info_to_dto(query_result.source_info),
        aggregate_metrics=aggregate_metrics_from_summaries(summaries, warnings),
        sessions=summaries,
        warnings=warnings,
        evidence_items=tuple(
            _evidence_item_to_dto(item) for item in collect_session_evidence(query_result.sessions)
        ),
    )


def _empty_result(
    *,
    request: CollectEvidenceRequest,
    cwd: Path,
    repo_root: Path | None,
    branch: str | None,
    branch_source: BranchSource,
    source_info: SessionSourceInfo,
    error: CollectEvidenceError,
    warnings: tuple[SessionWarningDto, ...],
) -> CollectEvidenceResult:
    repo = RepoContextDto(
        repo_root=_path_to_string(repo_root),
        cwd=str(cwd),
        branch=branch,
        branch_source=branch_source,
    )
    return CollectEvidenceResult(
        success=False,
        error=error,
        repo=repo,
        query=_query_to_dto(request, repo.repo_root),
        source=_source_info_to_dto(source_info),
        aggregate_metrics=aggregate_metrics_from_summaries((), warnings),
        sessions=(),
        warnings=warnings,
        evidence_items=(),
    )


def _get_git_common_dir(
    git_gateway: GitGateway,
    repo_input: Path,
) -> Path | None | CollectEvidenceError:
    try:
        return git_gateway.get_git_common_dir(repo_input)
    except OSError as exc:
        return CollectEvidenceError(
            code="not_a_git_repo",
            message=f"Not a git repository: {repo_input}. {exc}",
        )


def _get_repository_root(
    git_gateway: GitGateway,
    repo_input: Path,
) -> Path | CollectEvidenceError:
    try:
        return git_gateway.get_repository_root(repo_input)
    except subprocess.CalledProcessError as exc:
        message = _called_process_message(exc, fallback="git rev-parse --show-toplevel failed")
        return CollectEvidenceError(
            code="git_repository_root_failed",
            message=f"Could not resolve git repository root for {repo_input}: {message}",
        )
    except OSError as exc:
        return CollectEvidenceError(
            code="git_repository_root_failed",
            message=f"Could not resolve git repository root for {repo_input}: {exc}",
        )


def _resolve_branch(
    git_gateway: GitGateway,
    repo_root: Path,
    explicit_branch: str | None,
) -> _ResolvedBranch:
    if explicit_branch is not None:
        return _ResolvedBranch(branch=explicit_branch, branch_source="explicit")

    try:
        current_branch = git_gateway.get_current_branch(repo_root)
    except OSError as exc:
        return _ResolvedBranch(
            branch=None,
            branch_source="unresolved",
            error=CollectEvidenceError(
                code="git_current_branch_failed",
                message=f"Could not determine current git branch for {repo_root}: {exc}",
            ),
        )

    if isinstance(current_branch, str):
        return _ResolvedBranch(branch=current_branch, branch_source="git_current_branch")
    if isinstance(current_branch, DetachedHead):
        return _ResolvedBranch(
            branch=None,
            branch_source="detached",
            error=CollectEvidenceError(
                code="detached_head",
                message=f"Detached HEAD at {repo_root}; pass --branch to collect evidence.",
            ),
        )
    if isinstance(current_branch, GitCommandFailure):
        return _ResolvedBranch(
            branch=None,
            branch_source="unresolved",
            error=CollectEvidenceError(
                code="git_current_branch_failed",
                message=(
                    f"Could not determine current git branch for {repo_root}: "
                    f"{current_branch.message}"
                ),
            ),
        )

    return _ResolvedBranch(
        branch=None,
        branch_source="unresolved",
        error=CollectEvidenceError(
            code="git_current_branch_failed",
            message=f"Could not determine current git branch for {repo_root}.",
        ),
    )


def _query_to_dto(request: CollectEvidenceRequest, repo_root: str | None) -> SessionQueryDto:
    return SessionQueryDto(
        repo_root=repo_root,
        session_root=_path_to_string(request.session_root),
        max_sessions=request.max_sessions,
    )


def _evidence_item_to_dto(item: SessionEvidenceItem) -> EvidenceItemDto:
    return EvidenceItemDto(
        kind=item.kind,
        subject=item.subject,
        summary=item.summary,
        count=item.count,
        session_count=item.session_count,
        source_refs=tuple(_source_ref_to_dto(source_ref) for source_ref in item.source_refs),
        metadata=dict(item.metadata),
    )


def _source_info_to_dto(source_info: SessionSourceInfo) -> SessionSourceInfoDto:
    return SessionSourceInfoDto(
        harness=source_info.harness,
        adapter_name=source_info.adapter_name,
        record_format=source_info.record_format,
    )


def _warning_to_dto(warning: SessionWarning) -> SessionWarningDto:
    return SessionWarningDto(
        code=warning.code,
        message=warning.message,
        source_ref=_optional_source_ref_to_dto(warning.source_ref),
        harness=warning.harness,
        adapter_name=warning.adapter_name,
    )


def _association_to_dto(association: SessionAssociation) -> SessionAssociationDto:
    return SessionAssociationDto(
        repo_root=_path_to_string(association.repo_root),
        cwd=_path_to_string(association.cwd),
        branch=association.branch,
        confidence=association.confidence,
        evidence=association.evidence,
    )


def _source_ref_to_dto(source_ref: SessionSourceRef) -> SessionSourceRefDto:
    return SessionSourceRefDto(
        path=_path_to_string(source_ref.path),
        uri=source_ref.uri,
        line_number=source_ref.line_number,
    )


def _optional_source_ref_to_dto(source_ref: SessionSourceRef | None) -> SessionSourceRefDto | None:
    if source_ref is None:
        return None
    return _source_ref_to_dto(source_ref)


def _message_counts_to_dto(counts: SessionMessageCounts) -> MessageCountsDto:
    return MessageCountsDto(
        user=counts.user,
        assistant=counts.assistant,
        tool_result=counts.tool_result,
        command_execution=counts.command_execution,
        system=counts.system,
        other=counts.other,
    )


def _branch_source_for_unresolved_repo(request: CollectEvidenceRequest) -> BranchSource:
    if request.branch is not None:
        return "explicit"
    return "unresolved"


def _path_to_string(path: Path | None) -> str | None:
    if path is None:
        return None
    return str(path)


def _called_process_message(exc: subprocess.CalledProcessError, *, fallback: str) -> str:
    stderr = exc.stderr
    if isinstance(stderr, str):
        stripped = stderr.strip()
        if stripped:
            return stripped
    return fallback
