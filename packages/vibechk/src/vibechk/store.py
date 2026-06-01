from __future__ import annotations

import json
import os
from collections.abc import Callable, Mapping
from pathlib import Path

from vibechk.errors import VibechkError
from vibechk.models import LoadedBundle, RunBundle

MAX_RUN_ID_ATTEMPTS = 100
RUNS_DIR_NAME = "runs"
BUNDLE_FILE_NAME = "bundle.json"
PLAN_FILE_NAME = "plan.md"
TRANSCRIPT_FILE_NAME = "transcript.txt"
DIFF_FILE_NAME = "diff.patch"
ARTIFACTS_DIR_NAME = "artifacts"


def resolve_store_root(explicit: Path | None, env: Mapping[str, str] = os.environ) -> Path:
    if explicit is not None:
        return explicit.expanduser()

    vibechk_home = env.get("VIBECHK_HOME")
    if vibechk_home:
        return Path(vibechk_home).expanduser()

    xdg_state_home = env.get("XDG_STATE_HOME")
    if xdg_state_home:
        return Path(xdg_state_home).expanduser() / "vibechk"

    return Path.home() / ".local" / "state" / "vibechk"


def create_run_dir(
    store_root: Path,
    id_generator: Callable[[], str],
    *,
    max_attempts: int = MAX_RUN_ID_ATTEMPTS,
) -> tuple[str, Path]:
    runs_dir = store_root / RUNS_DIR_NAME
    runs_dir.mkdir(parents=True, exist_ok=True)

    for _attempt in range(max_attempts):
        run_id = id_generator().lower()
        run_dir = runs_dir / run_id
        if run_dir.exists():
            continue
        run_dir.mkdir()
        (run_dir / ARTIFACTS_DIR_NAME).mkdir()
        return run_id, run_dir

    raise VibechkError(f"Could not allocate a unique run id after {max_attempts} attempts.")


def write_bundle(run_dir: Path, bundle: RunBundle) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = run_dir / BUNDLE_FILE_NAME
    tmp_path = run_dir / f"{BUNDLE_FILE_NAME}.tmp"
    payload = json.dumps(bundle.to_json(), indent=2, sort_keys=True)
    tmp_path.write_text(f"{payload}\n", encoding="utf-8")
    tmp_path.replace(bundle_path)


def read_bundle(store_root: Path, id_or_prefix: str) -> LoadedBundle:
    run_id = resolve_run_id(store_root, id_or_prefix)
    run_dir = store_root / RUNS_DIR_NAME / run_id
    return _load_bundle_from_run_dir(run_dir, context=f"Run '{run_id}'")


def list_bundles(store_root: Path) -> list[LoadedBundle]:
    runs_dir = store_root / RUNS_DIR_NAME
    if not runs_dir.exists():
        return []
    if not runs_dir.is_dir():
        raise VibechkError(f"Runs path {runs_dir} is not a directory.")

    loaded: list[LoadedBundle] = []
    for run_dir in runs_dir.iterdir():
        if not run_dir.is_dir():
            continue
        loaded.append(
            _load_bundle_from_run_dir(
                run_dir,
                context=f"Run directory {run_dir}",
            )
        )

    loaded.sort(key=lambda item: item.bundle.run_id)
    loaded.sort(key=lambda item: item.bundle.started_at, reverse=True)
    return loaded


def resolve_run_id(store_root: Path, id_or_prefix: str) -> str:
    runs_dir = store_root / RUNS_DIR_NAME
    if not runs_dir.exists():
        raise VibechkError(f"No run matches prefix '{id_or_prefix}'.")

    exact_dir = runs_dir / id_or_prefix
    if exact_dir.is_dir():
        return id_or_prefix

    matches = sorted(
        path.name
        for path in runs_dir.iterdir()
        if path.is_dir() and path.name.startswith(id_or_prefix)
    )
    if not matches:
        raise VibechkError(f"No run matches prefix '{id_or_prefix}'.")
    if len(matches) > 1:
        joined = ", ".join(matches)
        raise VibechkError(f"Run prefix '{id_or_prefix}' is ambiguous: {joined}.")
    return matches[0]


def _load_bundle_from_run_dir(run_dir: Path, *, context: str) -> LoadedBundle:
    bundle_path = run_dir / BUNDLE_FILE_NAME
    if not bundle_path.exists():
        raise VibechkError(f"{context} is missing bundle.json.")

    try:
        data = json.loads(bundle_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise VibechkError(f"{context} has an invalid bundle.json: {error}") from error
    except OSError as error:
        raise VibechkError(f"{context} has an unreadable bundle.json: {error}") from error

    if not isinstance(data, dict):
        raise VibechkError(f"{context} has an invalid bundle.json.")

    try:
        bundle = RunBundle.from_json(data)
    except (KeyError, TypeError, ValueError) as error:
        raise VibechkError(f"{context} has an invalid bundle.json: {error}") from error

    return LoadedBundle(
        run_dir=run_dir,
        bundle=bundle,
        plan_text=_read_optional_text(run_dir / PLAN_FILE_NAME),
        transcript=_read_optional_text(run_dir / TRANSCRIPT_FILE_NAME),
        diff_patch=_read_optional_text(run_dir / DIFF_FILE_NAME),
    )


def _read_optional_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")
