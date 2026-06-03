"""Framework-neutral payload-store models."""

from __future__ import annotations

from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict

PayloadRole: TypeAlias = Literal["raw", "summary", "log"]
PayloadExtension: TypeAlias = Literal["json", "txt"]


class PayloadReference(BaseModel):
    """Store-owned facts for a written payload artifact."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    payload_path: str
    session_id: str
    descriptor: str
    role: PayloadRole
    created_at_utc: str
    sequence: int
    payload_bytes: int
    content_type: str
    extension: PayloadExtension
