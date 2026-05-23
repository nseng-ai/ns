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
    bundle_path = run_dir / BUNDLE_FILE_NAME
    if not bundle_path.exists():
        raise VibechkError(f"Run '{run_id}' is missing bundle.json.")

    data = json.loads(bundle_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise VibechkError(f"Run '{run_id}' has an invalid bundle.json.")

    try:
        bundle = RunBundle.from_json(data)
    except (KeyError, TypeError, ValueError) as error:
        raise VibechkError(f"Run '{run_id}' has an invalid bundle.json: {error}") from error

    return LoadedBundle(
        run_dir=run_dir,
        bundle=bundle,
        plan_text=_read_optional_text(run_dir / PLAN_FILE_NAME),
        transcript=_read_optional_text(run_dir / TRANSCRIPT_FILE_NAME),
        diff_patch=_read_optional_text(run_dir / DIFF_FILE_NAME),
    )


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


def _read_optional_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")
