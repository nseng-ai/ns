# Layered (foundational) roadmap

## What it is

Item 1 builds a **substrate** — a new abstraction, a new module, a new data
model — that nothing uses yet. Later items build on it, migrate callers over,
or extend it. The substrate is valuable on its own as infrastructure even
before anything depends on it.

## When to use it

- Building a new abstraction layer that will eventually replace or supplement
  an existing one.
- Introducing a new data model, protocol, or interface that other work will
  sit on top of.
- The work genuinely cannot be sliced end-to-end because there is no "end" yet
  — the end is what you're building.

## When NOT to use it

- There is already a path through the system you could thread — use
  `steelthread.md`.
- The "substrate" is a mechanical restructuring of existing code — use
  `incremental-refactor.md`.
- You're tempted to use this pattern because steelthread feels hard. Revisit
  whether a thin slice really is impossible.

## Item 1 guidance

Item 1 is the **substrate itself**, not a consumer. It should be useful in
isolation: unit-tested, type-checked, documented. Resist the urge to build the
first consumer inside item 1 — that muddies the layer boundary.

## Example

Objective: "Introduce a `PlanGateway` abstraction that will eventually replace
the ad-hoc plan-reading scattered across the codebase."

1. Define `PlanGateway` ABC in `src/twerk/gateways/plan.py`, plus
   `FakePlanGateway` and `RealPlanGateway` implementations. Unit tests cover
   both. No callers migrated yet.
2. Migrate `twerk plan show` to use `PlanGateway`.
3. Migrate `twerk plan list` to use `PlanGateway`.
4. Migrate the remaining ad-hoc plan readers; delete the old helpers.
