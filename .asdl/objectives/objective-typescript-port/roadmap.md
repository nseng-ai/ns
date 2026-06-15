# Roadmap

## Work

- [x] Complete the Objective CLI contract inventory.
  - Evidence: `contract-inventory.md` records current command surfaces, skill/Pi/CCC consumers, storage semantics, JSON/Markdown/human output contracts, tests, distribution assumptions, plugin-retirement evidence, and incidental Python details.
- [x] Decide the standalone/plugin/distribution cutover plan from inventory evidence.
  - Decision: target the standalone TypeScript `objective` CLI as the active surface, use a repo-local run-from-source shim by default, and retire `asdl objective` after a final consumer/test review instead of preserving plugin compatibility by default.
  - Evidence: `contract-inventory.md` found skill/Pi/CCC consumers invoking standalone `objective`, not `asdl objective`; the remaining plugin path is a smoke-test compatibility surface to deliberately retire or replace during cutover. `pr-address` provides the closest accepted precedent: standalone TS CLI only, Python plugin retired, in-repo Python deleted after parity/caller migration, and rollback/reference evidence preserved.
- [ ] Build the minimal TypeScript package and first deterministic operation slice.
  - Start with the smallest safe operation after inventory, likely an exec/read-only or list-mode slice that proves checked-in Objective storage and Clinkr envelope behavior.
- [ ] Port remaining operations and hidden exec commands through vertical slices.
- [ ] Migrate callers/install docs and retire Python fallback deliberately.
- [ ] Feed reusable lessons, debt, and final status back into the umbrella Objective.

## Parked

- Objective product redesign beyond preserving current semantics.
- Browser-compatible Objective execution for local git/filesystem-backed workflows.
- Shared foundation extraction before repeated Objective-port seams prove it.
- Creating package context documentation unless explicitly selected as part of this port or a focused context session.
