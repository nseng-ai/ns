"""Shared plugin contract for standalone and top-level asdl CLIs."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Generic, TypeVar

import click

from asdl_core.cli_runtime import add_runtime_option
from asdl_core.clinkr.context import build_clinkr_context_object

GroupT = TypeVar("GroupT", bound=click.Group)


@dataclass(frozen=True, slots=True)
class AsdlPluginSpec(Generic[GroupT]):
    """Declarative contract for an asdl plugin CLI."""

    build_group: Callable[[], GroupT]
    context_factory: Callable[[], object] | None


def build_standalone_cli(
    spec: AsdlPluginSpec[GroupT],
    *,
    package_name: str,
    entry_point: str,
) -> GroupT:
    """Build a standalone CLI from a shared plugin spec."""
    group = spec.build_group()
    context_settings = dict(group.context_settings or {})
    context_settings.setdefault("help_option_names", ["-h", "--help"])
    group.context_settings = context_settings
    click.version_option(package_name=package_name)(group)
    add_runtime_option(group, runtime="python", entry_point=entry_point)
    return group


def invoke_standalone_cli(
    spec: AsdlPluginSpec[click.Group],
    *,
    package_name: str,
    entry_point: str,
) -> None:
    """Run a standalone CLI from a shared plugin spec."""
    cli = build_standalone_cli(spec, package_name=package_name, entry_point=entry_point)
    if spec.context_factory is None:
        cli()
        return
    cli(obj=build_clinkr_context_object(spec.context_factory))
