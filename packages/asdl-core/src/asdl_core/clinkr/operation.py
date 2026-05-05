from __future__ import annotations

import inspect
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, get_args, get_origin, get_type_hints

import click
from pydantic import BaseModel

from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit

_META_ATTR = "_clinkr_operation_meta"


@dataclass(frozen=True)
class ClinkrOperationMeta:
    """Metadata attached to a decorated operation function."""

    name: str
    help: str
    request_type: type
    result_types: tuple[type, ...]
    aliases: tuple[str, ...]
    human_renderer: Callable[..., None] | None


def clinkr_operation(
    *,
    name: str,
    help: str = "",
    aliases: tuple[str, ...] = (),
    human_renderer: Callable[..., None] | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that marks a function as a clinkr operation.

    The decorated function must accept exactly two parameters:
    ``(ctx: click.Context, request: <RequestType>)`` and be annotated as
    returning ``ClinkrExit[T]``. Successful operations return
    ``ClinkrExit.ok(...)``; non-success exits may be raised as ``ClinkrExit``
    exceptions. Clinkr threads the active Click context in; operations must
    never fetch it from globals. ``request_type`` and ``result_types`` are
    inferred from the function's type annotations.
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        request_type, result_types = _extract_types_from_hints(fn)
        setattr(
            fn,
            _META_ATTR,
            ClinkrOperationMeta(
                name=name,
                help=help,
                request_type=request_type,
                result_types=result_types,
                aliases=aliases,
                human_renderer=human_renderer,
            ),
        )
        return fn

    return decorator


def get_operation_meta(fn: Any) -> ClinkrOperationMeta | None:
    """Retrieve clinkr operation metadata from a function, if present."""
    return getattr(fn, _META_ATTR, None)


def _extract_types_from_hints(
    fn: Callable[..., Any],
) -> tuple[type, tuple[type, ...]]:
    """Infer ``(request_type, result_types)`` from a function's type annotations.

    The function must accept exactly two parameters — ``ctx: click.Context``
    followed by the request dataclass — and be annotated as returning
    ``ClinkrExit[T]``.
    """
    fn_name = getattr(fn, "__qualname__", repr(fn))
    hints = get_type_hints(fn)
    params = list(inspect.signature(fn).parameters.values())

    if len(params) != 2:
        raise TypeError(
            f"clinkr_operation function {fn_name} must accept "
            f"exactly two parameters (click.Context, request), got {len(params)}"
        )

    ctx_param, request_param = params
    if ctx_param.name not in hints:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            f"parameter '{ctx_param.name}' must have a type annotation"
        )
    if hints[ctx_param.name] is not click.Context:
        raise TypeError(
            f"clinkr_operation function {fn_name}: first parameter "
            f"'{ctx_param.name}' must be annotated as click.Context, "
            f"got {hints[ctx_param.name]!r}"
        )

    if request_param.name not in hints:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            f"parameter '{request_param.name}' must have a type annotation"
        )
    request_type = hints[request_param.name]

    if "return" not in hints:
        raise TypeError(f"clinkr_operation function {fn_name} must have a return type annotation")

    return_hint = hints["return"]
    origin = get_origin(return_hint)

    if origin is ClinkrExit:
        args = get_args(return_hint)
        if len(args) != 1 or not isinstance(args[0], type):
            raise TypeError(
                f"clinkr_operation function {fn_name}: "
                "ClinkrExit must be parameterized by a single concrete type"
            )
        result_type = args[0]
        if not issubclass(result_type, JsonSerializable | BaseModel):
            raise TypeError(
                f"clinkr_operation function {fn_name}: "
                f"result type {result_type.__name__} must subclass JsonSerializable or BaseModel"
            )
        return request_type, (result_type,)

    if return_hint is ClinkrExit:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            "ClinkrExit must be parameterized by a single concrete type"
        )

    raise TypeError(
        f"clinkr_operation function {fn_name}: "
        f"return annotation must be ClinkrExit[T]; got {return_hint!r}"
    )
