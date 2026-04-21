"""Clinkr-owned runtime object and typed-context helpers for Click CLIs."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Self, TypeVar

import click

T = TypeVar("T")

MACHINE_FORMAT_PARAM_NAME = "_clinkr_format"
_MACHINE_MODE_KEY = "clinkr.machine_mode"


@dataclass(frozen=True, slots=True)
class ClinkrContextObject:
    """Clinkr-owned state stored in ``click.Context.obj`` for one invocation."""

    context_factory: Callable[[], object]
    machine_mode: bool

    def with_machine_mode(self) -> Self:
        """Return a copy marked for machine-readable dispatch."""
        if self.machine_mode:
            return self
        return replace(self, machine_mode=True)


def build_clinkr_context_object(
    context_factory: Callable[[], object],
) -> ClinkrContextObject:
    """Wrap an app-specific context factory in the Clinkr runtime object."""
    return ClinkrContextObject(context_factory=context_factory, machine_mode=False)


def load_clinkr_context_object(ctx: click.Context) -> ClinkrContextObject:
    """Load the nearest Clinkr-owned runtime object from the Click context chain."""
    obj = ctx.find_object(ClinkrContextObject)
    if obj is not None:
        return obj
    raise RuntimeError(
        "ctx.obj must be a ClinkrContextObject; "
        "the CLI entry point and tests are responsible for installing it."
    )


def load_typed_context(ctx: click.Context, context_type: type[T]) -> T:
    """Unpack a typed CLI context from ``ctx.obj``.

    ``ctx.obj`` must be a :class:`ClinkrContextObject` whose
    ``context_factory`` returns a ``context_type`` instance. CLI entry points
    install the real factory via ``build_clinkr_context_object(...)``; tests
    do the same around their pre-built fake contexts. Help paths never reach
    this function.
    """
    runtime = load_clinkr_context_object(ctx)
    result = runtime.context_factory()
    if not isinstance(result, context_type):
        raise RuntimeError(
            f"context_factory returned {type(result).__name__}, expected {context_type.__name__}."
        )
    return result


def set_machine_mode(ctx: click.Context) -> None:
    """Mark the active Click context as running in machine-readable mode.

    When Clinkr owns ``ctx.obj``, replace the root runtime object with an
    immutable copy carrying the mode bit. Standalone machine-command tests may
    not install a Clinkr context object, so fall back to ``meta`` in that case.
    """
    root = ctx.find_root()
    obj = root.obj
    if isinstance(obj, ClinkrContextObject):
        root.obj = obj.with_machine_mode()
        return
    root.meta[_MACHINE_MODE_KEY] = True


def is_machine_mode(ctx: click.Context) -> bool:
    """Return True when the current dispatch was initiated in machine-readable mode.

    Both the legacy ``json`` subgroup and the ``--format json`` flag set this
    signal, so operations can refuse human-only behavior (e.g. piping stdin
    content) without inspecting the group hierarchy.
    """
    root = ctx.find_root()
    obj = root.obj
    if isinstance(obj, ClinkrContextObject):
        return obj.machine_mode
    return bool(root.meta.get(_MACHINE_MODE_KEY, False))
