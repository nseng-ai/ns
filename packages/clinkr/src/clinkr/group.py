from __future__ import annotations

from collections.abc import Callable
from typing import Any

import click

from clinkr.machine_command import MachineCommandError, _apply_machine_command
from clinkr.params import build_request_from_click_params, extract_click_params
from clinkr.rendering import default_human_renderer

_RESERVED_JSON_NAME = "json"


class ClinkrGroup(click.Group):
    """A Click group that auto-provisions a ``json`` subgroup and supports
    operation registration and command aliases."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._aliases: dict[str, str] = {}
        self._json_group = click.Group(
            _RESERVED_JSON_NAME,
            help="Machine-readable command variants.",
        )
        super().add_command(self._json_group, _RESERVED_JSON_NAME)

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
                "Use register_operation() or group.json_group.add_command() instead."
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

    # -- operation registration --

    def register_operation(
        self,
        name: str,
        *,
        operation: Callable[..., Any],
        request_type: type,
        result_types: tuple[type, ...],
        help: str | None = None,
        aliases: tuple[str, ...] = (),
        human_renderer: Callable[..., None] | None = None,
    ) -> None:
        help_text = help or operation.__doc__ or ""
        renderer = human_renderer or default_human_renderer

        # -- build human command --
        params = extract_click_params(request_type)

        def human_callback(**kwargs: Any) -> None:
            request = build_request_from_click_params(request_type, kwargs)
            result = operation(request)
            if isinstance(result, MachineCommandError):
                raise click.ClickException(result.message)
            renderer(result)

        human_cmd = click.Command(
            name=name,
            callback=human_callback,
            params=params,
            help=help_text,
        )

        # -- build machine command --
        def machine_callback(*, request: Any) -> Any:
            return operation(request)

        machine_cmd = click.Command(
            name=name,
            callback=machine_callback,
            help=f"{help_text} (JSON)",
        )
        _apply_machine_command(
            machine_cmd,
            request_type=request_type,
            output_types=result_types,
        )

        # -- register --
        self.add_command(human_cmd, name)
        self._json_group.add_command(machine_cmd, name)
        for alias in aliases:
            self.add_alias(name, alias)
