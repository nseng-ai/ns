from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, WorktreeInfo
from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import (
    GtCommandFailure,
    StackInfo,
    StackWalkDiagnostic,
    StackWalkKind,
    StackWalkScope,
    UntrackedBranch,
    render_stack_walk_warning,
)
from asdl_slots.cli.main import build_cli
from asdl_slots.cli.slot.gt.context import SlotGtContext
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import RepoContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _StackBranchFakes:
    ctx: SlotGtContext
    git: FakeGitGateway
    gt: FakeGtGateway
    repo_root: Path


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _diagnostic(
    scope: StackWalkScope,
    kind: StackWalkKind,
    branch: str | None,
    *,
    children: tuple[str, ...] = (),
) -> StackWalkDiagnostic:
    return StackWalkDiagnostic(
        scope=scope,
        kind=kind,
        branch=branch,
        children=children,
    )


def _stack(
    *,
    current: str = "feat/B",
    trunk: str = "main",
    ancestors: tuple[str, ...] = ("main", "feat/A"),
    descendants: tuple[str, ...] = ("feat/C",),
    diagnostics: tuple[StackWalkDiagnostic, ...] = (),
) -> StackInfo:
    return StackInfo(
        trunk=trunk,
        current=current,
        ancestors=ancestors,
        children=descendants[:1],
        warnings=tuple(render_stack_walk_warning(diagnostic) for diagnostic in diagnostics),
        descendants=descendants,
        diagnostics=diagnostics,
    )


def _build_stack_fakes(
    tmp_path: Path,
    *,
    current_branch: str = "feat/B",
    stack_override: StackInfo | UntrackedBranch | GtCommandFailure | None = None,
    current_branch_result: str | DetachedHead | GitCommandFailure | None = None,
    trunk: str = "main",
) -> _StackBranchFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    slots_root = tmp_path / "slots"
    branch_result = current_branch if current_branch_result is None else current_branch_result
    branches = {trunk, current_branch}
    if isinstance(stack_override, StackInfo):
        branches.update(stack_override.ancestors)
        branches.update(stack_override.descendants)
        branches.add(stack_override.trunk)
        branches.add(stack_override.current)
    git = FakeGitGateway(
        repo_root=repo_root,
        branches=branches,
        worktrees=(WorktreeInfo(path=repo_root, branch=current_branch, is_bare=False),),
        current_branch_by_path={repo_root: branch_result},
        branch_head_oid_by_branch={branch: f"{branch}-oid" for branch in branches},
        existing_paths={repo_root},
        repository_root_by_cwd={repo_root: repo_root},
        trunk_branch=trunk,
    )
    repo = RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=slots_root / "repos" / "repo",
        worktrees_dir=slots_root / "repos" / "repo" / "worktrees",
    )
    slots_ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=FakeSlotsStorageGateway(existing_paths={repo_root}),
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )
    stack_value = stack_override if stack_override is not None else _stack(current=current_branch)
    gt = FakeGtGateway(
        branch_by_cwd={repo_root: current_branch},
        trunk=trunk,
        stack_by_branch={current_branch: stack_value},
    )
    return _StackBranchFakes(
        ctx=SlotGtContext(slots=slots_ctx, gt=gt),
        git=git,
        gt=gt,
        repo_root=repo_root,
    )


def _machine_payload(result_output: str) -> dict[str, Any]:
    payload = json.loads(result_output)
    assert isinstance(payload, dict)
    return payload


# -- help / hiddenness -------------------------------------------------------


def test_slot_gt_help_hides_exec(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "-h"])

    assert result.exit_code == 0, result.output
    assert "free-stack" in result.output
    assert "exec" not in result.output


def test_slot_gt_exec_stack_branches_help_works(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "exec", "stack-branches", "-h"])

    assert result.exit_code == 0, result.output
    assert "Usage: slot gt exec stack-branches" in result.output
    assert "--downstack" in result.output


# -- happy path / output shape ----------------------------------------------


