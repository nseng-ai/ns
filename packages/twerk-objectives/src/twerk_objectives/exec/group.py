"""Explicit builder for the hidden ``objective exec`` CLI subgroup."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_objectives.exec.current import run_current_objective
from twerk_objectives.exec.digest import run_digest_objective
from twerk_objectives.exec.update_precheck import run_update_precheck_objective


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by skills (not interactive users).",
        operations=[run_digest_objective, run_current_objective, run_update_precheck_objective],
        hidden=True,
    )
