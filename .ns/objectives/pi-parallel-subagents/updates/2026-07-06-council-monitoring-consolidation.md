# 2026-07-06 — Thermo-council monitoring/runtime consolidation

Thermo-council monitoring consolidation was adapted to the current code shape instead of the earlier package-extraction variant:

- Thermo-council remains a subpackage of `@internal/pi-tools`; no new `@nseng-ai/ns-pi-thermo-council` package was added.
- `@nseng-ai/ns-pi-subagents` now exposes a curated `@nseng-ai/ns-pi-subagents/api` runtime/fleet surface for first-party Pi extensions.
- Thermo-council reviewer seats and final synthesis publish to the shared generic agents fleet (`/ns:agents:fleet`, `ns.agents.fleet`) rather than council-specific command/widget names.
- Council orchestration, schemas, prompt construction, payload repair, and report rendering remain council-local. Shared code is limited to the runtime seam, runner result/update types, transcript helpers, and fleet monitoring/visibility.
- The motivation is observed fleet/council progress UX duplication and the already-generic fleet machinery, not a third-caller trigger for shared higher-level orchestration.

This keeps the roadmap's parked higher-level orchestration decision intact while un-parking only monitoring/runtime integration through explicit API boundaries.
