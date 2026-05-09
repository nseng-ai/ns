"""Explicit builder for the hidden ``objective exec`` CLI subgroup."""

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.exec.attach import run_attach_objective
from asdl_objectives.exec.create import run_create_objective
from asdl_objectives.exec.current import run_current_objective
from asdl_objectives.exec.digest import run_digest_objective
from asdl_objectives.exec.next_collision import run_next_collision_objective
from asdl_objectives.exec.next_context import run_next_context_objective
from asdl_objectives.exec.reconcile_apply import run_reconcile_apply_objective
from asdl_objectives.exec.reconcile_diff import run_reconcile_diff_objective
from asdl_objectives.exec.reconcile_plan import run_reconcile_plan_objective
from asdl_objectives.exec.reconcile_summary import run_reconcile_summary_objective
from asdl_objectives.exec.record_evidence import run_record_evidence_objective
from asdl_objectives.exec.update_precheck import run_update_precheck_objective


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by skills (not interactive users).",
        operations=[
            run_digest_objective,
            run_current_objective,
            run_update_precheck_objective,
            run_next_context_objective,
            run_next_collision_objective,
            run_record_evidence_objective,
            run_reconcile_plan_objective,
            run_reconcile_summary_objective,
            run_reconcile_diff_objective,
            run_reconcile_apply_objective,
            run_attach_objective,
            run_create_objective,
        ],
        hidden=True,
    )
