from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ClinkrModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", serialize_by_alias=True)


class ClinkrJsonSchemaModel(ClinkrModel):
    """Base for DTOs whose JSON contract includes a ``json_schema`` field."""

    json_schema: str
