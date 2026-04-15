from __future__ import annotations

import importlib
import inspect
import pkgutil
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from types import MappingProxyType
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError, _apply_machine_command
from twerk_core.clinkr.operation import ClinkrOperationMeta, get_operation_meta
from twerk_core.clinkr.params import build_request_from_click_params, extract_click_params
from twerk_core.clinkr.rendering import default_human_renderer

_RESERVED_JSON_NAME = "json"
_JSON_GROUP_HELP = "Machine-readable command variants."
_GROUP_META_ATTR = "_clinkr_group_meta"


@dataclass(frozen=True)
class ClinkrGroupSpec:
    """Immutable description of a clinkr CLI group."""

    name: str | None = None
    help: str = ""
    operations: tuple[Callable[..., Any], ...] = field(default_factory=tuple)
    subgroups: tuple[ClinkrGroupSpec, ...] = field(default_factory=tuple)
    aliases: tuple[tuple[str, str], ...] = field(default_factory=tuple)
    context_settings: Mapping[str, Any] = field(default_factory=dict)
    callback: Callable[..., Any] | None = None
    json_group_hidden: bool = False
    version_package_name: str | None = None
    hidden: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "operations", tuple(self.operations))
        object.__setattr__(self, "subgroups", tuple(self.subgroups))
        object.__setattr__(self, "aliases", tuple(self.aliases))
        object.__setattr__(
            self,
            "context_settings",
            MappingProxyType(dict(self.context_settings)),
        )


class ClinkrGroup(click.Group):
    """Compiled Click group built from a :class:`ClinkrGroupSpec`.

    The immutable spec is the configuration surface. This class is the Click
    runtime artifact produced from that spec.
    """

    def __init__(self, spec: ClinkrGroupSpec) -> None:
        super().__init__(
            name=spec.name,
            help=spec.help,
            callback=spec.callback,
            context_settings=dict(spec.context_settings),
            hidden=spec.hidden,
        )
        self._aliases: dict[str, str] = {}
        self._json_group = click.Group(
            _RESERVED_JSON_NAME,
            help=_JSON_GROUP_HELP,
            hidden=spec.json_group_hidden,
        )
        click.Group.add_command(self, self._json_group, _RESERVED_JSON_NAME)

        for subgroup_spec in spec.subgroups:
            self.add_command(compile_group(subgroup_spec))

        for operation in spec.operations:
            meta = get_operation_meta(operation)
            if meta is None:
                raise TypeError(f"{operation!r} is not decorated with @clinkr_operation")
            _register_operation(self, operation, meta)

        for canonical, alias in spec.aliases:
            self._register_alias(canonical, alias)

        if spec.version_package_name is not None:
            click.version_option(package_name=spec.version_package_name)(self)

    @property
    def json_group(self) -> click.Group:
        return self._json_group

    def _register_alias(self, canonical: str, alias: str) -> None:
        self._aliases[alias] = canonical

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        return super().get_command(ctx, self._aliases.get(cmd_name, cmd_name))

    def add_command(self, cmd: click.Command, name: str | None = None) -> None:
        resolved = name or cmd.name
        if resolved == _RESERVED_JSON_NAME:
            raise ValueError(
                f"'{_RESERVED_JSON_NAME}' is a reserved subgroup owned by ClinkrGroup. "
                "Use the group spec instead."
            )
        super().add_command(cmd, name)

    def list_commands(self, ctx: click.Context) -> list[str]:
        commands = super().list_commands(ctx)
        if _RESERVED_JSON_NAME in commands:
            commands.remove(_RESERVED_JSON_NAME)
            commands.append(_RESERVED_JSON_NAME)
        return commands

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

    group.add_command(human_cmd, meta.name)
    group.json_group.add_command(machine_cmd, meta.name)
    for alias in meta.aliases:
        group._register_alias(meta.name, alias)


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


