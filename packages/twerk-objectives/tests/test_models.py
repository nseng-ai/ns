from datetime import UTC, datetime

import pytest

from twerk_objectives.models import (
    Objective,
    ObjectiveDefinition,
    ObjectiveEvent,
    ObjectiveEventAnchor,
    ObjectiveGraph,
    ObjectiveNode,
    ObjectiveRef,
    ObjectiveRoadmapLayout,
    ObjectiveRoadmapSection,
    ObjectiveSnapshot,
)


def _dt() -> datetime:
    return datetime(2026, 4, 3, 12, 0, tzinfo=UTC)


def _definition() -> ObjectiveDefinition:
    return ObjectiveDefinition(
        ref=ObjectiveRef(owner="dagster-io", repo="twerk", issue_number=42),
        title="Port objectives core",
        charter_markdown="# Objective\n\nBuild the objective subsystem.",
        created_at=_dt(),
        created_by="schrockn",
        slug="port-objectives-core",
    )


def _event(event_id: str, *, node_ids: tuple[str, ...] = ()) -> ObjectiveEvent:
    return ObjectiveEvent(
        event_id=event_id,
        created_at=_dt(),
        kind="memory",
        body_markdown=f"Event {event_id}",
        producer="objective-reconciler",
        anchor=ObjectiveEventAnchor(node_ids=node_ids),
    )


def test_graph_rejects_missing_dependencies() -> None:
    with pytest.raises(ValueError, match="depends on missing node ids"):
        ObjectiveGraph(
            nodes=(
                ObjectiveNode(
                    id="1.1",
                    summary="Implement the reconciler",
                    status="pending",
                    depends_on=("0.1",),
                ),
            )
        )


def test_events_relevant_to_node_include_objective_wide_entries() -> None:
    graph = ObjectiveGraph(
        nodes=(
            ObjectiveNode(id="1.1", summary="Build the event log", status="done"),
            ObjectiveNode(
                id="1.2",
                summary="Build reconciliation snapshot updates",
                status="pending",
                depends_on=("1.1",),
            ),
        )
    )
    snapshot = ObjectiveSnapshot(
        version=1,
        graph=graph,
        reconciled_at=_dt(),
        reconciled_by="objective-reconciler",
    )
    objective = Objective(
        definition=_definition(),
        snapshot=snapshot,
        event_log=(
            _event("evt-1"),
            _event("evt-2", node_ids=("1.2",)),
            _event("evt-3", node_ids=("9.9",)),
        ),
    )

    relevant = objective.events_relevant_to_node("1.2")

    assert tuple(event.event_id for event in relevant) == ("evt-1", "evt-2")


def test_snapshot_watermark_controls_incremental_event_view() -> None:
    graph = ObjectiveGraph(
        nodes=(
            ObjectiveNode(id="1.1", summary="Observe repo state", status="done"),
            ObjectiveNode(
                id="1.2",
                summary="Recompute the graph",
                status="in_progress",
                depends_on=("1.1",),
            ),
        )
    )
    snapshot = ObjectiveSnapshot(
        version=3,
        graph=graph,
        reconciled_at=_dt(),
        reconciled_by="objective-reconciler",
        applied_through_event_id="evt-2",
        roadmap_layout=ObjectiveRoadmapLayout(
            sections=(
                ObjectiveRoadmapSection(
                    key="phase-1",
                    title="Phase 1",
                    node_ids=("1.1", "1.2"),
                ),
            )
        ),
    )
    objective = Objective(
        definition=_definition(),
        snapshot=snapshot,
        event_log=(
            _event("evt-1"),
            _event("evt-2"),
            _event("evt-3"),
        ),
    )

    unapplied = objective.events_after(objective.snapshot.applied_through_event_id)

    assert tuple(event.event_id for event in unapplied) == ("evt-3",)


def test_snapshot_watermark_must_reference_existing_event() -> None:
    graph = ObjectiveGraph(
        nodes=(ObjectiveNode(id="1.1", summary="Build the graph", status="pending"),)
    )
    snapshot = ObjectiveSnapshot(
        version=1,
        graph=graph,
        reconciled_at=_dt(),
        reconciled_by="objective-reconciler",
        applied_through_event_id="missing",
    )

    with pytest.raises(ValueError, match="applied_through_event_id"):
        Objective(
            definition=_definition(),
            snapshot=snapshot,
            event_log=(_event("evt-1"),),
        )
