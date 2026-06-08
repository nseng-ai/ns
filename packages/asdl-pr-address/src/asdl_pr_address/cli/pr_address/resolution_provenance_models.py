"""Pure provenance models for planned PR review-thread resolutions."""

from __future__ import annotations

from functools import cache
from typing import Annotated, Literal

from pydantic import Field, TypeAdapter

from asdl_core.clinkr.models import ClinkrModel

ResolutionProvenanceKind = Literal["local_branch", "pr"]


class LocalBranchResolutionProvenanceInput(ClinkrModel):
    kind: Literal["local_branch"]
    branch: str


class PrResolutionProvenanceInput(ClinkrModel):
    kind: Literal["pr"]
    pr_number: int


ResolutionProvenanceInput = Annotated[
    LocalBranchResolutionProvenanceInput | PrResolutionProvenanceInput,
    Field(discriminator="kind"),
]


class LocalBranchResolutionProvenance(ClinkrModel):
    kind: Literal["local_branch"]
    branch: str
    branch_head_oid: str


class PrResolutionProvenance(ClinkrModel):
    kind: Literal["pr"]
    pr_number: int
    pr_url: str
    pr_state: str
    pr_head_ref_name: str
    pr_head_ref_oid: str | None = None


ResolutionProvenance = Annotated[
    LocalBranchResolutionProvenance | PrResolutionProvenance,
    Field(discriminator="kind"),
]


@cache
def resolution_provenance_input_adapter() -> TypeAdapter[ResolutionProvenanceInput]:
    return TypeAdapter(ResolutionProvenanceInput)
