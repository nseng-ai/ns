from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from vibechk.deps import CliDeps
from vibechk.errors import VibechkError
from vibechk.models import GitProvenance, Metrics, RunBundle, RunnerResult
from vibechk.runners import RunnerRequest
from vibechk.store import (
    ARTIFACTS_DIR_NAME,
    DIFF_FILE_NAME,
    PLAN_FILE_NAME,
    TRANSCRIPT_FILE_NAME,
    create_run_dir,
    resolve_store_root,
    write_bundle,
)

SCHEMA_VERSION = 1


@dataclass(frozen=True)
class RunExecutionResult:
    run_id: str
    exit_code: int


def execute_run(
    *,
    plan_path: Path,
    workdir: Path,
    runner_name: str,
    model: str | None,
    store: Path | None,
    deps: CliDeps,
) -> RunExecutionResult:
    resolved_plan_path = _resolve_plan_path(plan_path)
    resolved_workdir = _resolve_workdir(workdir)
    runner = deps.runner_registry.get(runner_name)
    git = deps.git_gateway_factory(resolved_workdir)

    repo_root = git.repo_root()
    starting_branch = git.current_branch()
    starting_commit = git.current_commit()
    remotes = git.remotes()
    if not git.is_clean():
        raise VibechkError(
            f"Workdir {resolved_workdir} has uncommitted changes; "
            "vibechk run requires a clean workdir."
        )

    plan_text = _read_plan_text(resolved_plan_path)
    store_root = resolve_store_root(store)
    run_id, run_dir = create_run_dir(store_root, deps.id_generator)
    artifacts_dir = run_dir / ARTIFACTS_DIR_NAME
    (run_dir / PLAN_FILE_NAME).write_text(plan_text, encoding="utf-8")

    started_at = deps.clock()
    runner_result = RunnerResult(
        exit_code=1,
        transcript="",
        metrics=Metrics(),
        artifacts={},
        runner_version=None,
    )
    runner_error: str | None = None
    transcript_path = run_dir / TRANSCRIPT_FILE_NAME
    with transcript_path.open("w", encoding="utf-8") as transcript_sink:
        try:
            runner_result = runner.run(
                RunnerRequest(
                    plan_text=plan_text,
                    workdir=resolved_workdir,
                    model=model,
                    run_id=run_id,
                    artifacts_dir=artifacts_dir,
                ),
                transcript_sink,
            )
        except VibechkError as error:
            runner_error = str(error)
            transcript_sink.write(f"Runner error: {runner_error}\n")

    if runner_result.transcript:
        current_transcript = transcript_path.read_text(encoding="utf-8")
        if not current_transcript:
            transcript_path.write_text(runner_result.transcript, encoding="utf-8")

    diff_patch = ""
    result_branch: str | None = None
    branch_created = False
    post_run_error: str | None = None
    try:
        diff_patch = git.diff_patch()
        (run_dir / DIFF_FILE_NAME).write_text(diff_patch, encoding="utf-8")
        if git.has_changes():
            result_branch = f"vibechk/{run_id}"
            git.create_result_branch_and_commit(
                result_branch,
                f"vibechk: capture run {run_id}",
            )
            branch_created = True
            git.checkout(starting_branch)
            if not git.is_clean():
                post_run_error = (
                    f"Workdir {resolved_workdir} was not clean after restoring "
                    f"branch {starting_branch}."
                )
    except VibechkError as error:
        post_run_error = str(error)
        if not (run_dir / DIFF_FILE_NAME).exists():
            (run_dir / DIFF_FILE_NAME).write_text(diff_patch, encoding="utf-8")

    finished_at = deps.clock()
    status = "success"
    error_message = runner_error or post_run_error
    if runner_result.exit_code != 0 or error_message is not None:
        status = "failed"

    bundle = RunBundle(
        schema_version=SCHEMA_VERSION,
        run_id=run_id,
        status=status,
        started_at=started_at,
        finished_at=finished_at,
        runner=runner.name,
        runner_version=runner_result.runner_version,
        model=model,
        plan_source=str(resolved_plan_path),
        workdir=str(resolved_workdir),
        git=GitProvenance(
            repo_root=repo_root,
            starting_branch=starting_branch,
            starting_commit=starting_commit,
            remotes=remotes,
        ),
        metrics=runner_result.metrics,
        result_branch=result_branch,
        branch_created=branch_created,
        runner_exit_code=runner_result.exit_code,
        error=error_message,
    )
    write_bundle(run_dir, bundle)

    if post_run_error is not None:
        raise VibechkError(post_run_error)

    exit_code = runner_result.exit_code
    if runner_error is not None and exit_code == 0:
        exit_code = 1
    return RunExecutionResult(run_id=run_id, exit_code=exit_code)


def _resolve_plan_path(plan_path: Path) -> Path:
    if not plan_path.exists():
        raise VibechkError(f"Plan path {plan_path} does not exist.")
    if not plan_path.is_file():
        raise VibechkError(f"Plan path {plan_path} is not a file.")
    return plan_path.resolve()


def _resolve_workdir(workdir: Path) -> Path:
    if not workdir.exists():
        raise VibechkError(f"Workdir {workdir} does not exist.")
    if not workdir.is_dir():
        raise VibechkError(f"Workdir {workdir} is not a directory.")
    return workdir.resolve()


def _read_plan_text(plan_path: Path) -> str:
    try:
        return plan_path.read_text(encoding="utf-8")
    except OSError as error:
        raise VibechkError(f"Plan path {plan_path} is not readable: {error}") from error
