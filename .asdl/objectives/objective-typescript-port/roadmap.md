# Roadmap

## Work

- [x] Complete the Objective CLI contract inventory.
  - Evidence: `contract-inventory.md` records current command surfaces, skill/Pi/CCC consumers, storage semantics, JSON/Markdown/human output contracts, tests, distribution assumptions, plugin-retirement evidence, and incidental Python details.
- [ ] Decide the standalone/plugin/distribution cutover plan from inventory evidence.
  - Default: standalone TypeScript source shim; likely retire `asdl objective` plugin after consumer evidence and compatibility review.
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
