# Project Documentation

Start here before broad documentation searches. This directory collects cross-package design notes and system behavior docs; package-local usage belongs with the package that owns it.

## Where to Put Documentation

- `CONTEXT.md`: durable domain language and repo-wide conceptual grounding.
- `docs/`: cross-package design docs, system behavior, and contributor-facing documentation topology.
- `packages/<pkg>/README.md`: package-specific usage, public CLI notes, and package-local entrypoints.
- `skills/<name>/SKILL.md`: user-facing agent procedure. Public skills should describe CLI operations and avoid implementation internals.
- `.asdl/objectives/<slug>/`: durable Objective narrative, roadmap, updates, and closure.
- `docs/adr/`: future home for durable architecture decisions if/when ADRs are introduced.

## Index

- [Objective system](objective-system.md): how checked-in Objectives structure durable project work.
- [Branch retrospective evidence](aretro.md): deterministic session evidence aggregation and the tool-vs-LM boundary.
- [Pi docs](pi/README.md): Pi-specific notes used by this repo.
- [GitHub gateway conformance fixtures](github-gateway-conformance-fixtures.md): live GitHub fixture policy.
- [Slot co-autocomplete plan](slot-co-autocomplete-plan.md): slot autocomplete design notes.

Agents should consult this README first, then follow the narrowest relevant link instead of scanning the whole repository.
