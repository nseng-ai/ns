from __future__ import annotations

import inspect
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, get_args, get_origin, get_type_hints

import click
from pydantic import BaseModel

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.serialization import is_pydantic_output_type

_META_ATTR = "_clinkr_operation_meta"


@dataclass(frozen=True)
class ClinkrOperationMeta:
    """Metadata attached to a decorated operation function."""

    name: str
    help: str
    request_type: type
    result_type: Any
    aliases: tuple[str, ...]
    human_renderer: Callable[..., None] | None
    markdown_renderer: Callable[..., None] | None


def clinkr_operation(
    *,
    name: str,
    help: str = "",
    aliases: tuple[str, ...] = (),
    human_renderer: Callable[..., None] | None = None,
    markdown_renderer: Callable[..., None] | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that marks a function as a clinkr operation.

    The decorated function must accept exactly two parameters:
    ``(ctx: click.Context, request: <RequestType>)`` and be annotated as
    returning ``ClinkrExit[T]``. Successful operations return
    ``ClinkrExit.ok(...)``; non-success exits may be raised as ``ClinkrExit``
    exceptions. Clinkr threads the active Click context in; operations must
    never fetch it from globals. ``request_type`` and ``result_type`` are
    inferred from the function's type annotations and must be Pydantic-compatible.

    Renderers:
    - ``human_renderer`` handles ``--format human`` (and ``--format md`` when
      ``markdown_renderer`` is not set).
    - ``markdown_renderer`` handles ``--format markdown`` / ``--format md``
      when commands want a distinct machine-friendly Markdown rendering
      alongside a richer human view.
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        request_type, result_type = _extract_types_from_hints(fn)
        setattr(
            fn,
            _META_ATTR,
            ClinkrOperationMeta(
                name=name,
                help=help,
                request_type=request_type,
                result_type=result_type,
                aliases=aliases,
                human_renderer=human_renderer,
                markdown_renderer=markdown_renderer,
            ),
        )
        return fn

    return decorator


def get_operation_meta(fn: Any) -> ClinkrOperationMeta | None:
    """Retrieve clinkr operation metadata from a function, if present."""
    return getattr(fn, _META_ATTR, None)


def _extract_types_from_hints(
    fn: Callable[..., Any],
) -> tuple[type, Any]:
    """Infer ``(request_type, result_type)`` from a function's type annotations.

    The function must accept exactly two parameters — ``ctx: click.Context``
    followed by the Pydantic request model — and be annotated as returning
    ``ClinkrExit[T]``.
    """
    fn_name = getattr(fn, "__qualname__", repr(fn))
    hints = get_type_hints(fn, include_extras=True)
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
    if not _is_supported_request_type(request_type):
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            f"request type {_result_type_name(request_type)} must be a Pydantic BaseModel subclass"
        )

    if "return" not in hints:
        raise TypeError(f"clinkr_operation function {fn_name} must have a return type annotation")

    return_hint = hints["return"]
    origin = get_origin(return_hint)

    if origin is ClinkrExit:
        args = get_args(return_hint)
        if len(args) != 1:
            raise TypeError(
                f"clinkr_operation function {fn_name}: "
                "ClinkrExit must be parameterized by a single result type"
            )
        result_type = args[0]
        if not _is_supported_result_type(result_type):
            raise TypeError(
                f"clinkr_operation function {fn_name}: "
                f"result type {_result_type_name(result_type)} must be Pydantic-compatible"
            )
        return request_type, result_type

    if return_hint is ClinkrExit:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            "ClinkrExit must be parameterized by a single result type"
        )

    raise TypeError(
        f"clinkr_operation function {fn_name}: "
        f"return annotation must be ClinkrExit[T]; got {return_hint!r}"
    )


def _is_supported_request_type(request_type: Any) -> bool:
    return isinstance(request_type, type) and issubclass(request_type, BaseModel)


def _is_supported_result_type(result_type: Any) -> bool:
    return is_pydantic_output_type(result_type)


def _result_type_name(result_type: Any) -> str:
    name = getattr(result_type, "__name__", None)
    if isinstance(name, str):
        return name
    return repr(result_type)
