from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation

_SUPPORTED_SHELLS = ("zsh", "bash")
_SUPPORTED_SHELL_NAMES = ", ".join(_SUPPORTED_SHELLS)
_MARKER_BEGIN = "# >>> slot shell integration >>>"
_MARKER_END = "# <<< slot shell integration <<<"


def _detect_shell() -> str:
    raw = os.environ.get("SHELL", "")
    name = Path(raw).name if raw else ""
    if name in _SUPPORTED_SHELLS:
        return name
    return "zsh"


def _rc_path_for_shell(shell: str) -> Path:
    if shell == "zsh":
        return Path.home() / ".zshrc"
    return Path.home() / ".bashrc"


def _unsupported_shell_message(shell: str) -> str:
    return f"Shell '{shell}' is not supported. Supported shells: {_SUPPORTED_SHELL_NAMES}."


def _render_wrapper_script(shell: str) -> str:
    return """slot() {
  local _slot_cd_directive_file
  local _slot_status
  local _slot_destination

  _slot_cd_directive_file="$(mktemp "${TMPDIR:-/tmp}/slot-cd.XXXXXX")" || return 1
  SLOT_CD_DIRECTIVE_FILE="$_slot_cd_directive_file" command slot "$@"
  _slot_status=$?

  if [ $_slot_status -eq 0 ] && [ -s "$_slot_cd_directive_file" ]; then
    IFS= read -r _slot_destination < "$_slot_cd_directive_file"
    rm -f "$_slot_cd_directive_file"
    cd -- "$_slot_destination"
    return $?
  fi

  rm -f "$_slot_cd_directive_file"
  return $_slot_status
}"""


def _marker_block(shell: str) -> str:
    return f"\n{_MARKER_BEGIN}\n{_render_wrapper_script(shell)}\n{_MARKER_END}\n"


class ShellShowRequest(ClinkrModel):
    shell: Annotated[
        str | None,
        click.Option(
            ["--shell"],
            default=None,
            help=(
                "Shell to render integration for "
                f"(supported: {_SUPPORTED_SHELL_NAMES}; default: detect from $SHELL)."
            ),
        ),
    ] = None


class ShellShowResult(ClinkrModel):
    shell: str
    script: str


def render_shell_show(result: ShellShowResult) -> None:
    click.echo(result.script)


@clinkr_operation(
    name="show",
    help=(
        "Print the opt-in zsh/bash parent-shell wrapper for slot navigation. "
        "Inspect this before installing or redirecting it."
    ),
    human_renderer=render_shell_show,
)
def run_shell_show(ctx: click.Context, request: ShellShowRequest) -> ClinkrExit[ShellShowResult]:
    shell = request.shell or _detect_shell()
    Ensure.true(
        shell in _SUPPORTED_SHELLS,
        error_type="unsupported_shell",
        message=_unsupported_shell_message(shell),
    )
    return ClinkrExit.ok(ShellShowResult(shell=shell, script=_render_wrapper_script(shell)))


class ShellInstallRequest(ClinkrModel):
    shell: Annotated[
        str | None,
        click.Option(
            ["--shell"],
            default=None,
            help=(
                "Shell to install integration for "
                f"(supported: {_SUPPORTED_SHELL_NAMES}; default: detect from $SHELL)."
            ),
        ),
    ] = None


class ShellInstallResult(ClinkrModel):
    shell: str
    rc_path: str
    already_installed: bool


def render_shell_install(result: ShellInstallResult) -> None:
    console = get_console()
    if result.already_installed:
        console.print(
            f"[dim]slot shell integration already installed in[/dim] "
            f"[bold cyan]{result.rc_path}[/bold cyan]"
        )
        return
    console.print(f"Installed slot shell integration in [bold cyan]{result.rc_path}[/bold cyan]")
    console.print(f"[dim]Run `source {result.rc_path}` or open a new shell to activate.[/dim]")


@clinkr_operation(
    name="install",
    help=(
        "Append the opt-in zsh/bash parent-shell wrapper to the user's shell rc file. "
        "Source the file or open a new shell to activate it."
    ),
    human_renderer=render_shell_install,
)
def run_shell_install(
    ctx: click.Context, request: ShellInstallRequest
) -> ClinkrExit[ShellInstallResult]:
    shell = request.shell or _detect_shell()
    Ensure.true(
        shell in _SUPPORTED_SHELLS,
        error_type="unsupported_shell",
        message=_unsupported_shell_message(shell),
    )

    rc_path = _rc_path_for_shell(shell)
    existing = rc_path.read_text(encoding="utf-8") if rc_path.exists() else ""

    if _MARKER_BEGIN in existing:
        return ClinkrExit.ok(
            ShellInstallResult(
                shell=shell,
                rc_path=str(rc_path),
                already_installed=True,
            )
        )

    block = _marker_block(shell)
    rc_path.parent.mkdir(parents=True, exist_ok=True)
    if existing and not existing.endswith("\n"):
        block = "\n" + block
    with rc_path.open("a", encoding="utf-8") as fh:
        fh.write(block)

    return ClinkrExit.ok(
        ShellInstallResult(
            shell=shell,
            rc_path=str(rc_path),
            already_installed=False,
        )
    )


def build_shell_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="shell",
        help=(
            "Manage parent-shell directory-changing integration for slot.\n\n"
            "Supported shells: zsh and bash. Installation is opt-in: without the wrapper, "
            "navigation commands keep printing/copying `cd <path>`. The wrapper is intended "
            "for interactive shells; scripts can call `command slot ...`, and `--format json` "
            "/ `--json-schema` never trigger a parent-shell cd. Troubleshooting: if the shell "
            "still only prints cd, run `type slot` and source your rc file; use "
            "`command slot ...` to bypass the wrapper."
        ),
        operations=[run_shell_show, run_shell_install],
    )