def test_stack_branches_default_outputs_compact_json_line(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        stack_override=_stack(
            ancestors=("main", "feat/A", "feat/B"),
            descendants=("feat/C", "feat/A", "feat/D"),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert result.stdout == '{"branches":["feat/A","feat/B","feat/C","feat/D"]}\n'
    assert result.stderr == ""


def test_stack_branches_format_json_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        stack_override=_stack(descendants=("feat/C", "feat/D")),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "branches": ["feat/A", "feat/B", "feat/C", "feat/D"],
        "trunk": "main",
        "current": "feat/B",
        "scope": "full",
        "warnings": [],
    }


# -- current on trunk --------------------------------------------------------


def test_stack_branches_current_on_trunk_is_negative_default_mode(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="main",
        stack_override=_stack(current="main", ancestors=(), descendants=()),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 1
    assert result.stdout == ""
    assert "On trunk 'main'; no stack is checked out." in result.stderr


def test_stack_branches_current_on_trunk_format_json_has_empty_branches(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="main",
        stack_override=_stack(current="main", ancestors=(), descendants=()),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert result.exit_code == 1
    assert payload["exit_code"] == 1
    assert payload["data"]["branches"] == []
    assert payload["message"] == "On trunk 'main'; no stack is checked out."


def test_stack_branches_on_trunk_ignores_descendant_fork(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fork = _diagnostic("descendant", "fork", "main", children=("feat/A", "feat/B"))
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="main",
        stack_override=_stack(
            current="main",
            ancestors=(),
            descendants=("feat/A",),
            diagnostics=(fork,),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 1
    assert "fork" not in result.stderr
    assert "On trunk" in result.stderr


# -- gateway / preflight failures -------------------------------------------


@pytest.mark.parametrize(
    ("stack_result", "error_type", "message"),
    [
        (
            UntrackedBranch(message="current branch is not tracked by Graphite: feat/B"),
            "untracked_branch",
            "run `gt track` first",
        ),
        (
            GtCommandFailure(message="metadata unavailable", returncode=1),
            "gt_stack_read_failed",
            "metadata unavailable",
        ),
    ],
)
def test_stack_branches_stack_read_failures(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    stack_result: UntrackedBranch | GtCommandFailure,
    error_type: str,
    message: str,
) -> None:
    fakes = _build_stack_fakes(tmp_path, stack_override=stack_result)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == error_type
    assert message in payload["message"]


def test_stack_branches_git_current_branch_failed(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch_result=GitCommandFailure(message="git broke", returncode=1),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "git_current_branch_failed"
    assert payload["message"] == "git broke"


def test_stack_branches_detached_head(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_stack_fakes(tmp_path, current_branch_result=DetachedHead())

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "detached_head"
    assert "detached" in payload["message"]


# -- fail-closed diagnostic classification ----------------------------------


def test_stack_branches_full_scope_fork_fails_with_remediation(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostics = (_diagnostic("descendant", "fork", "feat/B", children=("feat/C", "feat/D")),)
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=diagnostics))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "forked_stack"
    assert "feat/B" in payload["message"]
    assert "feat/C" in payload["message"]
    assert "feat/D" in payload["message"]
    assert "--downstack" in payload["message"]


def test_stack_branches_two_forks_first_fork_wins(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    diagnostics = (
        _diagnostic("descendant", "fork", "feat/B", children=("feat/C", "feat/D")),
        _diagnostic("descendant", "fork", "feat/C", children=("feat/E", "feat/F")),
    )
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=diagnostics))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["error_type"] == "forked_stack"
    assert "feat/B" in payload["message"]
    assert "feat/E" not in payload["message"]


@pytest.mark.parametrize(
    "diagnostic",
    [
        _diagnostic("ancestor", "cycle", "feat/A"),
        _diagnostic("ancestor", "missing_row", "feat/A"),
        _diagnostic("descendant", "cycle", "feat/C"),
        _diagnostic("trunk_marker", "marker_missing", "main"),
        _diagnostic("trunk_marker", "marker_mismatch", "main", children=("master",)),
    ],
)
def test_stack_branches_metadata_inconsistent_failures(
    cli_group: ClinkrGroup, tmp_path: Path, diagnostic: StackWalkDiagnostic
) -> None:
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=(diagnostic,)))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "stack_metadata_inconsistent"
    assert payload["message"] == render_stack_walk_warning(diagnostic)


def test_stack_branches_co_occurring_marker_diagnostics_are_joined(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostics = (
        _diagnostic("trunk_marker", "marker_missing", "main"),
        _diagnostic("trunk_marker", "marker_multiple", "main", children=("main", "master")),
    )
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=diagnostics))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["error_type"] == "stack_metadata_inconsistent"
    assert "; " in payload["message"]
    assert "trunk row marker missing" in payload["message"]
    assert "multiple Graphite metadata rows" in payload["message"]


def test_stack_branches_marker_failure_wins_over_on_trunk_negative(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostic = _diagnostic("trunk_marker", "marker_missing", "main")
    fakes = _build_stack_fakes(
        tmp_path,
        current_branch="main",
        stack_override=_stack(
            current="main",
            ancestors=(),
            descendants=(),
            diagnostics=(diagnostic,),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "stack_metadata_inconsistent"


# -- load-scope relevance ----------------------------------------------------


def test_stack_branches_unrelated_children_json_diagnostic_is_ignored(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostic = _diagnostic("load", "children_invalid_json", "unrelated/branch")
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=(diagnostic,)))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 0
    assert payload["data"]["warnings"] == []


def test_stack_branches_current_children_json_diagnostic_fails_full_scope(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostic = _diagnostic("load", "children_invalid_json", "feat/B")
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=(diagnostic,)))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "stack_metadata_inconsistent"


def test_stack_branches_downstack_drops_children_json_diagnostic(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostic = _diagnostic("load", "children_invalid_json", "feat/B")
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=(diagnostic,)))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--downstack", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 0
    assert payload["data"]["warnings"] == []


# -- downstack warning downgrade --------------------------------------------


def test_stack_branches_downstack_descendant_fork_warns_default_mode(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostic = _diagnostic("descendant", "fork", "feat/B", children=("feat/C", "feat/D"))
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=(diagnostic,)))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--downstack"],
        obj=_obj(fakes.ctx),
    )

    assert result.exit_code == 0, result.output
    assert result.stdout == '{"branches":["feat/A","feat/B"]}\n'
    assert render_stack_walk_warning(diagnostic) in result.stderr


def test_stack_branches_downstack_descendant_fork_warns_json_mode(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    diagnostic = _diagnostic("descendant", "fork", "feat/B", children=("feat/C", "feat/D"))
    fakes = _build_stack_fakes(tmp_path, stack_override=_stack(diagnostics=(diagnostic,)))

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-branches", "--downstack", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert result.exit_code == 0, result.output
    assert payload["data"]["branches"] == ["feat/A", "feat/B"]
    assert payload["data"]["scope"] == "downstack"
    assert payload["data"]["warnings"] == [render_stack_walk_warning(diagnostic)]
