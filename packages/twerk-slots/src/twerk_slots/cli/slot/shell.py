from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.console import get_console
from twerk_slots.cli.slot.shell_support import (
    SUPPORTED_SHELLS,
    append_marker_block,
    detect_shell,
    rc_path_for_shell,
    unsupported_shell_message,
)

_MARKER_BEGIN = "# >>> slot shell integration >>>"
_MARKER_END = "# <<< slot shell integration <<<"


def _wrapper_script() -> str:
    return """slot() {
  local _slot_cd_file
  local _slot_status
  local _slot_path

  _slot_cd_file="$(mktemp "${TMPDIR:-/tmp}/slot-cd.XXXXXX")" || return 1
  SLOT_CD_DIRECTIVE_FILE="$_slot_cd_file" command slot "$@"
  _slot_status=$?

  if [ "$_slot_status" -eq 0 ] && [ -s "$_slot_cd_file" ]; then
    _slot_path="$(cat "$_slot_cd_file")"
    cd -- "$_slot_path"
  fi

  rm -f "$_slot_cd_file"
  return "$_slot_status"
}"""


def _render_wrapper(shell: str) -> str:
    Ensure.true(
        shell in SUPPORTED_SHELLS,
        error_type="unsupported_shell",
        message=unsupported_shell_message(shell),
    )
    return _wrapper_script()


@dataclass(frozen=True)
class ShellShowRequest:
    shell: Annotated[
        str | None,
        click.Option(
            ["--shell"],
            default=None,
            help="Shell to render parent-shell integration for (default: detect from $SHELL).",
        ),
    ] = None


@dataclass(frozen=True)
class ShellShowResult(JsonSerializable):
    shell: str
    script: str


def render_shell_show(result: ShellShowResult) -> None:
    click.echo(result.script)


@clinkr_operation(
    name="show",
    help="Print the parent-shell integration wrapper for slot.",
    human_renderer=render_shell_show,
)
def run_shell_show(ctx: click.Context, request: ShellShowRequest) -> ClinkrExit[ShellShowResult]:
    shell = request.shell or detect_shell()
    script = _render_wrapper(shell)
    return ClinkrExit.ok(ShellShowResult(shell=shell, script=script))


@dataclass(frozen=True)
class ShellInstallRequest:
    shell: Annotated[
        str | None,
        click.Option(
            ["--shell"],
            default=None,
            help="Shell to install parent-shell integration for (default: detect from $SHELL).",
        ),
    ] = None


@dataclass(frozen=True)
class ShellInstallResult(JsonSerializable):
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
    help="Append slot's parent-shell integration wrapper to the user's shell rc file.",
    human_renderer=render_shell_install,
)
def run_shell_install(
    ctx: click.Context, request: ShellInstallRequest
) -> ClinkrExit[ShellInstallResult]:
    shell = request.shell or detect_shell()
    script = _render_wrapper(shell)
    rc_path = rc_path_for_shell(shell)
    already_installed = append_marker_block(
        rc_path=rc_path,
        marker_begin=_MARKER_BEGIN,
        marker_end=_MARKER_END,
        body=script,
    )

    return ClinkrExit.ok(
        ShellInstallResult(
            shell=shell,
            rc_path=str(rc_path),
            already_installed=already_installed,
        )
    )


def build_shell_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="shell",
        help="Manage parent-shell integration for slot.",
        operations=[run_shell_show, run_shell_install],
    )
