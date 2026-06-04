# Explicit Grill-Me Routing

## Summary

Updated `repo-ontology` runner guidance so plan-first context work explicitly invokes the `grill-me` skill for terminology and readback decisions. `grill-with-docs` remains the route when the confirmed grilling session should update documentation inline.

## Objective Impact

- `objective.md`: context-writing expectations and Runner Policy now name `grill-me` directly for focused planning/readback work, while preserving `grill-with-docs` for inline documentation sessions.
- `roadmap.md`: the standing operating direction now tells `objective-next` to ask for yes/no confirmation before starting a `grill-me` planning/readback session when a concrete source-backed implementation plan does not yet exist.

## Follow-Ups

- Future `objective-next` recommendations for Phase 5 and later package-context slices should route plan-first terminology, context-surface, ambiguity, or scope decisions through `grill-me` explicitly.