def discover_operations(
    package: str,
    *,
    name: str | None = None,
    help: str = "",
    subgroups: Sequence[ClinkrGroupSpec] = (),
    aliases: Sequence[tuple[str, str]] = (),
    context_settings: Mapping[str, Any] | None = None,
    callback: Callable[..., Any] | None = None,
    json_group_hidden: bool = False,
    version_package_name: str | None = None,
    hidden: bool = False,
) -> ClinkrGroupSpec:
    """Scan *package* for operations and return an immutable group spec."""
    return ClinkrGroupSpec(
        name=name,
        help=help,
        operations=_scan_operations(package),
        subgroups=tuple(subgroups),
        aliases=tuple(aliases),
        context_settings={} if context_settings is None else context_settings,
        callback=callback,
        json_group_hidden=json_group_hidden,
        version_package_name=version_package_name,
        hidden=hidden,
    )


def compile_group(spec: ClinkrGroupSpec) -> ClinkrGroup:
    """Compile an immutable group spec into a Click group."""
    return ClinkrGroup(spec)


@dataclass(frozen=True)
class ClinkrGroupMeta:
    """Metadata attached by the :func:`clinkr_group` decorator."""

    help: str
    name: str | None = None


def clinkr_group(
    *,
    help: str = "",
    name: str | None = None,
) -> Callable[[Callable[..., ClinkrGroupSpec]], Callable[..., ClinkrGroupSpec]]:
    """Marker decorator for group spec definitions."""

    def decorator(fn: Callable[..., ClinkrGroupSpec]) -> Callable[..., ClinkrGroupSpec]:
        setattr(fn, _GROUP_META_ATTR, ClinkrGroupMeta(help=help, name=name))
        return fn

    return decorator


def get_group_meta(fn: Any) -> ClinkrGroupMeta | None:
    """Retrieve clinkr group metadata from a function, if present."""
    return getattr(fn, _GROUP_META_ATTR, None)


def _apply_overrides(
    spec: ClinkrGroupSpec,
    *,
    context_settings: Mapping[str, Any] | None = None,
    callback: Callable[..., Any] | None = None,
    version_package_name: str | None = None,
) -> ClinkrGroupSpec:
    replacements: dict[str, Any] = {}
    if context_settings is not None:
        replacements["context_settings"] = context_settings
    if callback is not None:
        replacements["callback"] = callback
    if version_package_name is not None:
        replacements["version_package_name"] = version_package_name
    if not replacements:
        return spec
    return replace(spec, **replacements)


def discover_group_spec(
    module_path: str,
    *,
    context_settings: Mapping[str, Any] | None = None,
    callback: Callable[..., Any] | None = None,
    version_package_name: str | None = None,
) -> ClinkrGroupSpec:
    """Import a module and build the immutable group spec for it."""
    module = importlib.import_module(module_path)

    group_fn = None
    meta = None
    for attr_name in dir(module):
        obj = getattr(module, attr_name)
        if not callable(obj):
            continue
        found = get_group_meta(obj)
        if found is None:
            continue
        if group_fn is not None:
            raise ValueError(
                f"Module {module_path!r} contains multiple @clinkr_group-decorated functions"
            )
        group_fn = obj
        meta = found

    if group_fn is None:
        spec = discover_operations(module_path)
        module_help = inspect.getdoc(module)
        spec = replace(
            spec,
            name=module.__name__.rpartition(".")[2],
            help="" if module_help is None else module_help,
        )
        return _apply_overrides(
            spec,
            context_settings=context_settings,
            callback=callback,
            version_package_name=version_package_name,
        )

    spec = group_fn()
    if not isinstance(spec, ClinkrGroupSpec):
        raise TypeError(
            f"@clinkr_group function {group_fn.__qualname__!r} must return "
            f"a ClinkrGroupSpec, got {type(spec).__name__}"
        )

    resolved_name = meta.name if meta is not None and meta.name is not None else spec.name
    if resolved_name is None:
        resolved_name = group_fn.__name__
    resolved_help = spec.help
    if meta is not None and meta.help:
        resolved_help = meta.help
    spec = replace(spec, name=resolved_name, help=resolved_help)
    return _apply_overrides(
        spec,
        context_settings=context_settings,
        callback=callback,
        version_package_name=version_package_name,
    )


def discover_group(
    module_path: str,
    *,
    context_settings: Mapping[str, Any] | None = None,
    callback: Callable[..., Any] | None = None,
    version_package_name: str | None = None,
) -> ClinkrGroup:
    """Import a module, build its spec, and compile it into a Click group."""
    return compile_group(
        discover_group_spec(
            module_path,
            context_settings=context_settings,
            callback=callback,
            version_package_name=version_package_name,
        )
    )
