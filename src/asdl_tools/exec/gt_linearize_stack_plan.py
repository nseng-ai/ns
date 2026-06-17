"""Hidden exec operation for read-only Graphite descendant linearization planning."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal, Protocol

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git import commands
from asdl_core.git.construction import resolve_repo_root, resolve_trunk_branch
from asdl_core.gt.metadata_reader import read_branch_graph_from_metadata_db
from asdl_core.gt.types import BranchMetadataGraphRow, GtCommandFailure

subprocess = commands.subprocess
run_git_command = commands.run_git_command

ActionKind = Literal[
    "keep",
    "move_to_trunk",
    "move_under_branch",
    "drop_duplicate",
    "manual_consolidation",
]
Confidence = Literal["high", "medium", "low"]
Scope = Literal["descendants_only", "include_target"]


class GtLinearizeStackPlanRequest(ClinkrModel):
    target_branch: Annotated[
        str,
        click.Argument(["target_branch"], type=click.STRING),
    ]
    repo_root: Annotated[
        Path | None,
        click.Option(
            ["--repo-root"],
            type=click.Path(path_type=Path, file_okay=False, dir_okay=True),
            default=None,
            help="Repository root. Defaults to the current git repo root.",
        ),
    ] = None
    trunk: Annotated[
        str | None,
        click.Option(
            ["--trunk"],
            type=click.STRING,
            default=None,
            help="Graphite trunk branch override. Defaults to gt trunk, then git trunk fallback.",
        ),
    ] = None
    include_target: Annotated[
        bool,
        click.Option(
            ["--include-target"],
            is_flag=True,
            default=False,
            help="Include the target branch in the rewrite scope. Default: descendants only.",
        ),
    ] = False
    max_descendants: Annotated[
        int,
        click.Option(
            ["--max-descendants"],
            type=click.IntRange(min=1),
            default=50,
            help="Safety cap for descendants to inspect.",
        ),
    ] = 50


class ProposedStackNodeDto(ClinkrModel):
    branch_name: str
    parent: str | None


class BranchActionDto(ClinkrModel):
    branch_name: str
    current_parent: str | None
    proposed_parent: str | None
    action: ActionKind
    confidence: Confidence
    evidence: list[str]
    risks: list[str]


class CloseCandidateDto(ClinkrModel):
    branch_name: str
    reason: str
    confidence: Confidence


class LinearizeStackPlanErrorDto(ClinkrModel):
    code: str
    message: str


class LinearizeStackPlanResult(ClinkrModel):
    success: bool
    target_branch: str
    trunk_branch: str | None
    scope: Scope
    proposed_stack: list[ProposedStackNodeDto]
    actions: list[BranchActionDto]
    close_candidates: list[CloseCandidateDto]
    warnings: list[str]
    error: LinearizeStackPlanErrorDto | None


@dataclass(frozen=True)
class PlanningProblem:
    code: str
    message: str


@dataclass(frozen=True)
class BranchFacts:
    branch_name: str
    current_parent: str | None
    commits: tuple[str, ...]
    changed_paths: tuple[str, ...]
    patch_ids: tuple[str, ...]
    merge_tree_conflicts_on_trunk: bool
    dependency_signals: tuple[str, ...]


class LinearizePlannerFacts(Protocol):
    def local_branches(self) -> tuple[str, ...]:
        """Return local branch names."""

    def branch_rows(self) -> dict[str, BranchMetadataGraphRow] | PlanningProblem:
        """Return Graphite metadata rows by branch name."""

    def trunk_branch(self) -> str | PlanningProblem:
        """Return Graphite trunk branch."""

    def commits(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        """Return commit subjects in ``parent..branch`` newest-first."""

    def patch_ids(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        """Return stable patch IDs in ``parent..branch``."""

    def changed_paths(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        """Return changed paths in ``parent..branch``."""

    def merge_tree_has_conflicts(
        self,
        *,
        trunk_branch: str,
        parent: str | None,
        branch: str,
    ) -> bool | PlanningProblem:
        """Return whether applying branch delta to trunk has textual conflicts."""


@dataclass(frozen=True)
class RealLinearizePlannerFacts:
    repo_root: Path
    explicit_trunk: str | None = None

    def local_branches(self) -> tuple[str, ...]:
        result = run_git_command(
            ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
            cwd=self.repo_root,
            check=True,
        )
        return tuple(line for line in result.stdout.splitlines() if line)

    def branch_rows(self) -> dict[str, BranchMetadataGraphRow] | PlanningProblem:
        common_dir = _git_common_dir(self.repo_root)
        if isinstance(common_dir, PlanningProblem):
            return common_dir
        graph = read_branch_graph_from_metadata_db(common_dir / ".graphite_metadata.db")
        if isinstance(graph, GtCommandFailure):
            return PlanningProblem(code="graphite_metadata_unreadable", message=graph.message)
        rows = graph.rows_by_name()
        if not rows:
            return PlanningProblem(
                code="graphite_metadata_empty",
                message="Graphite metadata store contains no branch rows.",
            )
        return rows

    def trunk_branch(self) -> str | PlanningProblem:
        if self.explicit_trunk is not None:
            return self.explicit_trunk

        gt_result = run_git_command(
            ["gt", "trunk", "--no-interactive"], cwd=self.repo_root, check=False
        )
        if gt_result.returncode == 0:
            trunk = gt_result.stdout.strip()
            if trunk:
                return trunk

        trunk = resolve_trunk_branch(self.repo_root)
        if trunk is not None:
            return trunk
        return PlanningProblem(
            code="trunk_unresolved",
            message="Could not resolve Graphite trunk or git trunk branch.",
        )

    def commits(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        result = _run_git_range(self.repo_root, parent, branch, ["git", "log", "--format=%s"])
        if isinstance(result, PlanningProblem):
            return result
        return tuple(line for line in result.splitlines() if line)

    def patch_ids(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        range_spec = _range_spec(parent, branch)
        log_proc = subprocess.Popen(
            ["git", "log", "-p", "--no-merges", "--format=%H", range_spec],
            cwd=self.repo_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        patch_proc = subprocess.Popen(
            ["git", "patch-id", "--stable"],
            cwd=self.repo_root,
            stdin=log_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if log_proc.stdout is not None:
            log_proc.stdout.close()
        patch_stdout, patch_stderr = patch_proc.communicate()
        log_proc.wait()
        log_stderr = log_proc.stderr.read() if log_proc.stderr is not None else ""
        if log_proc.stderr is not None:
            log_proc.stderr.close()
        if log_proc.returncode != 0:
            return PlanningProblem(
                code="git_log_failed",
                message=log_stderr.strip() or f"git log failed for {range_spec}",
            )
        if patch_proc.returncode != 0:
            return PlanningProblem(
                code="git_patch_id_failed",
                message=patch_stderr.strip() or f"git patch-id failed for {range_spec}",
            )
        return tuple(line.split()[0] for line in patch_stdout.splitlines() if line.split())

    def changed_paths(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        result = _run_git_range(self.repo_root, parent, branch, ["git", "diff", "--name-only"])
        if isinstance(result, PlanningProblem):
            return result
        return tuple(sorted(line for line in result.splitlines() if line))

    def merge_tree_has_conflicts(
        self,
        *,
        trunk_branch: str,
        parent: str | None,
        branch: str,
    ) -> bool | PlanningProblem:
        if parent is None:
            return False
        result = run_git_command(
            ["git", "merge-tree", trunk_branch, parent, branch],
            cwd=self.repo_root,
            check=False,
        )
        if result.returncode not in (0, 1):
            return PlanningProblem(
                code="git_merge_tree_failed",
                message=result.stderr.strip() or f"git merge-tree failed for {branch}",
            )
        output = f"{result.stdout}\n{result.stderr}"
        return result.returncode == 1 or "<<<<<<<" in output or "changed in both" in output


def render_linearize_stack_plan(result: LinearizeStackPlanResult) -> None:
    if not result.success:
        message = result.error.message if result.error is not None else "Could not plan stack."
        click.echo(message, err=True)
        return

    click.echo(f"Target: {result.target_branch}")
    click.echo(f"Trunk: {result.trunk_branch}")
    click.echo("Proposed final stack:")
    for node in result.proposed_stack:
        parent = node.parent if node.parent is not None else "<drop>"
        click.echo(f"- {parent} -> {node.branch_name}")
    click.echo("Actions:")
    for action in result.actions:
        parent = action.proposed_parent if action.proposed_parent is not None else "<none>"
        click.echo(f"- {action.branch_name}: {action.action} -> {parent} ({action.confidence})")
    if result.close_candidates:
        click.echo("Close candidates:")
        for candidate in result.close_candidates:
            click.echo(f"- {candidate.branch_name}: {candidate.reason} ({candidate.confidence})")
    for warning in result.warnings:
        click.echo(f"warning: {warning}", err=True)


@clinkr_operation(
    name="gt-linearize-stack-plan",
    help="Plan a read-only Graphite descendant stack linearization proposal.",
    human_renderer=render_linearize_stack_plan,
)
def run_gt_linearize_stack_plan(
    ctx: click.Context,
    request: GtLinearizeStackPlanRequest,
) -> ClinkrExit[LinearizeStackPlanResult]:
    del ctx
    repo_root = _resolve_requested_repo_root(request.repo_root)
    if isinstance(repo_root, PlanningProblem):
        return ClinkrExit.failure(error_type=repo_root.code, message=repo_root.message)

    facts = RealLinearizePlannerFacts(repo_root=repo_root, explicit_trunk=request.trunk)
    result = build_linearize_stack_plan(
        facts=facts,
        target_branch=request.target_branch,
        include_target=request.include_target,
        max_descendants=request.max_descendants,
    )
    if not result.success:
        assert result.error is not None
        return ClinkrExit.negative(result, message=result.error.message)
    return ClinkrExit.ok(result)


def build_linearize_stack_plan(
    *,
    facts: LinearizePlannerFacts,
    target_branch: str,
    include_target: bool,
    max_descendants: int,
) -> LinearizeStackPlanResult:
    trunk = facts.trunk_branch()
    if isinstance(trunk, PlanningProblem):
        return _failed_result(
            request_target=target_branch,
            scope=_scope(include_target),
            trunk_branch=None,
            problem=trunk,
        )

    local_branches = set(facts.local_branches())
    if target_branch not in local_branches:
        return _failed_result(
            request_target=target_branch,
            scope=_scope(include_target),
            trunk_branch=trunk,
            problem=PlanningProblem(
                code="unknown_target_branch",
                message=f"Target branch is not a local branch: {target_branch}",
            ),
        )

    rows = facts.branch_rows()
    if isinstance(rows, PlanningProblem):
        return _failed_result(
            request_target=target_branch,
            scope=_scope(include_target),
            trunk_branch=trunk,
            problem=rows,
        )
    if target_branch not in rows:
        return _failed_result(
            request_target=target_branch,
            scope=_scope(include_target),
            trunk_branch=trunk,
            problem=PlanningProblem(
                code="target_not_tracked_by_graphite",
                message=f"Target branch is not tracked by Graphite: {target_branch}",
            ),
        )

    descendants, warnings = _walk_descendants(rows, target_branch, max_descendants)
    scoped_branches = (target_branch, *descendants) if include_target else descendants
    actions: list[BranchActionDto] = []
    close_candidates: list[CloseCandidateDto] = []
    proposed_stack: list[ProposedStackNodeDto] = [
        ProposedStackNodeDto(branch_name=target_branch, parent=rows[target_branch].parent)
    ]
    seen_patch_ids: set[str] = set()

    for branch in scoped_branches:
        if branch not in local_branches:
            actions.append(
                BranchActionDto(
                    branch_name=branch,
                    current_parent=rows[branch].parent if branch in rows else None,
                    proposed_parent=None,
                    action="manual_consolidation",
                    confidence="low",
                    evidence=[
                        "Graphite metadata references this branch, but no local branch exists."
                    ],
                    risks=["Fetch or recreate the local branch before rewriting the stack."],
                )
            )
            continue
        branch_facts = _collect_branch_facts(facts, rows, trunk, branch)
        if isinstance(branch_facts, PlanningProblem):
            return _failed_result(
                request_target=target_branch,
                scope=_scope(include_target),
                trunk_branch=trunk,
                problem=branch_facts,
            )
        action = _classify_branch(branch_facts, trunk, seen_patch_ids)
        actions.append(action)
        if action.action == "drop_duplicate":
            close_candidates.append(
                CloseCandidateDto(
                    branch_name=branch,
                    reason="High-confidence exact/no-op or patch-subsumed duplicate.",
                    confidence=action.confidence,
                )
            )
        elif action.action != "move_to_trunk":
            proposed_stack.append(
                ProposedStackNodeDto(branch_name=branch, parent=action.proposed_parent)
            )
        seen_patch_ids.update(branch_facts.patch_ids)

    return LinearizeStackPlanResult(
        success=True,
        target_branch=target_branch,
        trunk_branch=trunk,
        scope=_scope(include_target),
        proposed_stack=proposed_stack,
        actions=actions,
        close_candidates=close_candidates,
        warnings=warnings,
        error=None,
    )


def _walk_descendants(
    rows: dict[str, BranchMetadataGraphRow],
    target_branch: str,
    max_descendants: int,
) -> tuple[tuple[str, ...], list[str]]:
    descendants: list[str] = []
    warnings: list[str] = []
    queue = list(rows[target_branch].children)
    visited = {target_branch}
    while queue:
        branch = queue.pop(0)
        if branch in visited:
            warnings.append(f"cycle detected in Graphite children metadata at {branch}")
            continue
        visited.add(branch)
        descendants.append(branch)
        if len(descendants) >= max_descendants:
            warnings.append(f"descendant traversal stopped at --max-descendants={max_descendants}")
            return tuple(descendants), warnings
        row = rows.get(branch)
        if row is None:
            warnings.append(f"child branch {branch} is missing from Graphite metadata")
            continue
        queue.extend(child for child in row.children if child not in visited)
    return tuple(descendants), warnings


def _collect_branch_facts(
    facts: LinearizePlannerFacts,
    rows: dict[str, BranchMetadataGraphRow],
    trunk: str,
    branch: str,
) -> BranchFacts | PlanningProblem:
    parent = rows[branch].parent
    commits = facts.commits(parent, branch)
    if isinstance(commits, PlanningProblem):
        return commits
    patch_ids = facts.patch_ids(parent, branch)
    if isinstance(patch_ids, PlanningProblem):
        return patch_ids
    changed_paths = facts.changed_paths(parent, branch)
    if isinstance(changed_paths, PlanningProblem):
        return changed_paths
    conflicts = facts.merge_tree_has_conflicts(trunk_branch=trunk, parent=parent, branch=branch)
    if isinstance(conflicts, PlanningProblem):
        return conflicts
    dependency_signals = _dependency_signals(facts, rows, branch, commits, changed_paths)
    if isinstance(dependency_signals, PlanningProblem):
        return dependency_signals
    return BranchFacts(
        branch_name=branch,
        current_parent=parent,
        commits=commits,
        changed_paths=changed_paths,
        patch_ids=patch_ids,
        merge_tree_conflicts_on_trunk=conflicts,
        dependency_signals=dependency_signals,
    )


def _dependency_signals(
    facts: LinearizePlannerFacts,
    rows: dict[str, BranchMetadataGraphRow],
    branch: str,
    commits: tuple[str, ...],
    changed_paths: tuple[str, ...],
) -> tuple[str, ...] | PlanningProblem:
    row = rows[branch]
    parent = row.parent
    signals: list[str] = []
    if parent is not None and parent in rows:
        parent_paths = facts.changed_paths(rows[parent].parent, parent)
        if isinstance(parent_paths, PlanningProblem):
            return parent_paths
        overlap = sorted(set(changed_paths).intersection(parent_paths))
        if overlap:
            signals.append(
                f"changed paths overlap Graphite parent {parent}: {', '.join(overlap[:3])}"
            )
    branch_names = set(rows)
    for subject in commits:
        for candidate in sorted(branch_names):
            if candidate != branch and candidate in subject:
                signals.append(f"commit subject references {candidate}: {subject}")
                break
    return tuple(signals)


def _classify_branch(
    branch_facts: BranchFacts,
    trunk: str,
    seen_patch_ids: set[str],
) -> BranchActionDto:
    evidence: list[str] = []
    risks: list[str] = []
    patch_ids = set(branch_facts.patch_ids)

    if not branch_facts.commits or not branch_facts.changed_paths:
        evidence.append("No unique commits or changed paths relative to current Graphite parent.")
        return BranchActionDto(
            branch_name=branch_facts.branch_name,
            current_parent=branch_facts.current_parent,
            proposed_parent=None,
            action="drop_duplicate",
            confidence="high",
            evidence=evidence,
            risks=risks,
        )

    if patch_ids and patch_ids.issubset(seen_patch_ids):
        evidence.append("All stable patch IDs are already covered by earlier kept branches.")
        return BranchActionDto(
            branch_name=branch_facts.branch_name,
            current_parent=branch_facts.current_parent,
            proposed_parent=None,
            action="drop_duplicate",
            confidence="high",
            evidence=evidence,
            risks=risks,
        )

    if patch_ids.intersection(seen_patch_ids):
        evidence.append("Some patch IDs overlap earlier kept branches, but residue remains.")
        risks.append("Bundled fork: manual consolidation is safer than automatic drop.")
        return BranchActionDto(
            branch_name=branch_facts.branch_name,
            current_parent=branch_facts.current_parent,
            proposed_parent=branch_facts.current_parent,
            action="manual_consolidation",
            confidence="medium",
            evidence=evidence,
            risks=risks,
        )

    if not branch_facts.merge_tree_conflicts_on_trunk and not branch_facts.dependency_signals:
        evidence.append(
            "git merge-tree applies the branch delta to trunk without textual conflicts."
        )
        return BranchActionDto(
            branch_name=branch_facts.branch_name,
            current_parent=branch_facts.current_parent,
            proposed_parent=trunk,
            action="move_to_trunk",
            confidence="medium",
            evidence=evidence,
            risks=["No textual conflicts is not proof of semantic independence."],
        )

    if branch_facts.merge_tree_conflicts_on_trunk:
        evidence.append("git merge-tree reports conflicts when applying the branch delta to trunk.")
    for signal in branch_facts.dependency_signals:
        evidence.append(signal)
    return BranchActionDto(
        branch_name=branch_facts.branch_name,
        current_parent=branch_facts.current_parent,
        proposed_parent=branch_facts.current_parent,
        action="keep",
        confidence="medium",
        evidence=evidence,
        risks=risks,
    )


def _scope(include_target: bool) -> Scope:
    if include_target:
        return "include_target"
    return "descendants_only"


def _resolve_requested_repo_root(explicit_repo_root: Path | None) -> Path | PlanningProblem:
    if explicit_repo_root is not None:
        return explicit_repo_root
    cwd = Path.cwd()
    repo_root = resolve_repo_root(cwd)
    if repo_root is not None:
        return repo_root
    return PlanningProblem(
        code="not_a_git_repo",
        message=f"Not inside a git repository: {cwd}. Run from a checkout or pass --repo-root.",
    )


def _git_common_dir(repo_root: Path) -> Path | PlanningProblem:
    result = run_git_command(["git", "rev-parse", "--git-common-dir"], cwd=repo_root, check=False)
    if result.returncode != 0:
        return PlanningProblem(
            code="git_common_dir_unresolved",
            message=result.stderr.strip() or "Could not resolve git common dir.",
        )
    raw = result.stdout.strip()
    if not raw:
        return PlanningProblem(
            code="git_common_dir_unresolved", message="git common dir was empty."
        )
    path = Path(raw)
    if path.is_absolute():
        return path
    return (repo_root / path).resolve()


def _range_spec(parent: str | None, branch: str) -> str:
    if parent is None:
        return branch
    return f"{parent}..{branch}"


def _run_git_range(
    repo_root: Path,
    parent: str | None,
    branch: str,
    base_command: list[str],
) -> str | PlanningProblem:
    range_spec = _range_spec(parent, branch)
    result = run_git_command([*base_command, range_spec], cwd=repo_root, check=False)
    if result.returncode != 0:
        return PlanningProblem(
            code="git_range_failed",
            message=result.stderr.strip() or f"git command failed for {range_spec}",
        )
    return result.stdout


def _failed_result(
    *,
    problem: PlanningProblem,
    request: GtLinearizeStackPlanRequest | None = None,
    request_target: str | None = None,
    scope: Scope | None = None,
    trunk_branch: str | None,
) -> LinearizeStackPlanResult:
    if request is not None:
        target_branch = request.target_branch
        result_scope = _scope(request.include_target)
    else:
        assert request_target is not None
        assert scope is not None
        target_branch = request_target
        result_scope = scope
    return LinearizeStackPlanResult(
        success=False,
        target_branch=target_branch,
        trunk_branch=trunk_branch,
        scope=result_scope,
        proposed_stack=[],
        actions=[],
        close_candidates=[],
        warnings=[],
        error=LinearizeStackPlanErrorDto(code=problem.code, message=problem.message),
    )
