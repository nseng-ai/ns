"""Explicit builder for the hidden ``objective exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.exec.list_candidates import run_list_candidates
from asdl_objectives.exec.read_objective import run_read_objective
from asdl_objectives.exec.runner_subagent_usage import run_runner_subagent_usage


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by objective skills.",
        operations=[run_list_candidates, run_read_objective, run_runner_subagent_usage],
        hidden=True,
    )
