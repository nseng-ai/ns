"""Explicit builder for the hidden ``aretro exec`` CLI subgroup."""

from __future__ import annotations

from aretro.exec.collect_evidence import run_collect_evidence
from aretro.exec.read_evidence_detail import run_read_evidence_detail
from asdl_core.clinkr.group import ClinkrGroup


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by branch retrospective skills.",
        operations=[run_collect_evidence, run_read_evidence_detail],
        hidden=True,
    )
