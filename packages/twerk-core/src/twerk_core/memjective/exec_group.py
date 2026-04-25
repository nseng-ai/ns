"""Explicit builder for the `memjective exec` subgroup."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.memjective.exec_compute_pending_entries import run_exec_compute_pending_entries
from twerk_core.memjective.exec_init import run_exec_init
from twerk_core.memjective.exec_record_entry import run_exec_record_entry


def build_memjective_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Lower-level state-mutation primitives for memjective state.json blobs.",
        operations=[run_exec_init, run_exec_record_entry, run_exec_compute_pending_entries],
    )
