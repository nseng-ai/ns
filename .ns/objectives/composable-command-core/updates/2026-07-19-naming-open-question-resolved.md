# Naming Open Question resolved: clinkr(...) combinator, plain names on @nseng-ai/sdk/command

## Summary

The combinator/core-type naming Open Question was resolved in a steered grilling session (no code changes yet):

1. **Combinator name: `clinkr(...)`.** Honest implementation naming over benefit-naming alternatives (`standard(...)`, `structured(...)`, `cli(...)`). clinkr is first-party and already the acknowledged presentation seam; committing clinkr's types as SDK-grade public API is accepted knowingly. ns is unreleased, so a later benefit-rename stays cheap if the coupling ever needs hiding.
2. **Coexistence: same names, new subpath — now.** The composable API exports `defineCommand`, `hostable`, `clinkr` with their plain, unqualified names from a new SDK subpath, because the immediate goal is to judge whether the from-scratch API is great without qualifier-tainted names. The legacy main-surface `defineCommand` (schema + `NsExtensionApi` handler in `ts/packages/sdk/src/sdk/command.ts`) stays untouched.
3. **Subpath: `@nseng-ai/sdk/command`** (`ts/packages/sdk/src/command/`, exports-map entry `"./command"`), beside existing subpaths like `./command-io` and `./cli`.

Deliberate sequencing: legacy name takeover (renaming/removing the old `defineCommand` so the new core owns the name on the main surface) happens only at full-codebase migration time, scoped by the migration verdict — not in this Objective.

Side benefit noted: the subpath is a clean scoping boundary for the no-`ClinkrIo` pressure test — nothing under `src/command/` may import `ClinkrIo`.

## Objective Impact

- `objective.md`: the naming bullet is removed from `## Open Questions`; the decision is recorded as design decision 8.
- `roadmap.md`: the "Ship the composable command API in the SDK" row now carries the settled export surface and subpath; that row is unblocked for implementation.
- The coexistence-entrenchment risk is unchanged but its mitigation is sharper: name takeover is explicitly bound to the migration verdict.

## Follow-Ups

- Implement the API at `ts/packages/sdk/src/command/` per the roadmap row.
- At migration-verdict time, decide the legacy `defineCommand` takeover/rename as part of scoping the remaining `NsExtensionApi` migration.
