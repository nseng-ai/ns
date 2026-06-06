"""Explicit builder for the hidden ``roaster stack exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.stack.exec.compute_branch_name import compute_branch_name_command
from roaster.cli.roaster.stack.exec.order_batches import order_batches_command
from roaster.cli.roaster.stack.exec.record_batch import record_batch_command
from roaster.cli.roaster.stack.exec.record_triage import record_triage_command
from roaster.cli.roaster.stack.exec.render_dashboard import render_dashboard_command


def build_stack_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands used by the skill-first roaster stack workflow.",
        hidden=True,
        operations=[
            record_triage_command,
            order_batches_command,
            record_batch_command,
            compute_branch_name_command,
            render_dashboard_command,
        ],
    )
