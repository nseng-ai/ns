"""Explicit builder for the hidden ``objective exec`` CLI subgroup."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_objectives.exec.absorb_patches import run_absorb_patches_objective
from twerk_objectives.exec.claim_apply import run_claim_apply_objective
from twerk_objectives.exec.claim_plan import run_claim_plan_objective
from twerk_objectives.exec.create import run_create_objective
from twerk_objectives.exec.current import run_current_objective
from twerk_objectives.exec.digest import run_digest_objective
from twerk_objectives.exec.reconcile_apply import run_reconcile_apply_objective
from twerk_objectives.exec.reconcile_diff import run_reconcile_diff_objective
from twerk_objectives.exec.reconcile_plan import run_reconcile_plan_objective
from twerk_objectives.exec.reconcile_summary import run_reconcile_summary_objective
from twerk_objectives.exec.update_precheck import run_update_precheck_objective


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by skills (not interactive users).",
        operations=[
            run_digest_objective,
            run_current_objective,
            run_update_precheck_objective,
            run_absorb_patches_objective,
            run_reconcile_plan_objective,
            run_reconcile_summary_objective,
            run_reconcile_diff_objective,
            run_reconcile_apply_objective,
            run_claim_plan_objective,
            run_claim_apply_objective,
            run_create_objective,
        ],
        hidden=True,
    )
