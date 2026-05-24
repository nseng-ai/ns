"""``objective list`` read-only Objective status over local git facts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure, PathTouch
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    load_objective_context,
)

OBJECTIVE_ROOT = ".asdl/objectives"
ObjectiveListView = Literal["list", "detail"]
ObjectiveRecordStatus = Literal["open", "closed"]
ObjectiveStatus = Literal["open", "closed", "in-flight"]
ObjectiveStatusFilter = Literal["all", "active", "open", "closed", "in-flight"]
ObjectiveStatusSource = Literal["base", "current"]


@dataclass(frozen=True)
class _ObjectiveTouchCandidate:
    branch: str
    ref_name: str
    touch: PathTouch
    is_work_branch: bool


class ObjectiveListRequest(ClinkrModel):
    current: Annotated[
        bool,
        click.Option(
            ["--current"],
            is_flag=True,
            default=False,
            help="Use the current branch as the Objective status source.",
        ),
    ] = False
    names: Annotated[
        bool,
        click.Option(
            ["--names"],
            is_flag=True,
            default=False,
            help="Output Objective slugs only, one per line.",
        ),
    ] = False
    status: Annotated[
        ObjectiveStatusFilter,
        click.Option(
            ["--status"],
            type=click.Choice(["all", "active", "open", "closed", "in-flight"]),
            default="active",
            show_default=True,
            help="Filter Objectives by repository status.",
        ),
    ] = "active"
    view: Annotated[
        ObjectiveListView,
        click.Option(
            ["--view"],
            type=click.Choice(["list", "detail"]),
            default="list",
            show_default=True,
            help="Select objective-level list or per-branch detail view.",
        ),
    ] = "list"


class ObjectiveBranchEntry(ClinkrModel):
    branch: str
    status: ObjectiveRecordStatus
    updated_iso: str | None
    ahead_base: int


class ObjectiveStatusSourceEntry(ClinkrModel):
    branch: str
    status: ObjectiveStatus
    updated_iso: str | None
    present: bool


class ObjectiveListGroup(ClinkrModel):
    slug: str
    status: ObjectiveStatus
    status_source_entry: ObjectiveStatusSourceEntry
    branches: tuple[ObjectiveBranchEntry, ...]
    latest_update_iso: str | None
    latest_work_branch: str | None


class ObjectiveListResult(ClinkrModel):
    base_branch: str
    trunk_branch: str
    status_source: ObjectiveStatusSource
    status_source_branch: str | None
    view: ObjectiveListView
    status_filter: ObjectiveStatusFilter
    current_branch: str | None
    filtered_to_current: bool
    names_only: bool
    groups: tuple[ObjectiveListGroup, ...]


def render_objective_list_human(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    console = get_console()
    if result.view == "detail":
        _render_objective_list_detail_human(result)
        return

    console.print(f"[bold]{_list_heading(result)}[/bold]")
    _render_metadata_human(result)
    if not result.groups:
        console.print(f"[dim]{_empty_message(result)}[/dim]")
        return

    table = make_table()
    table.add_column(
        "Objective",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        ratio=1,
    )
    table.add_column("Status", no_wrap=True, width=11)
    table.add_column(
        "Latest work",
        style="bold",
        no_wrap=True,
        overflow="ellipsis",
        ratio=2,
    )
    table.add_column("Latest update", no_wrap=True)
    table.add_column("Work branches", justify="right", no_wrap=True)
    table.add_column("Max ahead base", justify="right", no_wrap=True)
    for group in result.groups:
        table.add_row(
            group.slug,
            _status_label(group.status),
            _format_optional_branch(group.latest_work_branch),
            _format_age(group.latest_update_iso),
            str(len(group.branches)),
            f"+{_max_ahead_base(group)}",
        )
    console.print(table)


def _render_objective_list_detail_human(result: ObjectiveListResult) -> None:
    console = get_console()
    console.print(f"[bold]{_detail_heading(result)}[/bold]")
    _render_metadata_human(result)
    if not result.groups:
        console.print(f"[dim]{_empty_message(result)}[/dim]")
        return

    for group in result.groups:
        console.print()
        console.print(f"[bold cyan]{group.slug}[/bold cyan]")
        console.print(_status_source_summary(result, group))
        console.print()
        console.print("[bold]Work branches[/bold]")
        if not group.branches:
            console.print("[dim]No work branches.[/dim]")
            continue
        table = make_table()
        table.add_column(
            "Branch",
            style="bold",
            no_wrap=True,
            overflow="ellipsis",
            ratio=1,
        )
        table.add_column("Branch status", no_wrap=True, width=13)
        table.add_column("Update age", no_wrap=True)
        table.add_column("Ahead base", justify="right", no_wrap=True)
        for entry in group.branches:
            table.add_row(
                entry.branch,
                _status_label(entry.status),
                _format_age(entry.updated_iso),
                f"+{entry.ahead_base}",
            )
        console.print(table)


def render_objective_list_markdown(result: ObjectiveListResult) -> None:
    if result.names_only:
        _render_slugs(result)
        return

    if result.view == "detail":
        _render_objective_list_detail_markdown(result)
        return

    click.echo(f"# {_list_heading(result)}")
    click.echo()
    _render_metadata_markdown(result)
    if not result.groups:
        click.echo()
        click.echo(_empty_message(result))
        return

    click.echo()
    click.echo(
        "| objective | status | latest work | latest update | work branches | max ahead base |"
    )
    click.echo("| --- | --- | --- | --- | ---: | ---: |")
    for group in result.groups:
        click.echo(
            "| "
            f"{group.slug} | "
            f"{_status_label(group.status)} | "
            f"{_format_optional_branch_md(group.latest_work_branch)} | "
            f"{_format_age(group.latest_update_iso)} | "
            f"{len(group.branches)} | "
            f"+{_max_ahead_base(group)} |"
        )


def _render_objective_list_detail_markdown(result: ObjectiveListResult) -> None:
    click.echo(f"# {_detail_heading(result)}")
    click.echo()
    _render_metadata_markdown(result)
    if not result.groups:
        click.echo()
        click.echo(_empty_message(result))
        return

    for group in result.groups:
        click.echo()
        click.echo(f"## {group.slug}")
        click.echo()
        click.echo(_status_source_summary(result, group))
        click.echo()
        click.echo("### Work branches")
        if not group.branches:
            click.echo()
            click.echo("No work branches.")
            continue
        click.echo()
        click.echo("| branch | branch status | update age | ahead base |")
        click.echo("| --- | --- | --- | ---: |")
        for entry in group.branches:
            click.echo(
                f"| `{entry.branch}` | "
                f"{_status_label(entry.status)} | "
                f"{_format_age(entry.updated_iso)} | "
                f"+{entry.ahead_base} |"
            )


def _render_slugs(result: ObjectiveListResult) -> None:
    for group in result.groups:
        click.echo(group.slug)


def _render_metadata_human(result: ObjectiveListResult) -> None:
    if result.status_source == "current":
        get_console().print("Status source: current branch")
    else:
        get_console().print(f"Base branch: {result.base_branch}")
    get_console().print(f"Status filter: {result.status_filter}")
    get_console().print()


def _render_metadata_markdown(result: ObjectiveListResult) -> None:
    if result.status_source == "current":
        click.echo("Status source: `current branch`")
    else:
        click.echo(f"Base branch: `{result.base_branch}`")
    click.echo(f"Status filter: `{result.status_filter}`")


def _status_label(status: ObjectiveStatus | ObjectiveRecordStatus) -> str:
    if status == "closed":
        return "✓ closed"
    if status == "in-flight":
        return "◇ in-flight"
    return "○ open"


def _list_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Objective status for current branch `{result.current_branch}`"
    return "Objective status in this local repository"


def _detail_heading(result: ObjectiveListResult) -> str:
    if result.filtered_to_current and result.current_branch is not None:
        return f"Objective branch details for current branch `{result.current_branch}`"
    return "Objective branch details in this local repository"


def _status_source_summary(result: ObjectiveListResult, group: ObjectiveListGroup) -> str:
    label = "Current branch" if result.status_source == "current" else "Base branch"
    summary = (
        f"{label}: {group.status_source_entry.branch} — "
        f"{_status_label(group.status_source_entry.status)}"
    )
    if group.status_source_entry.updated_iso is None:
        return summary
    return f"{summary} — updated {_format_age(group.status_source_entry.updated_iso)}"


def _empty_message(result: ObjectiveListResult) -> str:
    if result.filtered_to_current:
        if result.current_branch is None:
            return "No current branch (detached HEAD); no active Objectives to list."
        return (
            f"No {_status_filter_objectives_phrase(result.status_filter)} associated with "
            f"current branch `{result.current_branch}`."
        )
    if result.status_filter == "all":
        return "No Objective status found."
    return f"No {result.status_filter} Objective status found."


def _status_filter_objectives_phrase(status_filter: ObjectiveStatusFilter) -> str:
    if status_filter == "all":
        return "Objectives"
    return f"{status_filter} Objectives"


@clinkr_operation(
    name="list",
    help="List Objective status from base/current status and local work branches.",
    human_renderer=render_objective_list_human,
    markdown_renderer=render_objective_list_markdown,
)
def run_list_objectives(
    ctx: click.Context,
    request: ObjectiveListRequest,
) -> ClinkrExit[ObjectiveListResult]:
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)
    return ClinkrExit.ok(
        build_objective_list_result(
            objective_ctx,
            view=request.view,
            status_filter=request.status,
            filter_current=request.current,
            names_only=request.names,
        )
    )


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    view: ObjectiveListView = "list",
    status_filter: ObjectiveStatusFilter = "active",
    filter_current: bool = False,
    names_only: bool = False,
) -> ObjectiveListResult:
    base_branch = ctx.trunk_branch
    status_source: ObjectiveStatusSource = "current" if filter_current else "base"

    current_branch = _resolve_current_branch(ctx) if filter_current else None
    status_source_branch = current_branch if filter_current else base_branch
    if filter_current and current_branch is None:
        return _empty_result(
            base_branch=base_branch,
            status_source=status_source,
            status_source_branch=None,
            view=view,
            status_filter=status_filter,
            current_branch=None,
            filtered_to_current=True,
            names_only=names_only,
        )

    local_branches = tuple(tip.name for tip in ctx.git.list_local_branch_tips())
    branches_to_scan = _branches_to_scan(
        local_branches,
        base_branch=base_branch,
        status_source_branch=status_source_branch,
    )
    records_by_branch = _objective_records_by_branch(ctx.git, branches_to_scan)

    slugs = _candidate_slugs(
        records_by_branch,
        local_branches=local_branches,
        base_branch=base_branch,
        status_source_branch=status_source_branch,
        filter_current=filter_current,
    )

    groups: list[ObjectiveListGroup] = []
    for slug in slugs:
        source_status = _source_status(
            slug,
            records_by_branch=records_by_branch,
            local_branches=local_branches,
            base_branch=base_branch,
            status_source_branch=status_source_branch,
            filter_current=filter_current,
        )
        if source_status is None or not _matches_status_filter(source_status, status_filter):
            continue

        group = _build_objective_group(
            ctx.git,
            slug=slug,
            status=source_status,
            records_by_branch=records_by_branch,
            local_branches=local_branches,
            base_branch=base_branch,
            status_source_branch=status_source_branch,
        )
        groups.append(group)

    return ObjectiveListResult(
        base_branch=base_branch,
        trunk_branch=base_branch,
        status_source=status_source,
        status_source_branch=status_source_branch,
        view=view,
        status_filter=status_filter,
        current_branch=current_branch,
        filtered_to_current=filter_current,
        names_only=names_only,
        groups=tuple(groups),
    )


def _resolve_current_branch(ctx: ObjectiveCliContext) -> str | None:
    current_result = ctx.git.get_current_branch(ctx.repo_root)
    if isinstance(current_result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_current_branch_failed",
            message=current_result.message,
        )
    if isinstance(current_result, str):
        return current_result
    return None


def _empty_result(
    *,
    base_branch: str,
    status_source: ObjectiveStatusSource,
    status_source_branch: str | None,
    view: ObjectiveListView,
    status_filter: ObjectiveStatusFilter,
    current_branch: str | None,
    filtered_to_current: bool,
    names_only: bool,
) -> ObjectiveListResult:
    return ObjectiveListResult(
        base_branch=base_branch,
        trunk_branch=base_branch,
        status_source=status_source,
        status_source_branch=status_source_branch,
        view=view,
        status_filter=status_filter,
        current_branch=current_branch,
        filtered_to_current=filtered_to_current,
        names_only=names_only,
        groups=(),
    )


def _branches_to_scan(
    local_branches: tuple[str, ...],
    *,
    base_branch: str,
    status_source_branch: str | None,
) -> tuple[str, ...]:
    branches = set(local_branches)
    branches.add(base_branch)
    if status_source_branch is not None:
        branches.add(status_source_branch)
    return tuple(sorted(branches))


def _objective_records_by_branch(
    git: GitGateway,
    branches: tuple[str, ...],
) -> dict[str, dict[str, ObjectiveRecordStatus]]:
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]] = {}
    for branch in branches:
        paths_result = git.list_tracked_paths_at_ref(_branch_ref(branch), OBJECTIVE_ROOT)
        if isinstance(paths_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_list_objective_paths_failed",
                message=paths_result.message,
            )
        records_by_branch[branch] = dict(_objective_statuses_from_paths(paths_result))
    return records_by_branch


def _candidate_slugs(
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]],
    *,
    local_branches: tuple[str, ...],
    base_branch: str,
    status_source_branch: str | None,
    filter_current: bool,
) -> tuple[str, ...]:
    if filter_current:
        if status_source_branch is None:
            return ()
        return tuple(sorted(records_by_branch.get(status_source_branch, {})))

    slugs = set(records_by_branch.get(base_branch, {}))
    for branch in local_branches:
        if branch == base_branch:
            continue
        slugs.update(records_by_branch.get(branch, {}))
    return tuple(sorted(slugs))


def _source_status(
    slug: str,
    *,
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]],
    local_branches: tuple[str, ...],
    base_branch: str,
    status_source_branch: str | None,
    filter_current: bool,
) -> ObjectiveStatus | None:
    if status_source_branch is None:
        return None

    source_records = records_by_branch.get(status_source_branch, {})
    if slug in source_records:
        return source_records[slug]
    if filter_current:
        return None

    for branch in local_branches:
        if branch != base_branch and slug in records_by_branch.get(branch, {}):
            return "in-flight"
    return None


def _matches_status_filter(status: ObjectiveStatus, status_filter: ObjectiveStatusFilter) -> bool:
    if status_filter == "all":
        return True
    if status_filter == "active":
        return status in {"open", "in-flight"}
    return status == status_filter


def _build_objective_group(
    git: GitGateway,
    *,
    slug: str,
    status: ObjectiveStatus,
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]],
    local_branches: tuple[str, ...],
    base_branch: str,
    status_source_branch: str | None,
) -> ObjectiveListGroup:
    if status_source_branch is None:
        raise AssertionError("status_source_branch must be present when building groups")

    source_touch = git.path_last_touched(_branch_ref(status_source_branch), _objective_path(slug))
    source_entry = ObjectiveStatusSourceEntry(
        branch=status_source_branch,
        status=status,
        updated_iso=_touch_updated_iso(source_touch),
        present=slug in records_by_branch.get(status_source_branch, {}),
    )

    branch_entries: list[ObjectiveBranchEntry] = []
    touch_candidates: list[_ObjectiveTouchCandidate] = []
    if source_touch is not None:
        touch_candidates.append(
            _ObjectiveTouchCandidate(
                branch=status_source_branch,
                ref_name=_branch_ref(status_source_branch),
                touch=source_touch,
                is_work_branch=status_source_branch != base_branch,
            )
        )

    for branch in sorted(local_branches):
        if branch == base_branch:
            continue
        branch_records = records_by_branch.get(branch, {})
        if slug not in branch_records:
            continue
        branch_touch = git.path_last_touched(_branch_ref(branch), _objective_path(slug))
        branch_entries.append(
            ObjectiveBranchEntry(
                branch=branch,
                status=branch_records[slug],
                updated_iso=_touch_updated_iso(branch_touch),
                ahead_base=_ahead_base(git, base_branch=base_branch, branch=branch),
            )
        )
        if branch_touch is not None:
            touch_candidates.append(
                _ObjectiveTouchCandidate(
                    branch=branch,
                    ref_name=_branch_ref(branch),
                    touch=branch_touch,
                    is_work_branch=True,
                )
            )

    latest_touch = _latest_touch_candidate(touch_candidates)
    latest_update_iso = _touch_updated_iso(latest_touch.touch) if latest_touch is not None else None
    latest_work_branch = _latest_work_branch(git, latest_touch, touch_candidates)

    return ObjectiveListGroup(
        slug=slug,
        status=status,
        status_source_entry=source_entry,
        branches=tuple(branch_entries),
        latest_update_iso=latest_update_iso,
        latest_work_branch=latest_work_branch,
    )


def _ahead_base(git: GitGateway, *, base_branch: str, branch: str) -> int:
    ahead_result = git.count_commits_in_range(f"{base_branch}..{branch}")
    if isinstance(ahead_result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_ahead_count_failed",
            message=ahead_result.message,
        )
    return ahead_result


def _objective_statuses_from_paths(
    paths: tuple[str, ...],
) -> tuple[tuple[str, ObjectiveRecordStatus], ...]:
    slugs: set[str] = set()
    closed_slugs: set[str] = set()
    prefix = f"{OBJECTIVE_ROOT}/"

    for path in paths:
        if not path.startswith(prefix):
            continue
        rest = path.removeprefix(prefix)
        slug, separator, child_path = rest.partition("/")
        if slug == "" or separator == "":
            continue
        slugs.add(slug)
        if child_path == "closed.md":
            closed_slugs.add(slug)

    return tuple((slug, "closed" if slug in closed_slugs else "open") for slug in sorted(slugs))


def _branch_ref(branch: str) -> str:
    return f"refs/heads/{branch}"


def _objective_path(slug: str) -> str:
    return f"{OBJECTIVE_ROOT}/{slug}"


def _touch_updated_iso(touch: PathTouch | None) -> str | None:
    if touch is None:
        return None
    if _parse_iso_datetime(touch.committed_iso) is None:
        return None
    return touch.committed_iso


def _latest_touch_candidate(
    candidates: list[_ObjectiveTouchCandidate],
) -> _ObjectiveTouchCandidate | None:
    parsed_candidates: list[tuple[datetime, _ObjectiveTouchCandidate]] = []
    for candidate in candidates:
        parsed_dt = _parse_iso_datetime(candidate.touch.committed_iso)
        if parsed_dt is not None:
            parsed_candidates.append((parsed_dt, candidate))

    if parsed_candidates:
        latest_dt = max(parsed_dt for parsed_dt, _candidate in parsed_candidates)
        latest_candidates = [
            candidate for parsed_dt, candidate in parsed_candidates if parsed_dt == latest_dt
        ]
        return min(latest_candidates, key=lambda candidate: candidate.ref_name)

    if not candidates:
        return None
    return min(candidates, key=lambda candidate: candidate.ref_name)


def _latest_work_branch(
    git: GitGateway,
    latest_touch: _ObjectiveTouchCandidate | None,
    candidates: list[_ObjectiveTouchCandidate],
) -> str | None:
    if latest_touch is None:
        return None

    matching_work_candidates = [
        candidate
        for candidate in candidates
        if candidate.is_work_branch and candidate.touch.oid == latest_touch.touch.oid
    ]
    if not matching_work_candidates:
        return None

    return min(
        matching_work_candidates,
        key=lambda candidate: (_distance_from_touch(git, candidate), candidate.branch),
    ).branch


def _distance_from_touch(git: GitGateway, candidate: _ObjectiveTouchCandidate) -> int:
    distance = git.count_commits_in_range(f"{candidate.touch.oid}..{candidate.branch}")
    if isinstance(distance, GitCommandFailure):
        return 1_000_000_000
    return distance


def _parse_iso_datetime(iso_timestamp: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _format_optional_branch(branch: str | None) -> str:
    if branch is None:
        return "—"
    return branch


def _format_optional_branch_md(branch: str | None) -> str:
    if branch is None:
        return "—"
    return f"`{branch}`"


def _format_age(iso_timestamp: str | None) -> str:
    formatted = format_relative_time(iso_timestamp)
    if formatted == "":
        return "—"
    return formatted


def _max_ahead_base(group: ObjectiveListGroup) -> int:
    return max((entry.ahead_base for entry in group.branches), default=0)
