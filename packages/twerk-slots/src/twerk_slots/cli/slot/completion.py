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

_MARKER_BEGIN = "# >>> slot completion >>>"
_MARKER_END = "# <<< slot completion <<<"


def _activation_line(shell: str) -> str:
    return f'eval "$(_SLOT_COMPLETE={shell}_source slot)"'


@dataclass(frozen=True)
class CompletionShowRequest:
    shell: Annotated[
        str | None,
        click.Option(
            ["--shell"],
            default=None,
            help="Shell to render completion for (default: detect from $SHELL).",
        ),
    ] = None


@dataclass(frozen=True)
class CompletionShowResult(JsonSerializable):
    shell: str
    script: str


def render_completion_show(result: CompletionShowResult) -> None:
    click.echo(result.script)


@clinkr_operation(
    name="show",
    help="Print the shell-completion activation line for slot.",
    human_renderer=render_completion_show,
)
def run_completion_show(
    ctx: click.Context, request: CompletionShowRequest
) -> ClinkrExit[CompletionShowResult]:
    shell = request.shell or detect_shell()
    Ensure.true(
        shell in SUPPORTED_SHELLS,
        error_type="unsupported_shell",
        message=unsupported_shell_message(shell),
    )
    return ClinkrExit.ok(CompletionShowResult(shell=shell, script=_activation_line(shell)))


@dataclass(frozen=True)
class CompletionInstallRequest:
    shell: Annotated[
        str | None,
        click.Option(
            ["--shell"],
            default=None,
            help="Shell to install completion for (default: detect from $SHELL).",
        ),
    ] = None


@dataclass(frozen=True)
class CompletionInstallResult(JsonSerializable):
    shell: str
    rc_path: str
    already_installed: bool


def render_completion_install(result: CompletionInstallResult) -> None:
    console = get_console()
    if result.already_installed:
        console.print(
            f"[dim]slot completion already installed in[/dim] "
            f"[bold cyan]{result.rc_path}[/bold cyan]"
        )
        return
    console.print(f"Installed slot completion in [bold cyan]{result.rc_path}[/bold cyan]")
    console.print(f"[dim]Run `source {result.rc_path}` or open a new shell to activate.[/dim]")


@clinkr_operation(
    name="install",
    help="Append slot's shell-completion activation line to the user's shell rc file.",
    human_renderer=render_completion_install,
)
def run_completion_install(
    ctx: click.Context, request: CompletionInstallRequest
) -> ClinkrExit[CompletionInstallResult]:
    shell = request.shell or detect_shell()
    Ensure.true(
        shell in SUPPORTED_SHELLS,
        error_type="unsupported_shell",
        message=unsupported_shell_message(shell),
    )

    rc_path = rc_path_for_shell(shell)
    already_installed = append_marker_block(
        rc_path=rc_path,
        marker_begin=_MARKER_BEGIN,
        marker_end=_MARKER_END,
        body=_activation_line(shell),
    )

    return ClinkrExit.ok(
        CompletionInstallResult(
            shell=shell,
            rc_path=str(rc_path),
            already_installed=already_installed,
        )
    )


def build_completion_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="completion",
        help="Manage shell completion for slot.",
        operations=[run_completion_show, run_completion_install],
    )
