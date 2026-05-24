"""``objective exec child-session-usage`` Pi child-session usage summarizer."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation

ChildSessionUsageStatus = Literal[
    "ok",
    "missing",
    "not_file",
    "invalid_json",
    "read_error",
    "no_usage",
]


class ChildSessionCostTotals(ClinkrModel):
    input_usd: float
    output_usd: float
    cache_read_usd: float
    cache_write_usd: float
    total_usd: float


class ChildSessionTokenTotals(ClinkrModel):
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    total_tokens: int


class ChildSessionModelRef(ClinkrModel):
    provider: str | None
    api: str | None
    model: str | None


class ChildSessionUsageSummary(ClinkrModel):
    session_file: str
    status: ChildSessionUsageStatus
    error: str | None
    error_line: int | None
    assistant_response_count: int
    models: tuple[ChildSessionModelRef, ...]
    tokens: ChildSessionTokenTotals
    cost: ChildSessionCostTotals
    peak_observed_total_tokens: int | None
    peak_observed_prompt_tokens: int | None
    configured_context_window_tokens: int | None


class ChildSessionUsageAggregate(ClinkrModel):
    session_count: int
    ok_session_count: int
    usage_response_count: int
    tokens: ChildSessionTokenTotals
    cost: ChildSessionCostTotals
    peak_observed_total_tokens: int | None
    peak_observed_prompt_tokens: int | None
    configured_context_window_tokens: int | None


class ChildSessionUsageResult(ClinkrModel):
    sessions: tuple[ChildSessionUsageSummary, ...]
    aggregate: ChildSessionUsageAggregate


class ChildSessionUsageRequest(ClinkrModel):
    session_files: Annotated[
        tuple[Path, ...],
        click.Argument(
            ["session_files"],
            nargs=-1,
            type=click.Path(path_type=Path),
        ),
    ]


def render_child_session_usage_markdown(result: ChildSessionUsageResult) -> None:
    click.echo("# Child Session Usage")
    click.echo()
    click.echo(
        "| session | status | responses | model(s) | input | output | cache read | "
        "cache write | total tokens | peak total | peak prompt | cost |"
    )
    click.echo("| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for session in result.sessions:
        click.echo(_render_session_row(session))

    click.echo()
    click.echo("## Aggregate")
    click.echo()
    click.echo(
        f"- sessions: {result.aggregate.session_count:,} total, "
        f"{result.aggregate.ok_session_count:,} with usage"
    )
    click.echo(f"- usage responses: {result.aggregate.usage_response_count:,}")
    click.echo(
        "- tokens: "
        f"{result.aggregate.tokens.input_tokens:,} input / "
        f"{result.aggregate.tokens.output_tokens:,} output / "
        f"{result.aggregate.tokens.cache_read_tokens:,} cache read / "
        f"{result.aggregate.tokens.cache_write_tokens:,} cache write / "
        f"{result.aggregate.tokens.total_tokens:,} total"
    )
    click.echo(
        "- peak observed total tokens: "
        f"{_format_optional_int(result.aggregate.peak_observed_total_tokens)}"
    )
    click.echo(
        "- peak observed prompt tokens: "
        f"{_format_optional_int(result.aggregate.peak_observed_prompt_tokens)}"
    )
    click.echo(
        "- configured context window: "
        f"{_format_configured_context_window(result.aggregate.configured_context_window_tokens)}"
    )
    click.echo(f"- cost: {_format_cost(result.aggregate.cost.total_usd)}")


@clinkr_operation(
    name="child-session-usage",
    help="Summarize Pi child session JSONL usage telemetry for Objective stack digests.",
    human_renderer=render_child_session_usage_markdown,
)
def run_child_session_usage(
    ctx: click.Context,
    request: ChildSessionUsageRequest,
) -> ClinkrExit[ChildSessionUsageResult]:
    del ctx
    if not request.session_files:
        raise ClinkrExit.negative(
            summarize_child_session_usage(()),
            message=(
                "Missing session file (missing_session_file). "
                "Pass at least one Pi child session JSONL file."
            ),
        )
    return ClinkrExit.ok(summarize_child_session_usage(request.session_files))


def summarize_child_session_usage(
    session_files: tuple[Path, ...],
) -> ChildSessionUsageResult:
    sessions = tuple(summarize_child_session_file(session_file) for session_file in session_files)
    return ChildSessionUsageResult(
        sessions=sessions,
        aggregate=_build_aggregate(sessions),
    )


def summarize_child_session_file(session_file: Path) -> ChildSessionUsageSummary:
    if not session_file.exists():
        return _empty_summary(
            session_file,
            status="missing",
            error="session file does not exist",
        )
    if not session_file.is_file():
        return _empty_summary(
            session_file,
            status="not_file",
            error="path is not a file",
        )

    try:
        content = session_file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return _empty_summary(
            session_file,
            status="read_error",
            error=str(exc),
        )

    records: list[Mapping[str, object]] = []
    for line_number, line in enumerate(content.splitlines(), start=1):
        if line.strip() == "":
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as exc:
            return _empty_summary(
                session_file,
                status="invalid_json",
                error=f"invalid JSON: {exc.msg}",
                error_line=line_number,
            )
        if isinstance(parsed, dict):
            records.append(parsed)

    return _summary_from_records(session_file, records)


def _summary_from_records(
    session_file: Path,
    records: list[Mapping[str, object]],
) -> ChildSessionUsageSummary:
    tokens = _zero_tokens()
    cost = _zero_cost()
    assistant_response_count = 0
    peak_observed_total_tokens: int | None = None
    peak_observed_prompt_tokens: int | None = None
    model_refs: list[ChildSessionModelRef] = []
    seen_model_keys: set[tuple[str | None, str | None, str | None]] = set()

    for record in records:
        message = _mapping_field(record, "message")
        if message is None or message.get("role") != "assistant":
            continue

        usage = _mapping_field(message, "usage")
        if usage is None:
            continue

        assistant_response_count += 1
        response_tokens = _tokens_from_usage(usage)
        response_cost = _cost_from_usage(usage)
        tokens = _add_tokens(tokens, response_tokens)
        cost = _add_cost(cost, response_cost)
        peak_observed_total_tokens = _max_optional(
            peak_observed_total_tokens,
            response_tokens.total_tokens,
        )
        peak_observed_prompt_tokens = _max_optional(
            peak_observed_prompt_tokens,
            response_tokens.input_tokens
            + response_tokens.cache_read_tokens
            + response_tokens.cache_write_tokens,
        )

        model_ref = _model_ref_from_record(record, message, usage)
        model_key = (model_ref.provider, model_ref.api, model_ref.model)
        if model_key != (None, None, None) and model_key not in seen_model_keys:
            seen_model_keys.add(model_key)
            model_refs.append(model_ref)

    if assistant_response_count == 0:
        return _empty_summary(
            session_file,
            status="no_usage",
            error="no assistant usage records found",
        )

    return ChildSessionUsageSummary(
        session_file=str(session_file),
        status="ok",
        error=None,
        error_line=None,
        assistant_response_count=assistant_response_count,
        models=tuple(model_refs),
        tokens=tokens,
        cost=cost,
        peak_observed_total_tokens=peak_observed_total_tokens,
        peak_observed_prompt_tokens=peak_observed_prompt_tokens,
        configured_context_window_tokens=None,
    )


def _build_aggregate(
    sessions: tuple[ChildSessionUsageSummary, ...],
) -> ChildSessionUsageAggregate:
    tokens = _zero_tokens()
    cost = _zero_cost()
    usage_response_count = 0
    peak_observed_total_tokens: int | None = None
    peak_observed_prompt_tokens: int | None = None

    for session in sessions:
        if session.status != "ok":
            continue
        tokens = _add_tokens(tokens, session.tokens)
        cost = _add_cost(cost, session.cost)
        usage_response_count += session.assistant_response_count
        peak_observed_total_tokens = _max_optional(
            peak_observed_total_tokens,
            session.peak_observed_total_tokens,
        )
        peak_observed_prompt_tokens = _max_optional(
            peak_observed_prompt_tokens,
            session.peak_observed_prompt_tokens,
        )

    return ChildSessionUsageAggregate(
        session_count=len(sessions),
        ok_session_count=sum(1 for session in sessions if session.status == "ok"),
        usage_response_count=usage_response_count,
        tokens=tokens,
        cost=cost,
        peak_observed_total_tokens=peak_observed_total_tokens,
        peak_observed_prompt_tokens=peak_observed_prompt_tokens,
        configured_context_window_tokens=None,
    )


def _empty_summary(
    session_file: Path,
    *,
    status: ChildSessionUsageStatus,
    error: str | None,
    error_line: int | None = None,
) -> ChildSessionUsageSummary:
    return ChildSessionUsageSummary(
        session_file=str(session_file),
        status=status,
        error=error,
        error_line=error_line,
        assistant_response_count=0,
        models=(),
        tokens=_zero_tokens(),
        cost=_zero_cost(),
        peak_observed_total_tokens=None,
        peak_observed_prompt_tokens=None,
        configured_context_window_tokens=None,
    )


def _tokens_from_usage(usage: Mapping[str, object]) -> ChildSessionTokenTotals:
    return ChildSessionTokenTotals(
        input_tokens=_int_field(usage, "input"),
        output_tokens=_int_field(usage, "output"),
        cache_read_tokens=_int_field(usage, "cacheRead"),
        cache_write_tokens=_int_field(usage, "cacheWrite"),
        total_tokens=_int_field(usage, "totalTokens"),
    )


def _cost_from_usage(usage: Mapping[str, object]) -> ChildSessionCostTotals:
    cost = _mapping_field(usage, "cost")
    if cost is None:
        cost = {}
    return ChildSessionCostTotals(
        input_usd=_float_field(cost, "input"),
        output_usd=_float_field(cost, "output"),
        cache_read_usd=_float_field(cost, "cacheRead"),
        cache_write_usd=_float_field(cost, "cacheWrite"),
        total_usd=_float_field(cost, "total"),
    )


def _model_ref_from_record(
    record: Mapping[str, object],
    message: Mapping[str, object],
    usage: Mapping[str, object],
) -> ChildSessionModelRef:
    return ChildSessionModelRef(
        provider=_first_string_field(record, message, usage, key="provider"),
        api=_first_string_field(record, message, usage, key="api"),
        model=_first_string_field(record, message, usage, key="model"),
    )


def _first_string_field(
    record: Mapping[str, object],
    message: Mapping[str, object],
    usage: Mapping[str, object],
    *,
    key: str,
) -> str | None:
    direct = _string_field(message, key) or _string_field(record, key) or _string_field(usage, key)
    if direct is not None:
        return direct

    for container in (message, record, usage):
        for nested_key in ("modelInfo", "model_info", "modelRef", "model_ref"):
            nested = _mapping_field(container, nested_key)
            if nested is None:
                continue
            nested_value = _string_field(nested, key)
            if nested_value is not None:
                return nested_value
    return None


def _mapping_field(
    data: Mapping[str, object],
    key: str,
) -> Mapping[str, object] | None:
    value = data.get(key)
    if not isinstance(value, dict):
        return None

    mapped: dict[str, object] = {}
    for nested_key, nested_value in value.items():
        if not isinstance(nested_key, str):
            return None
        mapped[nested_key] = nested_value
    return mapped


def _string_field(data: Mapping[str, object], key: str) -> str | None:
    value = data.get(key)
    if isinstance(value, str) and value.strip() != "":
        return value
    return None


def _int_field(data: Mapping[str, object], key: str) -> int:
    value = data.get(key)
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return 0


def _float_field(data: Mapping[str, object], key: str) -> float:
    value = data.get(key)
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def _zero_tokens() -> ChildSessionTokenTotals:
    return ChildSessionTokenTotals(
        input_tokens=0,
        output_tokens=0,
        cache_read_tokens=0,
        cache_write_tokens=0,
        total_tokens=0,
    )


def _zero_cost() -> ChildSessionCostTotals:
    return ChildSessionCostTotals(
        input_usd=0.0,
        output_usd=0.0,
        cache_read_usd=0.0,
        cache_write_usd=0.0,
        total_usd=0.0,
    )


def _add_tokens(
    left: ChildSessionTokenTotals,
    right: ChildSessionTokenTotals,
) -> ChildSessionTokenTotals:
    return ChildSessionTokenTotals(
        input_tokens=left.input_tokens + right.input_tokens,
        output_tokens=left.output_tokens + right.output_tokens,
        cache_read_tokens=left.cache_read_tokens + right.cache_read_tokens,
        cache_write_tokens=left.cache_write_tokens + right.cache_write_tokens,
        total_tokens=left.total_tokens + right.total_tokens,
    )


def _add_cost(
    left: ChildSessionCostTotals,
    right: ChildSessionCostTotals,
) -> ChildSessionCostTotals:
    return ChildSessionCostTotals(
        input_usd=left.input_usd + right.input_usd,
        output_usd=left.output_usd + right.output_usd,
        cache_read_usd=left.cache_read_usd + right.cache_read_usd,
        cache_write_usd=left.cache_write_usd + right.cache_write_usd,
        total_usd=left.total_usd + right.total_usd,
    )


def _max_optional(left: int | None, right: int | None) -> int | None:
    if right is None:
        return left
    if left is None or right > left:
        return right
    return left


def _render_session_row(session: ChildSessionUsageSummary) -> str:
    return (
        "| "
        f"{_markdown_cell(session.session_file)} | "
        f"{_markdown_cell(_status_text(session))} | "
        f"{session.assistant_response_count:,} | "
        f"{_markdown_cell(_models_text(session.models))} | "
        f"{_format_session_int(session, session.tokens.input_tokens)} | "
        f"{_format_session_int(session, session.tokens.output_tokens)} | "
        f"{_format_session_int(session, session.tokens.cache_read_tokens)} | "
        f"{_format_session_int(session, session.tokens.cache_write_tokens)} | "
        f"{_format_session_int(session, session.tokens.total_tokens)} | "
        f"{_format_session_optional_int(session, session.peak_observed_total_tokens)} | "
        f"{_format_session_optional_int(session, session.peak_observed_prompt_tokens)} | "
        f"{_format_session_cost(session)} |"
    )


def _status_text(session: ChildSessionUsageSummary) -> str:
    if session.error is None:
        return session.status
    if session.error_line is not None:
        return f"{session.status} (line {session.error_line}: {session.error})"
    return f"{session.status} ({session.error})"


def _models_text(models: tuple[ChildSessionModelRef, ...]) -> str:
    if not models:
        return "—"
    return ", ".join(_model_text(model_ref) for model_ref in models)


def _model_text(model_ref: ChildSessionModelRef) -> str:
    parts = [part for part in (model_ref.provider, model_ref.api, model_ref.model) if part]
    if not parts:
        return "—"
    return "/".join(parts)


def _format_session_int(session: ChildSessionUsageSummary, value: int) -> str:
    if session.status != "ok":
        return "—"
    return f"{value:,}"


def _format_session_optional_int(
    session: ChildSessionUsageSummary,
    value: int | None,
) -> str:
    if session.status != "ok" or value is None:
        return "—"
    return f"{value:,}"


def _format_session_cost(session: ChildSessionUsageSummary) -> str:
    if session.status != "ok":
        return "—"
    return _format_cost(session.cost.total_usd)


def _format_optional_int(value: int | None) -> str:
    if value is None:
        return "unavailable"
    return f"{value:,}"


def _format_cost(value: float) -> str:
    return f"${value:.6f}"


def _format_configured_context_window(value: int | None) -> str:
    if value is None:
        return "unavailable in child session logs"
    return f"{value:,} tokens"


def _markdown_cell(value: str) -> str:
    return value.replace("\n", " ").replace("|", "\\|")
