# Roadmap

## Work

- [ ] Build a discardable end-to-end dashboard prototype as a separate temporary command or screen. Evidence: it proves current-window cmux inventory, branch/slot matching from existing stack-map data, conservative status buckets, details pane, polling/manual refresh, and focus-to-selected-surface behavior.
- [ ] Debrief the prototype and record which data model, rendering shape, and activation behavior should survive.
- [ ] Refactor `sdlcc` into a shared app shell with dashboard and stack-map modes.
- [ ] Implement the real live cmux dashboard as the no-args `sdlcc` default while preserving direct stack-map access.
- [ ] Update `sdlcc` docs/help to describe dashboard-first launch, pinned-first-workspace convention, current-window scope, focus behavior, refresh behavior, and stack-map access.
- [ ] Review and reconcile deferred future-work notes after v1 lands.

## Parked

- [ ] Revisit future dashboard deepening ideas in `future-work.md` after v1 proves the live cmux dashboard.
