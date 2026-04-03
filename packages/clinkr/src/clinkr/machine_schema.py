from __future__ import annotations

from typing import Any

from clinkr.dataclass_json import ERROR_SCHEMA, output_schema, request_schema


def build_machine_schema_document(
    *,
    request_type: type,
    output_types: tuple[type, ...],
) -> dict[str, Any]:
    return {
        "input_schema": request_schema(request_type),
        "output_schema": output_schema(output_types),
        "error_schema": ERROR_SCHEMA,
    }
