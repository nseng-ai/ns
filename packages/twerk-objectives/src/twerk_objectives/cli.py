from __future__ import annotations

from clinkr import ClinkrGroup
from twerk_objectives.commands.list.operation import (
    ObjectiveListRequest,
    ObjectiveListResult,
    run_list_objectives,
)

cli_group = ClinkrGroup("objective", help="Manage objectives.")
cli_group.register_operation(
    "list",
    operation=run_list_objectives,
    request_type=ObjectiveListRequest,
    result_types=(ObjectiveListResult,),
    help="List objectives.",
    aliases=("ls",),
)
