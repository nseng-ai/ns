from __future__ import annotations

import importlib
import inspect
import pkgutil
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError, _apply_machine_command
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

    @classmethod
    def discover_subcommands(cls) -> ClinkrGroup:
        """Auto-discover ``@clinkr_operation`` functions in the caller's package
        and return a fully constructed :class:`ClinkrGroup`."""
        frame = inspect.currentframe()
        caller = frame.f_back if frame is not None else None
        if caller is None:
            raise RuntimeError("Cannot determine calling module")
        package = caller.f_globals["__name__"]
        return cls(operations=_scan_operations(package))

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
    )

    # -- register --
    group.add_command(human_cmd, meta.name)
    group._json_group.add_command(machine_cmd, meta.name)
    for alias in meta.aliases:
        group._aliases[alias] = meta.name


def _scan_operations(package: str) -> tuple[Callable[..., Any], ...]:
    """Scan *package* for ``@clinkr_operation``-decorated functions."""
    root = importlib.import_module(package)
    modules = [root]

    if hasattr(root, "__path__"):
        for _importer, modname, _ispkg in pkgutil.walk_packages(root.__path__, root.__name__ + "."):
            modules.append(importlib.import_module(modname))

    found: list[Callable[..., Any]] = []
    for module in modules:
        for attr_name in dir(module):
            obj = getattr(module, attr_name)
            if not callable(obj):
                continue
            if get_operation_meta(obj) is not None:
                found.append(obj)

    return tuple(found)


def discover_operations(package: str) -> ClinkrGroup:
    """Scan *package* for ``@clinkr_operation``-decorated functions
    and return a fully constructed :class:`ClinkrGroup`."""
    return ClinkrGroup(operations=_scan_operations(package))


# -- group decorator and discovery --------------------------------------------

_GROUP_META_ATTR = "_clinkr_group_meta"


@dataclass(frozen=True)
class ClinkrGroupMeta:
    """Metadata attached by the :func:`clinkr_group` decorator."""

    help: str
    name: str | None = None


def clinkr_group(
    *,
    help: str = "",
    name: str | None = None,
) -> Callable[[Callable[..., ClinkrGroup]], Callable[..., ClinkrGroup]]:
    """Marker decorator for group definitions.

    Stores top-level display metadata (help string, optional display name).
    The decorated function must return a :class:`ClinkrGroup`. When ``name``
    is provided it overrides the decorated function's ``__name__`` — useful
    when the desired CLI subgroup name contains characters that aren't
    valid in Python identifiers (e.g. ``"pr-address"``).
    """

    def decorator(fn: Callable[..., ClinkrGroup]) -> Callable[..., ClinkrGroup]:
        setattr(fn, _GROUP_META_ATTR, ClinkrGroupMeta(help=help, name=name))
        return fn

    return decorator


def get_group_meta(fn: Any) -> ClinkrGroupMeta | None:
    """Retrieve clinkr group metadata from a function, if present."""
    return getattr(fn, _GROUP_META_ATTR, None)


def discover_group(module_path: str) -> ClinkrGroup:
    """Import a module, auto-discover operations, and optionally apply group
    metadata.

    If a ``@clinkr_group``-decorated function is present, its return value and
    metadata are used. Otherwise, a default :class:`ClinkrGroup` is created
    from discovered operations and named from the module path.
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
        group = discover_operations(module_path)
        group.name = module.__name__.rpartition(".")[2]
        module_help = inspect.getdoc(module)
        if module_help:
            group.help = module_help
        return group

    group = group_fn()
    if not isinstance(group, ClinkrGroup):
        raise TypeError(
            f"@clinkr_group function {group_fn.__qualname__!r} must return "
            f"a ClinkrGroup, got {type(group).__name__}"
        )

    group.name = meta.name or group_fn.__name__
    if meta.help:
        group.help = meta.help
    return group
