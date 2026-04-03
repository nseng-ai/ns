from __future__ import annotations

import importlib
import pkgutil
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import click

from clinkr.machine_command import MachineCommandError, _apply_machine_command
from clinkr.operation import get_operation_meta
from clinkr.params import build_request_from_click_params, extract_click_params
from clinkr.rendering import default_human_renderer

_RESERVED_JSON_NAME = "json"


class ClinkrGroup(click.Group):
    """A Click group that auto-provisions a ``json`` subgroup and supports
    operation registration and command aliases."""

    def __init__(
        self, name: str | None = None, *, discover: str | None = None, **kwargs: Any
    ) -> None:
        super().__init__(name, **kwargs)
        self._aliases: dict[str, str] = {}
        self._json_group = click.Group(
            _RESERVED_JSON_NAME,
            help="Machine-readable command variants.",
        )
        super().add_command(self._json_group, _RESERVED_JSON_NAME)
        if discover is not None:
            self.discover_operations(discover)

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

    # -- autodiscovery --

    def discover_operations(self, package: str) -> None:
        """Scan *package* for ``@clinkr_operation``-decorated functions and
        register each one."""
        root = importlib.import_module(package)
        modules = [root]

        if hasattr(root, "__path__"):
            for _importer, modname, _ispkg in pkgutil.walk_packages(
                root.__path__, root.__name__ + "."
            ):
                modules.append(importlib.import_module(modname))

        for module in modules:
            for attr_name in dir(module):
                obj = getattr(module, attr_name)
                if not callable(obj):
                    continue
                meta = get_operation_meta(obj)
                if meta is None:
                    continue
                self.register_operation(
                    meta.name,
                    operation=obj,
                    request_type=meta.request_type,
                    result_types=meta.result_types,
                    help=meta.help,
                    aliases=meta.aliases,
                    human_renderer=meta.human_renderer,
                )

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


_GROUP_META_ATTR = "_clinkr_group_meta"


@dataclass(frozen=True)
class ClinkrGroupMeta:
    """Metadata attached by the :func:`clinkr_group` decorator."""

    help: str


def clinkr_group(
    *,
    help: str = "",
) -> Callable[[Callable[..., ClinkrGroup]], Callable[..., ClinkrGroup]]:
    """Marker decorator for group definitions.

    Stores top-level display metadata (help string).  The decorated
    function must return a :class:`ClinkrGroup`.
    """

    def decorator(fn: Callable[..., ClinkrGroup]) -> Callable[..., ClinkrGroup]:
        setattr(fn, _GROUP_META_ATTR, ClinkrGroupMeta(help=help))
        return fn

    return decorator


def get_group_meta(fn: Any) -> ClinkrGroupMeta | None:
    """Retrieve clinkr group metadata from a function, if present."""
    return getattr(fn, _GROUP_META_ATTR, None)


def discover_group(module_path: str) -> ClinkrGroup:
    """Import a module, find its ``@clinkr_group``-decorated function,
    call it, apply metadata, and auto-discover operations from sibling
    modules.

    The group **name** is taken from the decorated function's name.
    The **help** string comes from the ``@clinkr_group`` decorator.
    Operations are discovered from the same *module_path* package.
    """
    module = importlib.import_module(module_path)

    group_fn = None
    meta = None
    for attr_name in dir(module):
        obj = getattr(module, attr_name)
        if not callable(obj):
            continue
        found = get_group_meta(obj)
        if found is not None:
            if group_fn is not None:
                raise ValueError(
                    f"Module {module_path!r} contains multiple @clinkr_group-decorated functions"
                )
            group_fn = obj
            meta = found

    if group_fn is None:
        raise ValueError(f"Module {module_path!r} has no @clinkr_group-decorated function")

    group = group_fn()
    if not isinstance(group, ClinkrGroup):
        raise TypeError(
            f"@clinkr_group function {group_fn.__qualname__!r} must return "
            f"a ClinkrGroup, got {type(group).__name__}"
        )

    group.name = group_fn.__name__
    if meta.help:
        group.help = meta.help
    group.discover_operations(module_path)
    return group
