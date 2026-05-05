from __future__ import annotations

from typing import Any

from asdl_core.clinkr.serialization import output_json_schema, request_json_schema


def build_json_schema_document(
    *,
    request_type: type,
    result_type: Any,
) -> dict[str, Any]:
    return {
        "input_json_schema": request_json_schema(request_type),
        "output_json_schema": output_json_schema(result_type),
    }
