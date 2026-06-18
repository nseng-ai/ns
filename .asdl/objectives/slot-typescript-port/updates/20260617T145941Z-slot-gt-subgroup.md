# Semantic Update: Slot Graphite Subgroup Subset

- Implemented the TypeScript `slot gt` subgroup subset for `up`, `down`, `free-stack`, and hidden `exec stack-branches`.
- Added a package-local read-only `SlotGtGateway` with a real `RealSlotGtGateway` adapter for Graphite plumbing (`gt parent --no-interactive`, `gt children --no-interactive`, `gt trunk --no-interactive`) and Graphite metadata DB stack reads via `sqlite3` JSON output.
- Added a fake `SlotGtGateway` and fake-backed scenario/unit coverage for navigation, free-stack traversal, hidden exec invocation, negative/noop paths, fork handling, and the boundary that plain `slot list` does not require a Graphite gateway.
- Preserved the Graphite dependency boundary by lazily constructing the real gateway only for `slot gt ...` invocations; plain commands do not instantiate it through the real CLI path.
- Deferred hidden `slot gt exec stack-map-branches` as a split follow-up because the prework found no current wired consumer and the branch-context plan explicitly parked it.

Validation run:

```bash
pnpm --dir ts/packages/slot run test
pnpm --dir ts/packages/slot run check
```

Review notes:

- No Python fallback deletion, shell/completion cutover, distribution changes, or Graphite write operations were included.
- The real adapter does not parse human-facing `gt ls`, `gt log`, or `gt branch info` output for topology.
