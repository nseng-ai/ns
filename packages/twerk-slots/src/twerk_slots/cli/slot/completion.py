from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from twerk_core import get_console
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation

_SUPPORTED_SHELLS = ("zsh", "bash")
_MARKER_BEGIN = "# >>> slot completion >>>"
_MARKER_END = "# <<< slot completion <<<"


def _detect_shell() -> str:
    raw = os.environ.get("SHELL", "")
    name = Path(raw).name if raw else ""
    if name in _SUPPORTED_SHELLS:
        return name
    return "zsh"


def _activation_line(shell: str) -> str:
    return f'eval "$(_SLOT_COMPLETE={shell}_source slot)"'


def _rc_path_for_shell(shell: str) -> Path:
    if shell == "zsh":
        return Path.home() / ".zshrc"
    return Path.home() / ".bashrc"


def _unsupported_shell_message(shell: str) -> str:
    return f"Shell '{shell}' is not supported. Supported shells: {', '.join(_SUPPORTED_SHELLS)}."


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
    shell = request.shell or _detect_shell()
    if shell not in _SUPPORTED_SHELLS:
        raise ClinkrExit.failure(
            error_type="unsupported_shell",
            message=_unsupported_shell_message(shell),
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
    shell = request.shell or _detect_shell()
    if shell not in _SUPPORTED_SHELLS:
        raise ClinkrExit.failure(
            error_type="unsupported_shell",
            message=_unsupported_shell_message(shell),
        )

    rc_path = _rc_path_for_shell(shell)
    existing = rc_path.read_text(encoding="utf-8") if rc_path.exists() else ""

    if _MARKER_BEGIN in existing:
        return ClinkrExit.ok(
            CompletionInstallResult(
                shell=shell,
                rc_path=str(rc_path),
                already_installed=True,
            )
        )

    block = f"\n{_MARKER_BEGIN}\n{_activation_line(shell)}\n{_MARKER_END}\n"
    rc_path.parent.mkdir(parents=True, exist_ok=True)
    if existing and not existing.endswith("\n"):
        block = "\n" + block
    with rc_path.open("a", encoding="utf-8") as fh:
        fh.write(block)

    return ClinkrExit.ok(
        CompletionInstallResult(
            shell=shell,
            rc_path=str(rc_path),
            already_installed=False,
        )
    )


def build_completion_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="completion",
        help="Manage shell completion for slot.",
        operations=[run_completion_show, run_completion_install],
    )
