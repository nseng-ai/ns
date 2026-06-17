from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

RENDER_SCRIPT = Path("ts/scripts/render-cli-shim.py")
TEMPLATE = Path("ts/scripts/source-cli-shim-template")
CLI_REL_PATH = Path("ts/packages/slot/src/cli.ts")


def _render_shim(
    tmp_path: Path,
    *,
    canonical_checkout: Path,
    install_hint: str = "just install-slot",
) -> Path:
    output_path = tmp_path / "slot"
    env = os.environ | {
        "ASDL_TEMPLATE": str(TEMPLATE),
        "ASDL_OUTPUT": str(output_path),
        "ASDL_TOOL": "slot",
        "ASDL_CANONICAL_CHECKOUT": str(canonical_checkout),
        "ASDL_CLI_REL_PATH": CLI_REL_PATH.as_posix(),
        "ASDL_INSTALL_HINT": install_hint,
    }
    subprocess.run([sys.executable, str(RENDER_SCRIPT)], check=True, env=env)
    return output_path


def _write_cli(checkout: Path, marker: str) -> None:
    cli_path = checkout / CLI_REL_PATH
    cli_path.parent.mkdir(parents=True)
    cli_path.write_text(
        "import { writeFileSync } from 'node:fs';\n"
        "writeFileSync("
        "process.env.ASDL_SHIM_RECORD_PATH ?? '', "
        f"'{marker}', "
        "{ encoding: 'utf-8' },"
        ");\n",
        encoding="utf-8",
    )


def _write_node_modules(checkout: Path) -> None:
    (checkout / "ts" / "node_modules").mkdir(parents=True)


def _run_shim(shim: Path, *, cwd: Path, record_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(shim)],
        cwd=cwd,
        env=os.environ | {"ASDL_SHIM_RECORD_PATH": str(record_path)},
        text=True,
        capture_output=True,
        check=False,
    )


def test_rendered_slot_shim_points_to_type_script_cli(tmp_path: Path) -> None:
    canonical_checkout = tmp_path / "canonical"

    shim = _render_shim(tmp_path, canonical_checkout=canonical_checkout)

    rendered = shim.read_text(encoding="utf-8")
    assert "tool=slot" in rendered
    assert f"canonical_checkout={canonical_checkout}" in rendered
    assert f"cli_rel_path={CLI_REL_PATH.as_posix()}" in rendered
    assert "@@ASDL_" not in rendered


def test_enclosing_checkout_wins_over_canonical_checkout(tmp_path: Path) -> None:
    canonical_checkout = tmp_path / "canonical"
    enclosing_checkout = tmp_path / "enclosing"
    record_path = tmp_path / "record.txt"
    _write_cli(canonical_checkout, "canonical")
    _write_node_modules(canonical_checkout)
    _write_cli(enclosing_checkout, "enclosing")
    _write_node_modules(enclosing_checkout)
    subprocess.run(["git", "init", "-q", str(enclosing_checkout)], check=True)
    shim = _render_shim(tmp_path, canonical_checkout=canonical_checkout)

    result = _run_shim(shim, cwd=enclosing_checkout, record_path=record_path)

    assert result.returncode == 0
    assert record_path.read_text(encoding="utf-8") == "enclosing"


def test_canonical_checkout_fallback_runs_outside_asdl_checkout(tmp_path: Path) -> None:
    canonical_checkout = tmp_path / "canonical"
    outside_checkout = tmp_path / "outside"
    outside_checkout.mkdir()
    record_path = tmp_path / "record.txt"
    _write_cli(canonical_checkout, "canonical")
    _write_node_modules(canonical_checkout)
    shim = _render_shim(tmp_path, canonical_checkout=canonical_checkout)

    result = _run_shim(shim, cwd=outside_checkout, record_path=record_path)

    assert result.returncode == 0
    assert record_path.read_text(encoding="utf-8") == "canonical"


def test_missing_node_modules_emits_install_hint_for_selected_checkout(tmp_path: Path) -> None:
    canonical_checkout = tmp_path / "canonical"
    enclosing_checkout = tmp_path / "enclosing"
    record_path = tmp_path / "record.txt"
    _write_cli(canonical_checkout, "canonical")
    _write_node_modules(canonical_checkout)
    _write_cli(enclosing_checkout, "enclosing")
    subprocess.run(["git", "init", "-q", str(enclosing_checkout)], check=True)
    shim = _render_shim(tmp_path, canonical_checkout=canonical_checkout)

    result = _run_shim(shim, cwd=enclosing_checkout, record_path=record_path)

    assert result.returncode == 2
    assert (
        f"slot: {enclosing_checkout} has no ts/node_modules; run 'just ts-install' there first"
        in result.stderr
    )
    assert not record_path.exists()


def test_missing_checkout_and_canonical_cli_emits_reinstall_hint(tmp_path: Path) -> None:
    canonical_checkout = tmp_path / "canonical"
    outside_checkout = tmp_path / "outside"
    outside_checkout.mkdir()
    record_path = tmp_path / "record.txt"
    shim = _render_shim(
        tmp_path,
        canonical_checkout=canonical_checkout,
        install_hint="just install-slot or just install-tools",
    )

    result = _run_shim(shim, cwd=outside_checkout, record_path=record_path)

    assert result.returncode == 2
    assert "slot: no asdl checkout found" in result.stderr
    assert (
        "reinstall from an asdl checkout with: just install-slot or just install-tools"
        in result.stderr
    )
    assert not record_path.exists()
