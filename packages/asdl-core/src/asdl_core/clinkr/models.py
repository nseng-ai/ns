from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ClinkrModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", serialize_by_alias=True)

    def to_json_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class ClinkrSchemaModel(ClinkrModel):
    """Base for DTOs whose JSON contract includes a field named ``schema``."""

    schema_: str = Field(alias="schema")

    @property
    def schema(self) -> str:
        return self.schema_


def is_pydantic_model_type(value: Any) -> bool:
    return isinstance(value, type) and issubclass(value, BaseModel)
