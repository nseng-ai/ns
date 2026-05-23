from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, Self

RunStatus = Literal["success", "failed"]


@dataclass(frozen=True)
class Metrics:
    wall_time_seconds: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None

    def to_json(self) -> dict[str, float | int | None]:
        return {
            "wall_time_seconds": self.wall_time_seconds,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "cost_usd": self.cost_usd,
        }

    @classmethod
    def from_json(cls, data: dict[str, object]) -> Self:
        return cls(
            wall_time_seconds=_float_or_none(data.get("wall_time_seconds")),
            input_tokens=_int_or_none(data.get("input_tokens")),
            output_tokens=_int_or_none(data.get("output_tokens")),
            total_tokens=_int_or_none(data.get("total_tokens")),
            cost_usd=_float_or_none(data.get("cost_usd")),
        )


@dataclass(frozen=True)
class GitProvenance:
    repo_root: Path
    starting_branch: str
    starting_commit: str
    remotes: dict[str, str]

    def to_json(self) -> dict[str, object]:
        return {
            "repo_root": str(self.repo_root),
            "starting_branch": self.starting_branch,
            "starting_commit": self.starting_commit,
            "remotes": self.remotes,
        }

    @classmethod
    def from_json(cls, data: dict[str, object]) -> Self:
        remotes: dict[str, str] = {}
        raw_remotes = data.get("remotes")
        if isinstance(raw_remotes, dict):
            remotes = {str(name): str(url) for name, url in raw_remotes.items()}
        return cls(
            repo_root=Path(str(data["repo_root"])),
            starting_branch=str(data["starting_branch"]),
            starting_commit=str(data["starting_commit"]),
            remotes=remotes,
        )


@dataclass(frozen=True)
class RunnerResult:
    exit_code: int
    transcript: str
    metrics: Metrics
    artifacts: dict[str, str]
    runner_version: str | None = None


@dataclass(frozen=True)
class RunBundle:
    schema_version: int
    run_id: str
    status: RunStatus
    started_at: datetime
    finished_at: datetime
    runner: str
    runner_version: str | None
    model: str | None
    plan_source: str
    workdir: str
    git: GitProvenance
    metrics: Metrics
    result_branch: str | None
    branch_created: bool
    runner_exit_code: int
    error: str | None

    def to_json(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "run_id": self.run_id,
            "status": self.status,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat(),
            "runner": self.runner,
            "runner_version": self.runner_version,
            "model": self.model,
            "plan_source": self.plan_source,
            "workdir": self.workdir,
            "git": self.git.to_json(),
            "metrics": self.metrics.to_json(),
            "result_branch": self.result_branch,
            "branch_created": self.branch_created,
            "runner_exit_code": self.runner_exit_code,
            "error": self.error,
        }

    @classmethod
    def from_json(cls, data: dict[str, object]) -> Self:
        return cls(
            schema_version=_required_int(data["schema_version"]),
            run_id=str(data["run_id"]),
            status=_run_status(data["status"]),
            started_at=datetime.fromisoformat(str(data["started_at"])),
            finished_at=datetime.fromisoformat(str(data["finished_at"])),
            runner=str(data["runner"]),
            runner_version=_str_or_none(data.get("runner_version")),
            model=_str_or_none(data.get("model")),
            plan_source=str(data["plan_source"]),
            workdir=str(data["workdir"]),
            git=GitProvenance.from_json(_dict_value(data["git"])),
            metrics=Metrics.from_json(_dict_value(data["metrics"])),
            result_branch=_str_or_none(data.get("result_branch")),
            branch_created=_required_bool(data["branch_created"]),
            runner_exit_code=_required_int(data["runner_exit_code"]),
            error=_str_or_none(data.get("error")),
        )


@dataclass(frozen=True)
class LoadedBundle:
    run_dir: Path
    bundle: RunBundle
    plan_text: str
    transcript: str
    diff_patch: str


def _run_status(value: object) -> RunStatus:
    if value == "success":
        return "success"
    if value == "failed":
        return "failed"
    msg = f"Invalid run status: {value}"
    raise ValueError(msg)


def _dict_value(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    msg = f"Expected JSON object, got {type(value).__name__}"
    raise ValueError(msg)


def _required_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    msg = f"Expected bool, got {type(value).__name__}"
    raise ValueError(msg)


def _required_int(value: object) -> int:
    parsed = _int_or_none(value)
    if parsed is None:
        msg = "Expected int, got null"
        raise ValueError(msg)
    return parsed


def _str_or_none(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _int_or_none(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        msg = "Expected int or null, got bool"
        raise ValueError(msg)
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value)
    msg = f"Expected int or null, got {type(value).__name__}"
    raise ValueError(msg)


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        msg = "Expected float or null, got bool"
        raise ValueError(msg)
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        return float(value)
    msg = f"Expected float or null, got {type(value).__name__}"
    raise ValueError(msg)
