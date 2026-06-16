# Core Gateway and Feedback Leaves Carved

## Summary

The clean read-only `pr-address` leaves for gateway contracts, feedback snapshot collection, compact feedback summaries, feedback manifest contracts, and GitHub/manifest mirror schemas now live under `ts/packages/pr-address/src/core/`.

Bootstrap-root compatibility wrappers preserve existing import paths and the old hidden exec surface. Real subprocess-backed GitHub/git adapters, Clinkr command wrappers, payload store/session handling, and stack orchestration remain outside `core` for later strangler rows.

## Objective Impact

The roadmap row for carving cleanly-salvageable leaves into `core/` is complete. `core` now contains only gateway-shaped contracts, pure collection/normalization, summary compaction helpers, and schema leaves; it has no imports from `legacy`, `app`, payload-store/session modules, Clinkr command wrappers, or bootstrap-root orchestration.

Existing `get-feedback` and `summarize-feedback` behavior remains protected by the old scenario/golden tests, with new unit coverage for core review filtering, gateway-shaped snapshot failures, and compact summary construction.

Evidence: targeted import-boundary/core/scenario/gateway tests passed, package-local `@asdl/pr-address` check/test passed, and full TypeScript workspace check/test passed. Local branch evidence is uncommitted working-tree diff against Graphite parent `pr-address-shared-source-files-helper-refactor`.

## Follow-Ups

- Continue with the mixed-file split row: classify-exactly-once cardinality, reply formatting and resolution modes, resolve-decision validation, and body-on-demand lookup.
- Keep real adapter classes and old exec/payload/session orchestration outside `core` until their dedicated legacy/root migration rows.
- When wiring RunEngine `feedback`/`details`/`status`, import the carved core helpers directly rather than reintroducing bootstrap-root wrappers into `app`.
