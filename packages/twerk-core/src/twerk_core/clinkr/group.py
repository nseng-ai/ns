from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError, _apply_machine_command
from twerk_core.clinkr.exit import ClinkrExit, ExitStatus
from twerk_core.clinkr.operation import ClinkrOperationMeta, get_operation_meta
from twerk_core.clinkr.params import build_request_from_click_params, extract_click_params
from twerk_core.clinkr.rendering import default_human_renderer

_RESERVED_JSON_NAME = "json"


class ClinkrGroup(click.Group):
    """A Click group that auto-provisions a ``json`` subgroup and supports
    command aliases.

    All operations must be provided at construction time via the
    ``operations`` parameter. The group is immutable after ``__init__``.
    """

    def __init__(
        self,
        name: str | None = None,
        *,
        operations: Sequence[Callable[..., Any]] = (),
        **kwargs: Any,
    ) -> None:
        super().__init__(name, **kwargs)
        self._aliases: dict[str, str] = {}
        self._json_group = click.Group(
            _RESERVED_JSON_NAME,
            help="Machine-readable command variants.",
        )
        super().add_command(self._json_group, _RESERVED_JSON_NAME)

        for op_fn in operations:
            meta = get_operation_meta(op_fn)
            if meta is None:
                raise TypeError(f"{op_fn!r} is not decorated with @clinkr_operation")
            _register_operation(self, op_fn, meta)

    @property
    def json_group(self) -> click.Group:
        return self._json_group

    # -- alias handling (ported from AliasedGroup) --

    def add_alias(self, canonical: str, alias: str) -> None:
        self._aliases[alias] = canonical

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        return super().get_command(ctx, self._aliases.get(cmd_name, cmd_name))

    # -- guard the reserved json name --

    def add_command(self, cmd: click.Command, name: str | None = None) -> None:
        resolved = name or cmd.name
        if resolved == _RESERVED_JSON_NAME:
            raise ValueError(
                f"'{_RESERVED_JSON_NAME}' is a reserved subgroup owned by ClinkrGroup. "
                "Use the operations parameter instead."
            )
        super().add_command(cmd, name)

    # -- ordering: json last --

    def list_commands(self, ctx: click.Context) -> list[str]:
        commands = super().list_commands(ctx)
        if _RESERVED_JSON_NAME in commands:
            commands.remove(_RESERVED_JSON_NAME)
            commands.append(_RESERVED_JSON_NAME)
        return commands

    # -- help formatting with aliases --

    def format_commands(self, ctx: click.Context, formatter: click.HelpFormatter) -> None:
        reverse: dict[str, list[str]] = {}
        for alias, canonical in self._aliases.items():
            reverse.setdefault(canonical, []).append(alias)

        rows = []
        for subcommand in self.list_commands(ctx):
            if subcommand in self._aliases:
                continue
            cmd = self.get_command(ctx, subcommand)
            if cmd is None or cmd.hidden:
                continue
            aliases = reverse.get(subcommand, [])
            label = f"{subcommand} ({', '.join(aliases)})" if aliases else subcommand
            rows.append((label, cmd.get_short_help_str(limit=150)))

        if rows:
            with formatter.section("Commands"):
                formatter.write_dl(rows)


# -- private helpers ----------------------------------------------------------


def _register_operation(
    group: ClinkrGroup,
    operation: Callable[..., Any],
    meta: ClinkrOperationMeta,
) -> None:
    """Wire up human and machine Click commands for a single operation."""
    help_text = meta.help or operation.__doc__ or ""
    renderer = meta.human_renderer or default_human_renderer
    request_type = meta.request_type
    result_types = meta.result_types

    # -- build human command --
    params = extract_click_params(request_type)

    @click.pass_context
    def human_callback(ctx: click.Context, **kwargs: Any) -> None:
        request = build_request_from_click_params(request_type, kwargs)
        result = operation(ctx, request)
        if meta.return_style == "exit":
            if not isinstance(result, ClinkrExit):
                raise click.ClickException(
                    f"operation '{meta.name}' declared return_style='exit' "
                    "but did not return a ClinkrExit"
                )
            if result.status is ExitStatus.OK:
                renderer(result.data)
                return
            if result.status is ExitStatus.NEGATIVE:
                if result.message is not None:
                    click.echo(result.message, err=True)
                ctx.exit(1)
            # FAILURE
            click.echo(f"error: {result.message}", err=True)
            ctx.exit(2)
            return
        # TODO(clinkr-contract-redesign PR 7): remove the legacy branch below
        # once every operation returns ClinkrExit[T]. Until then, both
        # dispatch paths must coexist so migration can proceed package-by-package.
        if isinstance(result, ClinkrCommandError):
            raise click.ClickException(result.message)
        renderer(result)

    human_cmd = click.Command(
        name=meta.name,
        callback=human_callback,
        params=params,
        help=help_text,
    )

    # -- build machine command --
    # Note: ``_apply_machine_command`` re-wraps this callback; decorating it
    # with ``click.pass_context`` would not help because Click only dispatches
    # through the outer wrapper. ``click.get_current_context()`` works here
    # because it runs inside Click's dispatch stack.
    def machine_callback(*, request: Any) -> Any:
        ctx = click.get_current_context()
        return operation(ctx, request)

    machine_cmd = click.Command(
        name=meta.name,
        callback=machine_callback,
        help=f"{help_text} (JSON)",
    )
    _apply_machine_command(
        machine_cmd,
        request_type=request_type,
        output_types=result_types,
        return_style=meta.return_style,
    )

    # -- register --
    group.add_command(human_cmd, meta.name)
    group._json_group.add_command(machine_cmd, meta.name)
    for alias in meta.aliases:
        group._aliases[alias] = meta.name
