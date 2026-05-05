from __future__ import annotations

import types
from typing import Annotated, Any, TypeGuard, Union, cast, get_args, get_origin

from pydantic import BaseModel, TypeAdapter


def serialize_to_json_dict(result: Any) -> dict[str, Any]:
    if not isinstance(result, BaseModel):
        raise TypeError(f"Cannot serialize result of type {type(result).__name__}")

    dumped = result.model_dump(mode="json")
    if not isinstance(dumped, dict):
        raise TypeError(
            f"Cannot serialize result of type {type(result).__name__}: "
            "model_dump(mode='json') did not produce an object"
        )
    return cast(dict[str, Any], dumped)


def request_schema(request_type: type) -> dict[str, Any]:
    if not _is_pydantic_model_type(request_type):
        raise TypeError(
            f"request type {request_type.__name__} must be a Pydantic BaseModel subclass"
        )
    return request_type.model_json_schema()


def output_schema(output_type: Any) -> dict[str, Any]:
    if _is_pydantic_model_type(output_type):
        return output_type.model_json_schema()
    return TypeAdapter(output_type).json_schema()


def is_pydantic_output_type(output_type: Any) -> bool:
    if _is_pydantic_model_type(output_type):
        return True

    origin = get_origin(output_type)
    if origin is Annotated:
        return is_pydantic_output_type(get_args(output_type)[0])

    if origin is types.UnionType or origin is Union:
        return all(is_pydantic_output_type(arg) for arg in get_args(output_type))

    return False


def _is_pydantic_model_type(value: Any) -> TypeGuard[type[BaseModel]]:
    return isinstance(value, type) and issubclass(value, BaseModel)
