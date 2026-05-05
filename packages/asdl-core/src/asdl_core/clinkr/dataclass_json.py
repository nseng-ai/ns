from __future__ import annotations

import dataclasses
import json
import sys
import types
from dataclasses import fields
from typing import Any, Literal, Union, cast, get_args, get_origin

from pydantic import BaseModel

_PYTHON_TYPE_MAP: dict[type, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
}


def python_type_to_json_schema(type_hint: Any) -> dict[str, Any]:
    if type_hint in _PYTHON_TYPE_MAP:
        return {"type": _PYTHON_TYPE_MAP[type_hint]}

    origin = get_origin(type_hint)
    args = get_args(type_hint)

    if origin is Literal:
        return {"type": "string", "enum": list(args)}

    if origin is types.UnionType or origin is Union:
        if type(None) in args:
            non_none = [arg for arg in args if arg is not type(None)]
            if len(non_none) == 1:
                inner_schema = python_type_to_json_schema(non_none[0])
                inner_type = inner_schema.get("type")
                if isinstance(inner_type, str):
                    return {"type": [inner_type, "null"]}
                return inner_schema
        return {"type": "string"}

    if origin is tuple and len(args) == 2 and args[1] is Ellipsis:
        return {"type": "array", "items": python_type_to_json_schema(args[0])}

    if origin is list and len(args) == 1:
        return {"type": "array", "items": python_type_to_json_schema(args[0])}

    if origin is dict:
        return {"type": "object"}

    return {"type": "string"}


def request_schema(request_type: type) -> dict[str, Any]:
    if isinstance(request_type, type) and issubclass(request_type, BaseModel):
        return request_type.model_json_schema()

    properties: dict[str, Any] = {}
    required: list[str] = []

    for field in fields(request_type):
        properties[field.name] = python_type_to_json_schema(field.type)
        has_default = field.default is not dataclasses.MISSING
        has_factory = field.default_factory is not dataclasses.MISSING
        if not has_default and not has_factory:
            required.append(field.name)

    return {
        "type": "object",
        "properties": properties,
        "required": sorted(required),
    }


def output_schema(output_types: tuple[type, ...]) -> dict[str, Any]:
    if not output_types:
        return {"type": "object", "properties": {}, "required": []}

    schemas = [_single_output_schema(output_type) for output_type in output_types]
    if len(schemas) == 1:
        return schemas[0]
    return {"oneOf": schemas}


def parse_dataclass_from_json(cls: type, data: dict[str, Any]) -> Any:
    from_json = getattr(cls, "from_json_dict", None)
    if from_json is not None:
        return from_json(data)
    return _build_dataclass_request(cls, data)


class JsonSerializable:
    """Marker mixin for clinkr result types.

    Subclasses must be dataclasses. The default `to_json_dict` mirrors
    `dataclasses.asdict(self)`; override for custom shape (added or
    omitted fields, flattening, conditional output, etc.).
    """

    def to_json_dict(self) -> dict[str, Any]:
        # Contract: subclasses must be dataclasses (see docstring). asdict's
        # type stub requires DataclassInstance; mixin can't express that.
        return dataclasses.asdict(cast(Any, self))


def serialize_to_json_dict(result: Any) -> dict[str, Any]:
    if isinstance(result, BaseModel):
        return result.model_dump(mode="json")
    if isinstance(result, JsonSerializable):
        return result.to_json_dict()
    raise TypeError(f"Cannot serialize result of type {type(result).__name__}")


def read_json_stdin() -> dict[str, Any] | None:
    if sys.stdin.isatty():
        return None

    raw = sys.stdin.read()
    if not raw.strip():
        return None

    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("JSON input must be an object")
    return data


def _single_output_schema(output_type: type) -> dict[str, Any]:
    if isinstance(output_type, type) and issubclass(output_type, BaseModel):
        return output_type.model_json_schema()

    json_schema_method = getattr(output_type, "json_schema", None)
    if json_schema_method is not None:
        return json_schema_method()

    if not dataclasses.is_dataclass(output_type):
        raise TypeError(
            "Cannot generate schema for "
            f"{output_type.__name__}: not a dataclass and no json_schema()"
        )

    properties: dict[str, Any] = {}
    required: list[str] = []
    for field in fields(output_type):
        properties[field.name] = python_type_to_json_schema(field.type)
        required.append(field.name)

    return {
        "type": "object",
        "properties": properties,
        "required": sorted(required),
    }


def _build_dataclass_request(request_type: type, data: dict[str, Any]) -> Any:
    valid_fields = {field.name: field for field in fields(request_type)}

    for key in data:
        if key not in valid_fields:
            valid_names = ", ".join(sorted(valid_fields))
            raise ValueError(f"Unknown field: {key}. Valid fields: {valid_names}")

    kwargs: dict[str, Any] = {}
    for name, field in valid_fields.items():
        if name in data:
            kwargs[name] = _coerce_json_value(data[name], field.type)
            continue

        if field.default is not dataclasses.MISSING:
            kwargs[name] = field.default
            continue

        if field.default_factory is not dataclasses.MISSING:
            kwargs[name] = field.default_factory()
            continue

        required_names = ", ".join(
            sorted(
                fname
                for fname, f in valid_fields.items()
                if f.default is dataclasses.MISSING and f.default_factory is dataclasses.MISSING
            )
        )
        raise ValueError(f"Missing required field: {name}. Required fields: {required_names}")

    return request_type(**kwargs)


def _coerce_json_value(value: Any, target_type: Any) -> Any:
    origin = get_origin(target_type)
    args = get_args(target_type)

    if origin is Literal:
        if value not in args:
            raise ValueError(f"Invalid value {value!r}, expected one of {args}")
        return value

    if origin is tuple and len(args) == 2 and args[1] is Ellipsis:
        if not isinstance(value, list):
            raise ValueError(f"Expected array, got {type(value).__name__}")
        return tuple(_coerce_json_value(item, args[0]) for item in value)

    if origin is list and len(args) == 1:
        if not isinstance(value, list):
            raise ValueError(f"Expected array, got {type(value).__name__}")
        return [_coerce_json_value(item, args[0]) for item in value]

    if origin is dict:
        if not isinstance(value, dict):
            raise ValueError(f"Expected object, got {type(value).__name__}")
        return value

    if origin is types.UnionType or origin is Union:
        if value is None and type(None) in args:
            return None

        non_none = [arg for arg in args if arg is not type(None)]
        if len(non_none) == 1:
            return _coerce_json_value(value, non_none[0])
        return value

    if target_type is bool:
        if isinstance(value, bool):
            return value
        raise ValueError(f"Expected boolean, got {type(value).__name__}")

    if target_type is int:
        if isinstance(value, bool):
            raise ValueError("Expected integer, got boolean")
        if isinstance(value, int):
            return value
        raise ValueError(f"Expected integer, got {type(value).__name__}")

    if target_type is float:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        raise ValueError(f"Expected number, got {type(value).__name__}")

    if target_type is str:
        if isinstance(value, str):
            return value
        raise ValueError(f"Expected string, got {type(value).__name__}")

    return value
