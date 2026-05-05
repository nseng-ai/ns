from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ClinkrModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    def to_json_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


def is_pydantic_model_type(value: Any) -> bool:
    return isinstance(value, type) and issubclass(value, BaseModel)
