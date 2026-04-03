from __future__ import annotations

from typing import Any

import click


class AliasedGroup(click.Group):
    """A Click group where commands can have aliases shown inline in help."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._aliases: dict[str, str] = {}  # alias -> canonical name

    def add_alias(self, canonical: str, alias: str) -> None:
        self._aliases[alias] = canonical

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        return super().get_command(ctx, self._aliases.get(cmd_name, cmd_name))

    def format_commands(self, ctx: click.Context, formatter: click.HelpFormatter) -> None:
        # Build reverse map: canonical -> [aliases]
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
            name = f"{subcommand} ({', '.join(aliases)})" if aliases else subcommand
            rows.append((name, cmd.get_short_help_str(limit=150)))

        if rows:
            with formatter.section("Commands"):
                formatter.write_dl(rows)
