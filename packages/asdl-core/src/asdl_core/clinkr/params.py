from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Annotated, Any, TypeGuard, get_args, get_origin, get_type_hints

import click
from pydantic import BaseModel

_PYTHON_TO_CLICK_TYPE: dict[type, click.ParamType] = {
    str: click.STRING,
    int: click.INT,
    float: click.FLOAT,
    bool: click.BOOL,
}

_MISSING = object()


@dataclass(frozen=True)
class RequestField:
    name: str
    has_default: bool
    default: Any = _MISSING


def extract_click_params(request_type: type) -> list[click.Parameter]:
    fields = _request_fields(request_type)
    hints = get_type_hints(request_type, include_extras=True)

    arguments: list[click.Parameter] = []
    options: list[click.Parameter] = []

    for field in fields:
        hint = hints.get(field.name, str)
        param = _extract_annotated_param(field, hint)
        if param is None:
            param = _infer_param(field, hint)

        if isinstance(param, click.Argument):
            arguments.append(param)
        else:
            options.append(param)

    return [*arguments, *options]


def build_request_from_click_params(request_type: type, kwargs: dict[str, Any]) -> Any:
    field_names = {field.name for field in _request_fields(request_type)}
    mapped = {}
    for key, value in kwargs.items():
        name = key.replace("-", "_")
        if name in field_names:
            mapped[name] = value

    if not _is_pydantic_model_type(request_type):
        raise TypeError(
            f"request type {request_type.__name__} must be a Pydantic BaseModel subclass"
        )
    return request_type.model_validate(mapped)


def _request_fields(request_type: type) -> list[RequestField]:
    if not _is_pydantic_model_type(request_type):
        raise TypeError(
            f"request type {request_type.__name__} must be a Pydantic BaseModel subclass"
        )

    return [
        RequestField(
            name=name,
            has_default=not field_info.is_required(),
            default=(
                field_info.get_default(call_default_factory=True)
                if not field_info.is_required()
                else _MISSING
            ),
        )
        for name, field_info in request_type.model_fields.items()
    ]


def _extract_annotated_param(field: RequestField, hint: Any) -> click.Parameter | None:
    if get_origin(hint) is not Annotated:
        return None

    args = get_args(hint)
    for meta in args[1:]:
        if isinstance(meta, (click.Argument, click.Option)):
            param = copy.copy(meta)
            param.name = field.name
            # Infer Click type from the Python type if not explicitly set
            inner_type = args[0]
            if param.type is None or isinstance(param.type, click.STRING.__class__):
                inferred = _PYTHON_TO_CLICK_TYPE.get(inner_type)
                if inferred is not None and inferred is not click.STRING:
                    param.type = inferred
            if param.default is None and field.has_default:
                param.default = field.default
            return param
    return None


def _infer_param(field: RequestField, hint: Any) -> click.Parameter:
    inner_type = _unwrap_annotated(hint)
    click_type = _PYTHON_TO_CLICK_TYPE.get(inner_type, click.STRING)

    if field.has_default:
        default = field.default
        if inner_type is bool and default is False:
            return click.Option(
                [f"--{field.name.replace('_', '-')}"],
                is_flag=True,
                default=False,
                help=None,
            )
        return click.Option(
            [f"--{field.name.replace('_', '-')}"],
            type=click_type,
            default=default,
            help=None,
        )

    return click.Argument(
        [field.name],
        type=click_type,
    )


def _unwrap_annotated(hint: Any) -> Any:
    if get_origin(hint) is Annotated:
        return get_args(hint)[0]
    return hint


def _is_pydantic_model_type(value: Any) -> TypeGuard[type[BaseModel]]:
    return isinstance(value, type) and issubclass(value, BaseModel)
