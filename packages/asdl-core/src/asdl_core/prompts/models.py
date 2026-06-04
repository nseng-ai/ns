"""Models returned by prompt resolution."""

from __future__ import annotations

from pathlib import Path
from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict

PromptSource: TypeAlias = Literal["repo", "embedded_default"]


class PromptProvenance(BaseModel):
    """Origin and customization target for a resolved prompt."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source: PromptSource
    repo_prompt_path: Path
    prompt_path: Path | None = None
    default_name: str | None = None


class PromptResolution(BaseModel):
    """Resolved prompt content plus provenance."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    content: str
    provenance: PromptProvenance
