from __future__ import annotations

from typing import Any

from asdl_core.clinkr.dataclass_json import output_schema, request_schema


def build_json_schema_document(
    *,
    request_type: type,
    output_types: tuple[type, ...],
) -> dict[str, Any]:
    return {
        "input_schema": request_schema(request_type),
        "output_schema": output_schema(output_types),
    }
