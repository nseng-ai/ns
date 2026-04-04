"""Core objective data model.

The objective system is built around a reconciliation loop, not a static plan.

An objective has three canonical pieces of state:

1. A stable definition or charter.
   This is the long-lived intent for the work, typically backed by a GitHub
   issue and its primary authored content.
2. An append-only event log.
   Multiple processes may write events into this log. Some events will be
   emitted as marked GitHub comments, others may come from automation, CI,
   hooks, or manual operators. The event envelope is intentionally small and
   stable so the log can act as a flexible platform boundary.
3. A current reconciled snapshot.
   At every tick, the system can combine the prior snapshot, new events, and
   fresh observations from the codebase or GitHub to produce a new canonical
   objective graph. The graph is allowed to change substantially when reality
   changes: new prerequisite work can appear, nodes can be removed, and
   dependencies can be reshaped.

The objective graph is the canonical mutable representation of the work.
Roadmaps are derived projections of the graph plus lightweight layout hints.
This keeps the architecture aligned with the real planning problem: the work
structure is primary, while the roadmap is a human-facing rendering.

The event log is also the durable memory substrate for the objective. It can
carry lessons learned, design rationale, decisions, invalidated assumptions,
and other context that should inform future reconciliation or implementation
session seeding. Those entries are represented as ordinary events with a free
form markdown body rather than a heavily normalized schema. Humans and language
models are the primary consumers, so the data model preserves flexibility.

This module deliberately stops at the domain boundary. It does not define:

- GitHub storage adapters
- roadmap rendering
- reconciliation algorithms
- session seed projection

Those concerns should sit on top of these types.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

ObjectiveNodeStatus = Literal[
    "pending",
    "planning",
    "in_progress",
    "done",
    "blocked",
    "skipped",
]

ObjectiveLifecycleState = Literal["open", "closed"]


@dataclass(frozen=True)
class ObjectiveRef:
    """Stable identity for an objective backed by a GitHub issue."""

    owner: str
    repo: str
    issue_number: int


@dataclass(frozen=True)
class ObjectiveDefinition:
    """Stable charter for an objective.

    The charter should change rarely. It captures the durable intent of the
    work, while the graph and event log capture the evolving reality.
    """

    ref: ObjectiveRef
    title: str
    charter_markdown: str
    created_at: datetime
    created_by: str
    slug: str | None = None

    def __post_init__(self) -> None:
        _require_non_empty(self.title, "title")
        _require_non_empty(self.charter_markdown, "charter_markdown")
        _require_non_empty(self.created_by, "created_by")
        _require_timezone(self.created_at, "created_at")


@dataclass(frozen=True)
class ObjectiveNodeLink:
    """Reference from a node to an external artifact."""

    kind: str
    target: str
    label: str | None = None
    url: str | None = None

    def __post_init__(self) -> None:
        _require_non_empty(self.kind, "kind")
        _require_non_empty(self.target, "target")


@dataclass(frozen=True)
class ObjectiveNode:
    """Canonical work item in the objective graph."""

    id: str
    summary: str
    status: ObjectiveNodeStatus
    depends_on: tuple[str, ...] = ()
    slug: str | None = None
    links: tuple[ObjectiveNodeLink, ...] = ()

    def __post_init__(self) -> None:
        _require_non_empty(self.id, "id")
        _require_non_empty(self.summary, "summary")

        if len(set(self.depends_on)) != len(self.depends_on):
            raise ValueError(f"Node '{self.id}' has duplicate dependencies")

        if self.id in self.depends_on:
            raise ValueError(f"Node '{self.id}' cannot depend on itself")

    @property
    def is_terminal(self) -> bool:
        return self.status in {"done", "skipped"}


@dataclass(frozen=True)
class ObjectiveGraph:
    """Canonical mutable graph for the current state of the work."""

    nodes: tuple[ObjectiveNode, ...]

    def __post_init__(self) -> None:
        node_ids = tuple(node.id for node in self.nodes)
        if len(set(node_ids)) != len(node_ids):
            raise ValueError("Objective graph node ids must be unique")

        known_ids = set(node_ids)
        for node in self.nodes:
            missing = [dep for dep in node.depends_on if dep not in known_ids]
            if missing:
                missing_csv = ", ".join(missing)
                raise ValueError(f"Node '{node.id}' depends on missing node ids: {missing_csv}")

    def node_map(self) -> dict[str, ObjectiveNode]:
        return {node.id: node for node in self.nodes}

    def get_node(self, node_id: str) -> ObjectiveNode | None:
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_open_nodes(self) -> tuple[ObjectiveNode, ...]:
        return tuple(node for node in self.nodes if not node.is_terminal)


@dataclass(frozen=True)
class ObjectiveRoadmapSection:
    """Render hint for grouping nodes into a roadmap projection."""

    key: str
    title: str
    node_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        _require_non_empty(self.key, "key")
        _require_non_empty(self.title, "title")

        if len(set(self.node_ids)) != len(self.node_ids):
            raise ValueError(f"Roadmap section '{self.key}' contains duplicate node ids")


@dataclass(frozen=True)
class ObjectiveRoadmapLayout:
    """Lightweight ordering and grouping hints for roadmap rendering."""

    sections: tuple[ObjectiveRoadmapSection, ...] = ()

    def __post_init__(self) -> None:
        keys = tuple(section.key for section in self.sections)
        if len(set(keys)) != len(keys):
            raise ValueError("Roadmap section keys must be unique")

    def get_ordered_node_ids(self) -> tuple[str, ...]:
        return tuple(node_id for section in self.sections for node_id in section.node_ids)


@dataclass(frozen=True)
class ObjectiveEventAnchor:
    """Optional scope hint for an objective event.

    An empty ``node_ids`` tuple means the event applies to the objective as a
    whole. Specific node ids anchor the event to related work items without
    forcing the event body into a rigid schema.
    """

    node_ids: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if len(set(self.node_ids)) != len(self.node_ids):
            raise ValueError("Objective event anchors must not repeat node ids")

    @property
    def is_objective_wide(self) -> bool:
        return not self.node_ids

    def applies_to_node(self, node_id: str) -> bool:
        return self.is_objective_wide or node_id in self.node_ids


@dataclass(frozen=True)
class ObjectiveEventSource:
    """Provenance reference for an objective event."""

    system: str
    identifier: str
    url: str | None = None
    actor: str | None = None

    def __post_init__(self) -> None:
        _require_non_empty(self.system, "system")
        _require_non_empty(self.identifier, "identifier")


@dataclass(frozen=True)
class ObjectiveEvent:
    """Append-only event in the objective log.

    ``kind`` intentionally remains an open string taxonomy. Producers should be
    able to emit new event kinds without requiring a schema migration in the
    core objective model.
    """

    event_id: str
    created_at: datetime
    kind: str
    body_markdown: str
    producer: str
    anchor: ObjectiveEventAnchor = field(default_factory=ObjectiveEventAnchor)
    source_refs: tuple[ObjectiveEventSource, ...] = ()
    idempotency_key: str | None = None

    def __post_init__(self) -> None:
        _require_non_empty(self.event_id, "event_id")
        _require_non_empty(self.kind, "kind")
        _require_non_empty(self.body_markdown, "body_markdown")
        _require_non_empty(self.producer, "producer")
        _require_timezone(self.created_at, "created_at")


@dataclass(frozen=True)
class ObjectiveSnapshot:
    """Current reconciled state of the objective."""

    version: int
    graph: ObjectiveGraph
    reconciled_at: datetime
    reconciled_by: str
    applied_through_event_id: str | None = None
    lifecycle_state: ObjectiveLifecycleState = "open"
    roadmap_layout: ObjectiveRoadmapLayout | None = None

    def __post_init__(self) -> None:
        if self.version < 1:
            raise ValueError("Snapshot version must be at least 1")

        _require_timezone(self.reconciled_at, "reconciled_at")
        _require_non_empty(self.reconciled_by, "reconciled_by")

        if self.roadmap_layout is None:
            return

        known_ids = {node.id for node in self.graph.nodes}
        ordered_ids = self.roadmap_layout.get_ordered_node_ids()
        if len(set(ordered_ids)) != len(ordered_ids):
            raise ValueError("Roadmap layout cannot render the same node more than once")

        missing = [node_id for node_id in ordered_ids if node_id not in known_ids]
        if missing:
            missing_csv = ", ".join(missing)
            raise ValueError(f"Roadmap layout references missing node ids: {missing_csv}")


@dataclass(frozen=True)
class Objective:
    """Full objective aggregate."""

    definition: ObjectiveDefinition
    snapshot: ObjectiveSnapshot
    event_log: tuple[ObjectiveEvent, ...] = ()

    def __post_init__(self) -> None:
        event_ids = tuple(event.event_id for event in self.event_log)
        if len(set(event_ids)) != len(event_ids):
            raise ValueError("Objective event ids must be unique")

        if self.snapshot.applied_through_event_id is None:
            return

        if self.snapshot.applied_through_event_id not in event_ids:
            raise ValueError(
                "Snapshot applied_through_event_id must reference an event in event_log"
            )

    def events_after(self, event_id: str | None) -> tuple[ObjectiveEvent, ...]:
        """Return the suffix of events after a known event id.

        ``None`` means "all events". This is convenient when feeding a
        reconciler with the delta since the last applied watermark.
        """

        if event_id is None:
            return self.event_log

        seen = False
        remaining: list[ObjectiveEvent] = []
        for event in self.event_log:
            if seen:
                remaining.append(event)
            elif event.event_id == event_id:
                seen = True

        if not seen:
            raise ValueError(f"Unknown event id: {event_id}")

        return tuple(remaining)

    def events_relevant_to_node(self, node_id: str) -> tuple[ObjectiveEvent, ...]:
        return tuple(event for event in self.event_log if event.anchor.applies_to_node(node_id))


def _require_non_empty(value: str, field_name: str) -> None:
    if not value.strip():
        raise ValueError(f"{field_name} must not be empty")


def _require_timezone(value: datetime, field_name: str) -> None:
    if value.tzinfo is None:
        raise ValueError(f"{field_name} must be timezone-aware")


def utc_now() -> datetime:
    """Small convenience for callers building test or seed objects."""

    return datetime.now(tz=UTC)
